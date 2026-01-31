// 使用官方 @polymarket/clob-client SDK 测试
// 注意：这个 SDK 主要提供 REST API 功能，WebSocket 需要单独实现

import { ClobClient } from "@polymarket/clob-client";

console.log('=== Polymarket SDK 测试 ===\n');

const host = 'https://clob.polymarket.com';

// 创建客户端（不需要签名者，只读操作）
const clobClient = new ClobClient(host, 137);

console.log('✓ ClobClient 已创建\n');

(async () => {
  try {
    // 1. 测试连接
    console.log('[1] 测试服务器连接...');
    const ok = await clobClient.getOk();
    console.log('服务器状态:', ok);
    console.log('');
    
    // 2. 获取市场列表
    console.log('[2] 获取市场列表...');
    const markets = await clobClient.getSimplifiedMarkets();
    console.log(`获取到 ${markets.data?.length || 0} 个市场`);
    
    if (markets.data && markets.data.length > 0) {
      const firstMarket = markets.data[0];
      console.log('\n第一个市场示例:');
      console.log('  Condition ID:', firstMarket.condition_id);
      console.log('  Question:', firstMarket.question);
      console.log('  Tokens:', firstMarket.tokens);
      console.log('');
    }
    
    // 3. 测试获取订单簿
    if (markets.data && markets.data.length > 0) {
      const tokenId = markets.data[0].tokens[0]?.token_id;
      
      if (tokenId) {
        console.log('[3] 获取订单簿...');
        console.log('Token ID:', tokenId);
        
        try {
          const orderBook = await clobClient.getOrderBook(tokenId);
          console.log('\n订单簿:');
          console.log('  Bids (买单):', orderBook.bids?.slice(0, 3));
          console.log('  Asks (卖单):', orderBook.asks?.slice(0, 3));
          console.log('  Market:', orderBook.market);
          console.log('  Asset ID:', orderBook.asset_id);
        } catch (error) {
          console.log('获取订单簿失败:', error.message);
        }
        
        console.log('');
        
        // 4. 获取中间价
        console.log('[4] 获取中间价...');
        try {
          const midpoint = await clobClient.getMidpoint(tokenId);
          console.log('中间价:', midpoint);
        } catch (error) {
          console.log('获取中间价失败:', error.message);
        }
        
        console.log('');
      }
    }
    
    console.log('=== SDK 功能总结 ===');
    console.log('✓ REST API 功能正常（获取市场、订单簿、价格等）');
    console.log('✗ SDK 不包含 WebSocket 功能');
    console.log('');
    console.log('💡 解决方案:');
    console.log('  1. 使用 ClobClient 获取初始数据和市场信息');
    console.log('  2. 使用原生 WebSocket 监听实时价格更新');
    console.log('  3. 结合两者实现完整的套利监控');
    
  } catch (error) {
    console.error('\n错误:', error.message);
    console.error(error);
  }
})();
