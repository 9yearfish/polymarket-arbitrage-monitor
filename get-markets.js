#!/usr/bin/env node
/**
 * 获取当前监控的市场列表
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function getMarkets() {
  try {
    console.log('🔍 正在获取监控市场列表...\n');
    
    const response = await fetch('https://gamma-api.polymarket.com/events?closed=false&limit=50');
    
    if (!response.ok) {
      throw new Error(`获取失败: ${response.status}`);
    }
    
    const events = await response.json();
    const markets = [];
    
    for (const event of events) {
      if (!event.markets || !Array.isArray(event.markets)) {
        continue;
      }
      
      for (const market of event.markets) {
        if (market.closed) continue;
        if (!market.clobTokenIds) continue;
        
        try {
          const tokenIds = JSON.parse(market.clobTokenIds);
          if (!tokenIds || tokenIds.length < 2) continue;
          
          const prices = JSON.parse(market.outcomePrices);
          const yesPrice = parseFloat(prices[0]);
          const noPrice = parseFloat(prices[1]);
          const totalPrice = yesPrice + noPrice;
          
          markets.push({
            id: market.id,
            question: market.question || event.title || `Market ${market.id}`,
            yesPrice,
            noPrice,
            totalPrice,
            volume: parseFloat(market.volume24hr || 0)
          });
        } catch (e) {
          continue;
        }
      }
    }
    
    // 按24h交易量排序
    markets.sort((a, b) => b.volume - a.volume);
    
    console.log(`📊 总监控市场: ${markets.length} 个\n`);
    console.log('📈 前 20 个最活跃的市场:\n');
    
    markets.slice(0, 20).forEach((m, i) => {
      const gap = (1 - m.totalPrice).toFixed(4);
      const gapPercent = (gap * 100).toFixed(2);
      const indicator = m.totalPrice < 0.995 ? '🚨' : m.totalPrice < 0.998 ? '⚠️' : '✅';
      
      console.log(`${i + 1}. ${indicator} ${m.question.substring(0, 60)}${m.question.length > 60 ? '...' : ''}`);
      console.log(`   YES: ${m.yesPrice.toFixed(4)} | NO: ${m.noPrice.toFixed(4)} | 总计: ${m.totalPrice.toFixed(4)} | Gap: ${gapPercent}%`);
      console.log(`   24h成交: $${m.volume.toLocaleString()}\n`);
    });
    
    console.log('\n图例:');
    console.log('🚨 套利机会 (总计 < 0.995)');
    console.log('⚠️  接近阈值 (总计 < 0.998)');
    console.log('✅ 正常市场 (总计 >= 0.998)\n');
    
    // 返回JSON格式用于Telegram
    return {
      total: markets.length,
      top20: markets.slice(0, 20)
    };
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    return null;
  }
}

// 如果直接运行
if (require.main === module) {
  getMarkets();
}

module.exports = { getMarkets };
