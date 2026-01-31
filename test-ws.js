const WebSocket = require('ws');

console.log('测试 Polymarket WebSocket 连接...\n');

// 使用真实活跃市场的 token ID (MicroStrategy Bitcoin market)
const testTokenIds = [
  '93592949212798121127213117304912625505836768562433217537850469496310204567695',
  '3074539347152748632858978545166555332546941892131779352477699494423276162345'
];
const conditionId = '0x19ee98e348c0ccb341d1b9566fa14521566e9b2ea7aed34dc407a0ec56be36a2';

const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');

ws.on('open', () => {
  console.log('✓ WebSocket 连接成功\n');
  
  // 订阅真实市场的 token
  const subscription = {
    assets_ids: testTokenIds,
    type: 'market',
    custom_feature_enabled: true  // 启用自定义特性
  };
  
  console.log('发送订阅消息:', JSON.stringify(subscription, null, 2));
  ws.send(JSON.stringify(subscription));
  
  // 定期发送 PING
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send('PING');
    }
  }, 10000);
});

let messageCount = 0;

ws.on('message', (data) => {
  messageCount++;
  const dataStr = data.toString();
  
  console.log(`\n[消息 ${messageCount}] 收到数据:`);
  
  // 如果是文本响应
  if (!dataStr.startsWith('{') && !dataStr.startsWith('[')) {
    console.log('  文本响应:', dataStr);
    return;
  }
  
  try {
    const message = JSON.parse(dataStr);
    console.log('  JSON 消息:', JSON.stringify(message, null, 2));
  } catch (error) {
    console.log('  解析失败:', dataStr.substring(0, 200));
  }
});

ws.on('error', (error) => {
  console.error('WebSocket 错误:', error);
});

ws.on('close', (code, reason) => {
  console.log(`\nWebSocket 关闭: ${code} ${reason}`);
  process.exit(0);
});

// 60秒后自动关闭（增加等待时间）
setTimeout(() => {
  console.log(`\n测试完成！共收到 ${messageCount} 条消息，关闭连接`);
  ws.close();
}, 60000);

console.log('\n等待消息... (将运行60秒)\n');
