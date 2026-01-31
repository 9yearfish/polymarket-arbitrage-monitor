/**
 * Polymarket套利监控器 - 基于官方Node.js SDK
 * 
 * 实时监控Polymarket市场上的YES+NO<1的套利机会，
 * 使用WebSocket实时接收价格更新。
 */

const WebSocket = require('ws');
const colors = require('colors/safe');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const dotenv = require('dotenv');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// 加载环境变量
dotenv.config();

// 配置常量
const THRESHOLD = parseFloat(process.env.THRESHOLD || 0.99);
const MIN_LIQUIDITY = parseFloat(process.env.MIN_LIQUIDITY || 10.0);
const ESTIMATED_FEE = parseFloat(process.env.ESTIMATED_FEE || 0.02);
const CSV_PATH = process.env.CSV_PATH || './data/opportunities.csv';

// 确保CSV目录存在
const csvDir = path.dirname(CSV_PATH);
if (!fs.existsSync(csvDir)) {
  fs.mkdirSync(csvDir, { recursive: true });
}

// 初始化CSV写入器
const csvWriter = createCsvWriter({
  path: CSV_PATH,
  header: [
    { id: 'timestamp', title: 'TIMESTAMP' },
    { id: 'marketId', title: 'MARKET_ID' },
    { id: 'conditionId', title: 'CONDITION_ID' },
    { id: 'title', title: 'TITLE' },
    { id: 'yesPrice', title: 'YES_PRICE' },
    { id: 'noPrice', title: 'NO_PRICE' },
    { id: 'totalPrice', title: 'TOTAL_PRICE' },
    { id: 'potentialProfit', title: 'POTENTIAL_PROFIT' },
    { id: 'minLiquidity', title: 'MIN_LIQUIDITY' },
    { id: 'yesTokenId', title: 'YES_TOKEN_ID' },
    { id: 'noTokenId', title: 'NO_TOKEN_ID' }
  ],
  append: fs.existsSync(CSV_PATH) // 如果文件存在，追加而不是覆盖
});

// 不再使用SDK客户端

// 市场数据缓存
const marketCache = new Map(); // marketId -> market
const priceCache = new Map();  // marketId -> {yes: price, no: price}
const tokenIdToMarket = new Map(); // tokenId -> marketId

// 已通知的机会
const notifiedOpportunities = new Set();

// 运行统计
const stats = {
  messagesReceived: 0,
  priceUpdates: 0,
  arbitrageChecks: 0,
  opportunitiesFound: 0,
  startTime: Date.now()
};

/**
 * 检测API延迟
 */
async function checkLatency() {
  try {
    const startTime = Date.now();
    const response = await fetch('https://gamma-api.polymarket.com/events?limit=1');
    const endTime = Date.now();
    
    if (response.ok) {
      const latency = endTime - startTime;
      console.log(colors.cyan(`API 延迟: ${latency}ms`));
      return latency;
    }
  } catch (error) {
    console.log(colors.yellow('无法检测API延迟'));
  }
  return null;
}

/**
 * 加载所有市场数据并更新缓存
 */
async function loadMarkets() {
  console.log(colors.cyan('正在加载市场数据...'));
  
  try {
    // 使用API获取事件数据（包含市场）- 添加超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
    
    const startTime = Date.now();
    const response = await fetch('https://gamma-api.polymarket.com/events?closed=false&limit=50', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const loadTime = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`获取市场数据失败: ${response.status}`);
    }
    
    console.log(colors.gray(`正在解析市场数据... (耗时: ${loadTime}ms)`));
    const events = await response.json();
    
    if (!Array.isArray(events)) {
      throw new Error('市场数据格式不正确，预期应为数组');
    }
    
    // 清空缓存
    marketCache.clear();
    tokenIdToMarket.clear();
    
    // 处理市场数据
    const processedMarkets = [];
    
    // 从events中提取markets
    for (const event of events) {
      if (!event.markets || !Array.isArray(event.markets)) {
        continue;
      }
      
      for (const market of event.markets) {
        // 跳过已关闭的市场
        if (market.closed) {
          continue;
        }
        
        if (!market.clobTokenIds) {
          continue; // 跳过无效市场
        }
        
        // 解析 clobTokenIds（它是 JSON 字符串！）
        let tokenIds;
        try {
          tokenIds = JSON.parse(market.clobTokenIds);
          if (!tokenIds || tokenIds.length < 2) {
            continue;
          }
        } catch (e) {
          continue;
        }
        
        // 解析价格数据（从 Gamma API 返回的数据中）
        let yesPrice = 0;
        let noPrice = 0;
        
        try {
          const prices = JSON.parse(market.outcomePrices);
          yesPrice = parseFloat(prices[0]);
          noPrice = parseFloat(prices[1]);
        } catch (e) {
          // 如果没有 outcomePrices，跳过这个市场
          continue;
        }
        
        // 创建规范化的市场对象（使用解析后的 tokenIds）
        const processedMarket = {
          marketId: market.id,
          conditionId: market.conditionId,
          title: market.question || event.title || `Market ${market.id}`,
          yesPrice: yesPrice,
          noPrice: noPrice,
          outcomesInfo: [
            { 
              tokenId: tokenIds[0], 
              name: 'YES',
              price: yesPrice
            },
            { 
              tokenId: tokenIds[1],
              name: 'NO',
              price: noPrice
            }
          ]
        };
        
        // 存储到缓存
        marketCache.set(processedMarket.marketId, processedMarket);
        
        // 映射tokenId到marketId
        tokenIdToMarket.set(processedMarket.outcomesInfo[0].tokenId, processedMarket.marketId);
        tokenIdToMarket.set(processedMarket.outcomesInfo[1].tokenId, processedMarket.marketId);
        
        processedMarkets.push(processedMarket);
        
        // 立即检查套利机会
        const totalPrice = yesPrice + noPrice;
        if (totalPrice < THRESHOLD && totalPrice > 0) {
          const estimatedFee = totalPrice * ESTIMATED_FEE;
          const potentialProfit = 1 - totalPrice - estimatedFee;
          
          if (potentialProfit > 0) {
            const opportunity = {
              timestamp: new Date().toISOString(),
              marketId: processedMarket.marketId,
              conditionId: processedMarket.conditionId,
              title: processedMarket.title,
              yesPrice: yesPrice,
              noPrice: noPrice,
              totalPrice: totalPrice,
              potentialProfit: potentialProfit,
              minLiquidity: market.liquidityNum || 0,
              yesTokenId: tokenIds[0],
              noTokenId: tokenIds[1]
            };
            
            notifyOpportunity(opportunity);
          }
        }
      }
    }
    
    console.log(colors.green(`已加载 ${processedMarkets.length} 个市场`));
    return processedMarkets;
  } catch (error) {
    console.error(colors.red(`加载市场数据失败: ${error.message}`));
    return [];
  }
}

/**
 * 保存套利机会到CSV文件
 * @param {Object} opportunity 套利机会数据
 */
async function saveOpportunity(opportunity) {
  try {
    await csvWriter.writeRecords([opportunity]);
    console.log(colors.gray(`套利机会已保存到 ${CSV_PATH}`));
  } catch (error) {
    console.error(colors.red(`保存套利机会失败: ${error.message}`));
  }
}

/**
 * 通知发现的套利机会
 * @param {Object} opportunity 套利机会数据
 */
function notifyOpportunity(opportunity) {
  // 生成唯一ID来避免重复通知
  const opportunityId = `${opportunity.marketId}_${opportunity.timestamp.substring(0, 16)}`;
  
  if (notifiedOpportunities.has(opportunityId)) {
    return;
  }
  
  notifiedOpportunities.add(opportunityId);
  stats.opportunitiesFound++;
  
  console.log(colors.green('\n===== 发现套利机会! ====='));
  console.log(colors.yellow(`市场: ${opportunity.title}`));
  console.log(`YES价格: ${opportunity.yesPrice.toFixed(4)}`);
  console.log(`NO价格: ${opportunity.noPrice.toFixed(4)}`);
  console.log(`总价: ${opportunity.totalPrice.toFixed(4)}`);
  console.log(colors.green(`潜在利润: ${opportunity.potentialProfit.toFixed(4)}`));
  console.log(`最小流动性: ${opportunity.minLiquidity.toFixed(2)} USDC`);
  console.log(colors.reset('=========================\n'));
  
  // 保存到CSV
  saveOpportunity(opportunity);
  
  // 维护通知集合大小
  if (notifiedOpportunities.size > 100) {
    // 清除旧的通知记录，只保留最近的50个
    const entries = Array.from(notifiedOpportunities);
    const toKeep = entries.slice(Math.max(0, entries.length - 50));
    notifiedOpportunities.clear();
    toKeep.forEach(id => notifiedOpportunities.add(id));
  }
}

/**
 * 获取单个token的价格
 * @param {string} tokenId token ID
 * @returns {Object} 价格数据
 */
async function getTokenPrice(tokenId) {
  try {
    const response = await fetch(`https://clob.polymarket.com/price?token_id=${tokenId}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * 批量获取价格并检查套利
 */
async function batchCheckPrices() {
  const markets = Array.from(marketCache.values());
  let checkedCount = 0;
  
  console.log(colors.gray(`\n[轮询] 开始检查 ${markets.length} 个市场的价格...`));
  
  for (const market of markets) {
    if (!market.outcomesInfo || market.outcomesInfo.length < 2) continue;
    
    const yesTokenId = market.outcomesInfo[0].tokenId;
    const noTokenId = market.outcomesInfo[1].tokenId;
    
    // 获取YES和NO的价格
    const [yesData, noData] = await Promise.all([
      getTokenPrice(yesTokenId),
      getTokenPrice(noTokenId)
    ]);
    
    if (yesData && yesData.price && noData && noData.price) {
      const yesPrice = parseFloat(yesData.price);
      const noPrice = parseFloat(noData.price);
      
      // 更新价格缓存
      if (!priceCache.has(market.marketId)) {
        priceCache.set(market.marketId, {});
      }
      const cache = priceCache.get(market.marketId);
      cache.yes = yesPrice;
      cache.no = noPrice;
      
      // 检查套利机会
      const totalPrice = yesPrice + noPrice;
      if (totalPrice < THRESHOLD) {
        await checkArbitrageOpportunity(market, yesPrice, noPrice);
      }
      
      checkedCount++;
    }
    
    // 每10个市场暂停一下，避免请求过快
    if (checkedCount % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(colors.gray(`[轮询] 完成！检查了 ${checkedCount}/${markets.length} 个市场\n`));
}

/**
 * 检查套利机会（从价格数据）
 */
async function checkArbitrageOpportunity(market, yesPrice, noPrice) {
  const totalPrice = yesPrice + noPrice;
  
  if (totalPrice >= THRESHOLD) return;
  
  try {
    // 获取流动性信息（简化版，使用price API的数据）
    const yesTokenId = market.outcomesInfo[0].tokenId;
    const noTokenId = market.outcomesInfo[1].tokenId;
    
    // 暂时假设流动性足够，或者设置默认值
    const minLiquidity = MIN_LIQUIDITY; // 简化处理
    
    // 计算潜在利润
    const estimatedFee = totalPrice * ESTIMATED_FEE;
    const potentialProfit = 1 - totalPrice - estimatedFee;
    
    if (potentialProfit > 0) {
      stats.opportunitiesFound++;
      
      const opportunity = {
        timestamp: new Date().toISOString(),
        marketId: market.marketId,
        conditionId: market.conditionId,
        title: market.title,
        yesPrice: yesPrice,
        noPrice: noPrice,
        totalPrice: totalPrice,
        potentialProfit: potentialProfit,
        minLiquidity: minLiquidity,
        yesTokenId: yesTokenId,
        noTokenId: noTokenId
      };
      
      notifyOpportunity(opportunity);
    }
  } catch (error) {
    console.error(colors.red(`检查套利机会失败: ${error.message}`));
  }
}

/**
 * 获取订单簿数据
 * @param {Array} tokenIds 要获取订单簿的token IDs
 * @returns {Object} 订单簿数据
 */
async function getOrderBook(tokenIds) {
  try {
    const response = await fetch(`https://clob.polymarket.com/book?token_id=${tokenIds.join(',')}`);
    if (!response.ok) {
      throw new Error(`获取订单簿失败: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(colors.red(`获取订单簿失败: ${error.message}`));
    return {};
  }
}

/**
 * 检查是否存在套利机会
 * @param {string} tokenId 代币ID
 * @param {Object} priceData 价格数据
 */
async function checkArbitrage(tokenId, priceData) {
  stats.arbitrageChecks++;
  
  // 检查tokenId是否在我们的映射中
  if (!tokenIdToMarket.has(tokenId)) {
    return;
  }
  
  const marketId = tokenIdToMarket.get(tokenId);
  const market = marketCache.get(marketId);
  
  if (!market) {
    return;
  }
  
  // 更新价格缓存
  if (!priceCache.has(marketId)) {
    priceCache.set(marketId, {});
  }
  
  // 找出这是YES还是NO token
  const marketPriceCache = priceCache.get(marketId);
  const yesTokenId = market.outcomesInfo[0].tokenId;
  const noTokenId = market.outcomesInfo[1].tokenId;
  
  if (tokenId === yesTokenId) {
    marketPriceCache.yes = priceData.price;
  } else if (tokenId === noTokenId) {
    marketPriceCache.no = priceData.price;
  }
  
  // 如果我们有YES和NO的价格，检查是否有套利机会
  if (marketPriceCache.yes !== undefined && marketPriceCache.no !== undefined) {
    const yesPrice = marketPriceCache.yes;
    const noPrice = marketPriceCache.no;
    
    // 计算总价
    const totalPrice = yesPrice + noPrice;
    
    // 检查是否低于阈值
    if (totalPrice < THRESHOLD) {
      // 计算潜在利润（考虑费用）
      const estimatedFee = (yesPrice + noPrice) * ESTIMATED_FEE;
      const potentialProfit = 1 - totalPrice - estimatedFee;
      
      if (potentialProfit > 0) {
        const opportunity = {
          timestamp: new Date().toISOString(),
          marketId: marketId,
          conditionId: market.conditionId,
          title: market.title,
          yesPrice: yesPrice,
          noPrice: noPrice,
          totalPrice: totalPrice,
          potentialProfit: potentialProfit,
          minLiquidity: 0, // 从 WebSocket 无法获取流动性，设为 0
          yesTokenId: yesTokenId,
          noTokenId: noTokenId
        };
        
        // 通知
        notifyOpportunity(opportunity);
      }
    }
  }
}

/**
 * 处理价格更新消息
 * @param {Object} message 价格消息
 */
function handlePriceUpdate(message) {
  try {
    stats.messagesReceived++;
    
    if (message.event_type === 'price_change' && message.price_changes) {
      stats.priceUpdates++;
      
      // price_change 消息可能包含同一市场的多个 token 的价格
      // 按市场分组
      const marketUpdates = new Map();
      
      for (const change of message.price_changes) {
        const market = message.market;
        if (!marketUpdates.has(market)) {
          marketUpdates.set(market, []);
        }
        marketUpdates.get(market).push(change);
      }
      
      // 检查每个市场的套利机会
      for (const [marketConditionId, changes] of marketUpdates) {
        if (changes.length >= 2) {
          // 有两个 token 的价格，可能是 YES 和 NO
          const price1 = parseFloat(changes[0].best_ask || changes[0].price);
          const price2 = parseFloat(changes[1].best_ask || changes[1].price);
          
          const totalPrice = price1 + price2;
          
          if (totalPrice < THRESHOLD && totalPrice > 0) {
            // 找到对应的市场
            for (const market of marketCache.values()) {
              if (market.conditionId === marketConditionId) {
                const estimatedFee = totalPrice * ESTIMATED_FEE;
                const potentialProfit = 1 - totalPrice - estimatedFee;
                
                if (potentialProfit > 0) {
                  const opportunity = {
                    timestamp: new Date().toISOString(),
                    marketId: market.marketId,
                    conditionId: market.conditionId,
                    title: market.title,
                    yesPrice: price1,
                    noPrice: price2,
                    totalPrice: totalPrice,
                    potentialProfit: potentialProfit,
                    minLiquidity: 0, // WebSocket 不提供流动性信息
                    yesTokenId: changes[0].asset_id,
                    noTokenId: changes[1].asset_id
                  };
                  
                  notifyOpportunity(opportunity);
                }
                break;
              }
            }
          }
        } else {
          // 只有一个 token 的价格更新，使用缓存机制
          for (const change of changes) {
            if (change.asset_id && (change.best_ask || change.price)) {
              const price = parseFloat(change.best_ask || change.price);
              checkArbitrage(change.asset_id, { price: price }).catch(err => {
                console.error(colors.gray(`检查套利失败: ${err.message}`));
              });
            }
          }
        }
      }
    } else if (message.event_type === 'book' && message.asset_id) {
      stats.priceUpdates++;
      // 处理订单簿更新（使用中间价）
      if (message.bids && message.bids.length > 0 && message.asks && message.asks.length > 0) {
        const bestBid = parseFloat(message.bids[0].price);
        const bestAsk = parseFloat(message.asks[0].price);
        const midPrice = (bestBid + bestAsk) / 2;
        checkArbitrage(message.asset_id, { price: midPrice }).catch(err => {
          console.error(colors.gray(`检查套利失败: ${err.message}`));
        });
      }
    }
  } catch (error) {
    console.error(colors.red(`处理价格更新失败: ${error.message}`));
    console.error(error.stack);
  }
}

/**
 * 创建WebSocket连接并监听价格更新
 * @param {Array} tokenIds 要监听的token IDs
 */
function setupWebSocket(tokenIds) {
  // 如果没有token IDs，则不建立连接
  if (!tokenIds || tokenIds.length === 0) {
    console.log(colors.yellow('没有可用的token IDs，5秒后将重新加载市场数据...'));
    setTimeout(async () => {
      const markets = await loadMarkets();
      if (markets.length > 0) {
        const newTokenIds = [];
        for (const market of markets) {
          if (market.outcomesInfo && market.outcomesInfo.length >= 2) {
            newTokenIds.push(
              market.outcomesInfo[0].tokenId,
              market.outcomesInfo[1].tokenId
            );
          }
        }
        if (newTokenIds.length > 0) {
          setupWebSocket(newTokenIds);
        }
      }
    }, 5000);
    return null;
  }
  
  console.log(colors.cyan('正在连接WebSocket...'));
  
  // 创建WebSocket连接 - 注意URL需要加上 /market
  const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
  
  ws.on('open', () => {
    console.log(colors.green('✓ WebSocket连接成功\n'));
    
    // 分批订阅（避免一次性订阅太多token）
    const BATCH_SIZE = 500;
    const batches = [];
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
      batches.push(tokenIds.slice(i, i + BATCH_SIZE));
    }
    
    // 订阅第一批 - 注意type必须是小写"market"
    const subscription = {
      assets_ids: batches[0],
      type: 'market',
      custom_feature_enabled: true  // 启用额外消息类型
    };
    ws.send(JSON.stringify(subscription));
    console.log(colors.gray(`正在订阅第 1/${batches.length} 批...`));
    
    // 延迟订阅其他批次
    batches.slice(1).forEach((batch, index) => {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const sub = {
            assets_ids: batch,
            operation: 'subscribe'
          };
          ws.send(JSON.stringify(sub));
          console.log(colors.gray(`正在订阅第 ${index + 2}/${batches.length} 批...`));
        }
      }, (index + 1) * 1000); // 每批间隔1秒
    });
    
    // 所有批次订阅完成后显示完成消息
    setTimeout(() => {
      console.log(colors.green(`\n✓ 订阅完成！正在监控 ${tokenIds.length} 个代币的价格变化...`));
      console.log(colors.cyan('📡 WebSocket已连接，等待实时交易和价格更新...'));
      console.log(colors.gray('(只有当市场有交易活动时才会推送消息，每30秒显示运行状态)\n'));
      
      // 显示首次状态
      setTimeout(showStatus, 30000);
    }, batches.length * 1000 + 500);
    
    // 定期发送PING保持连接
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('PING');
      } else {
        clearInterval(pingInterval);
      }
    }, 10000); // 每10秒发送一次PING
  });
  
  ws.on('message', (data) => {
    try {
      const dataStr = data.toString();
      
      // 跳过服务器的文本响应（如 "NO NEW ASSETS", "PONG" 等）
      if (!dataStr.startsWith('{') && !dataStr.startsWith('[')) {
        return;
      }
      
      const message = JSON.parse(dataStr);
      
      // 调试：显示前3条消息
      if (stats.messagesReceived < 3) {
        console.log(colors.gray(`\n[调试] 收到消息类型: ${message.event_type || message.type || '未知'}`));
        if (!Array.isArray(message) && message.event_type) {
          console.log(colors.gray(`[调试] ${JSON.stringify(message, null, 2).substring(0, 400)}...`));
        }
      }
      
      handlePriceUpdate(message);
    } catch (error) {
      console.error(colors.red(`解析WebSocket消息失败: ${error.message}`));
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(colors.yellow(`WebSocket断开连接: ${code} ${reason}`));
    
    // 5秒后重新连接
    console.log(colors.yellow('5秒后尝试重新连接...'));
    setTimeout(() => setupWebSocket(tokenIds), 5000);
  });
  
  ws.on('error', (error) => {
    console.error(colors.red(`WebSocket错误: ${error}`));
  });
  
  return ws;
}

/**
 * 显示运行状态
 */
function showStatus() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const minutes = Math.floor(uptime / 60);
  const seconds = uptime % 60;
  
  console.log(colors.gray(`\n[状态] 运行时间: ${minutes}分${seconds}秒 | 接收消息: ${stats.messagesReceived} | 价格更新: ${stats.priceUpdates} | 套利检查: ${stats.arbitrageChecks} | 发现机会: ${stats.opportunitiesFound}`));
}

/**
 * 启动监控器
 */
async function startMonitor() {
  console.log(colors.cyan('Polymarket套利监控器 (Node.js版) 已启动'));
  console.log(`参数: 阈值=${THRESHOLD}, 最小流动性=${MIN_LIQUIDITY} USDC, 费用率=${ESTIMATED_FEE * 100}%\n`);
  
  try {
    // 检测API延迟
    await checkLatency();
    console.log('');
    
    // 加载市场数据
    const markets = await loadMarkets();
    
    // 收集所有token IDs进行订阅
    const allTokenIds = [];
    for (const market of markets) {
      if (market.outcomesInfo && market.outcomesInfo.length >= 2) {
        allTokenIds.push(
          market.outcomesInfo[0].tokenId,
          market.outcomesInfo[1].tokenId
        );
      }
    }
    
    console.log(colors.cyan(`\n共 ${allTokenIds.length} 个代币待订阅`));
    const batchCount = Math.ceil(allTokenIds.length / 500);
    console.log(colors.cyan(`将分为 ${batchCount} 批进行订阅\n`));
    
    // 设置WebSocket连接
    const ws = setupWebSocket(allTokenIds);
    
    // 设置定期状态显示 (每30秒)
    const statusInterval = setInterval(() => {
      showStatus();
    }, 30000);
    
    // 设置定期刷新市场数据 (每5分钟)
    console.log(colors.cyan('\n将每5分钟重新检查市场价格...\n'));
    
    const refreshInterval = setInterval(async () => {
      console.log(colors.gray(`\n[${new Date().toLocaleTimeString()}] 重新加载市场数据...`));
      const markets = await loadMarkets();
      
      // 获取最新的token IDs
      const newTokenIds = [];
      for (const market of markets) {
        if (market.outcomesInfo && market.outcomesInfo.length >= 2) {
          newTokenIds.push(
            market.outcomesInfo[0].tokenId,
            market.outcomesInfo[1].tokenId
          );
        }
      }
      
      // 如果WebSocket已关闭，重新连接
      if (ws.readyState !== WebSocket.OPEN) {
        setupWebSocket(newTokenIds);
      } else {
        // 更新订阅 - 使用正确的CLOB格式
        const subscription = {
          assets_ids: newTokenIds,
          operation: 'subscribe'
        };
        ws.send(JSON.stringify(subscription));
      }
    }, 300000); // 5分钟
    
    // 优雅退出时清除定时器
    process.on('SIGINT', () => {
      clearInterval(refreshInterval);
      clearInterval(statusInterval);
      console.log(colors.yellow('\n正在关闭套利监控器...'));
      showStatus();
      process.exit(0);
    });
    
  } catch (error) {
    console.error(colors.red(`启动监控器失败: ${error.message}`));
    process.exit(1);
  }
}

// 优雅退出处理
process.on('SIGINT', async () => {
  console.log(colors.yellow('\n正在关闭套利监控器...'));
  try {
    await rtdClient.disconnect();
  } catch (e) {
    // 忽略关闭错误
  }
  process.exit(0);
});

// 启动监控器
startMonitor();