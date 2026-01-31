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

/**
 * 加载所有市场数据并更新缓存
 */
async function loadMarkets() {
  console.log(colors.cyan('正在加载市场数据...'));
  
  try {
    // 使用API获取市场数据
    const response = await fetch('https://trading.polymarket.com/markets');
    if (!response.ok) {
      throw new Error(`获取市场数据失败: ${response.status}`);
    }
    
    const markets = await response.json();
    
    if (!Array.isArray(markets)) {
      throw new Error('市场数据格式不正确，预期应为数组');
    }
    
    // 清空缓存
    marketCache.clear();
    tokenIdToMarket.clear();
    
    // 处理市场数据
    const processedMarkets = [];
    
    for (const market of markets) {
      if (!market.conditionId || !market.marketId || !market.outcomes || market.outcomes.length < 2) {
        continue; // 跳过无效市场
      }
      
      // 创建规范化的市场对象
      const processedMarket = {
        marketId: market.marketId,
        conditionId: market.conditionId,
        title: market.question || market.title || `Market ${market.marketId}`,
        outcomesInfo: [
          { 
            tokenId: market.outcomes[0].tokenId, 
            name: market.outcomes[0].name || 'YES' 
          },
          { 
            tokenId: market.outcomes[1].tokenId,
            name: market.outcomes[1].name || 'NO'
          }
        ]
      };
      
      // 存储到缓存
      marketCache.set(processedMarket.marketId, processedMarket);
      
      // 映射tokenId到marketId
      tokenIdToMarket.set(processedMarket.outcomesInfo[0].tokenId, processedMarket.marketId);
      tokenIdToMarket.set(processedMarket.outcomesInfo[1].tokenId, processedMarket.marketId);
      
      processedMarkets.push(processedMarket);
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
 * 获取订单簿数据
 * @param {Array} tokenIds 要获取订单簿的token IDs
 * @returns {Object} 订单簿数据
 */
async function getOrderBook(tokenIds) {
  try {
    const response = await fetch(`https://trading.polymarket.com/order-book?token_ids=${tokenIds.join(',')}`);
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
      try {
        // 获取流动性信息
        const orderBook = await getOrderBook([yesTokenId, noTokenId]);
        
        // 分析YES和NO的流动性
        let yesLiquidity = 0;
        let noLiquidity = 0;
        
        if (orderBook[yesTokenId] && orderBook[yesTokenId].bestPrice) {
          yesLiquidity = orderBook[yesTokenId].bestPrice.buySize || 0;
        }
        
        if (orderBook[noTokenId] && orderBook[noTokenId].bestPrice) {
          noLiquidity = orderBook[noTokenId].bestPrice.buySize || 0;
        }
        
        const minLiquidity = Math.min(yesLiquidity, noLiquidity);
        
        // 计算潜在利润（考虑费用）
        const estimatedFee = (yesPrice + noPrice) * ESTIMATED_FEE;
        const potentialProfit = 1 - totalPrice - estimatedFee;
        
        if (minLiquidity >= MIN_LIQUIDITY && potentialProfit > 0) {
          const opportunity = {
            timestamp: new Date().toISOString(),
            marketId: marketId,
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
          
          // 通知
          notifyOpportunity(opportunity);
        }
      } catch (error) {
        console.error(colors.red(`检查套利机会失败: ${error.message}`));
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
    if (message.type === 'price_change') {
      const tokenId = message.token_id || message.tokenId; // 兼容不同格式
      if (tokenId) {
        checkArbitrage(tokenId, message);
      }
    }
  } catch (error) {
    console.error(colors.red(`处理价格更新失败: ${error.message}`));
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
  
  console.log(colors.cyan(`正在连接WebSocket，订阅 ${tokenIds.length} 个代币的价格更新...`));
  
  // 创建WebSocket连接
  const ws = new WebSocket('wss://trading.polymarket.com/ws');
  
  ws.on('open', () => {
    console.log(colors.green('WebSocket连接成功'));
    
    // 订阅价格更新
    const subscription = {
      type: 'subscribe',
      topic: 'marketSocket',
      data: {
        token_ids: tokenIds
      }
    };
    ws.send(JSON.stringify(subscription));
    console.log(colors.green('已订阅价格更新，开始监控...'));
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
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
 * 启动监控器
 */
async function startMonitor() {
  console.log(colors.cyan('Polymarket套利监控器 (Node.js版) 已启动'));
  console.log(`参数: 阈值=${THRESHOLD}, 最小流动性=${MIN_LIQUIDITY} USDC, 费用率=${ESTIMATED_FEE * 100}%`);
  
  try {
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
    
    // 设置WebSocket连接
    const ws = setupWebSocket(allTokenIds);
    
    // 设置定期刷新市场数据 (每小时)
    const refreshInterval = setInterval(async () => {
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
        // 更新订阅
        const subscription = {
          type: 'subscribe',
          topic: 'marketSocket',
          data: {
            tokenIds: newTokenIds
          }
        };
        ws.send(JSON.stringify(subscription));
      }
    }, 3600000);
    
    // 优雅退出时清除定时器
    process.on('SIGINT', () => {
      clearInterval(refreshInterval);
      console.log(colors.yellow('\n正在关闭套利监控器...'));
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