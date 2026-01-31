// 完整实现：使用 SDK 生成 API key + WebSocket 订阅（带 auth）
import { ClobClient } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import WebSocket from 'ws';

const MARKET_CHANNEL = "market";

console.log('=== Polymarket WebSocket (带认证) 测试 ===\n');

const host = 'https://clob.polymarket.com';

// 创建一个测试钱包（仅用于生成 API key，不需要真实资金）
// 这是一个随机生成的测试私钥，不要用于真实交易
const testPrivateKey = Wallet.createRandom().privateKey;
console.log('🔑 使用测试钱包生成 API key...');
console.log('   私钥:', testPrivateKey.substring(0, 10) + '...');

const signer = new Wallet(testPrivateKey);
console.log('   地址:', signer.address);
console.log('');

// 初始化 CLOB 客户端
const clobClient = new ClobClient(host, 137, signer);

(async () => {
  try {
    // 生成 API key
    console.log('正在生成 API key...');
    const apiKey = await clobClient.createOrDeriveApiKey();
    
    console.log('✓ API key 生成成功:');
    console.log('   Key:', apiKey.key);
    console.log('   Secret:', apiKey.secret?.substring(0, 20) + '...');
    console.log('   Passphrase:', apiKey.passphrase);
    console.log('');
    
    // 准备认证信息
    const auth = {
      "apiKey": apiKey.key,  // ← 字段名是 key，不是 apiKey
      "secret": apiKey.secret,
      "passphrase": apiKey.passphrase
    };
    
    // 测试 token IDs（使用文档中的示例）
    const assetIds = [
      "109681959945973300464568698402968596289258214226684818748321941747028805721376",
    ];
    
    console.log('连接 WebSocket...');
    const wsUrl = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
    const ws = new WebSocket(wsUrl);
    
    let messageCount = 0;
    
    ws.on('open', () => {
      console.log('✓ WebSocket 连接成功\n');
      
      // 发送订阅消息（带 auth）
      const subscription = {
        "assets_ids": assetIds,
        "type": MARKET_CHANNEL,
        "auth": auth  // ← 关键！加上认证信息
      };
      
      console.log('发送订阅消息（带认证）:');
      console.log(JSON.stringify({
        assets_ids: assetIds,
        type: MARKET_CHANNEL,
        auth: {
          apiKey: auth.apiKey,
          secret: auth.secret?.substring(0, 20) + '...',
          passphrase: auth.passphrase
        }
      }, null, 2));
      console.log('');
      
      ws.send(JSON.stringify(subscription));
      
      // 定期发送 PING
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("PING");
        }
      }, 10000);
    });
    
    ws.on('message', (data) => {
      messageCount++;
      const timestamp = new Date().toISOString();
      const dataStr = data.toString();
      
      console.log('\n' + '='.repeat(80));
      console.log(`[消息 #${messageCount}] ${timestamp}`);
      console.log('='.repeat(80));
      
      // 跳过 PONG 消息
      if (dataStr === 'PONG') {
        console.log('PONG (心跳响应)');
        return;
      }
      
      console.log(dataStr);
      
      // 尝试解析 JSON
      if (dataStr.startsWith('{') || dataStr.startsWith('[')) {
        try {
          const parsed = JSON.parse(dataStr);
          
          // 如果是 book 消息，显示详细信息
          if (parsed.event_type === 'book') {
            console.log('\n📊 收到订单簿数据!');
            console.log('   Asset ID:', parsed.asset_id);
            console.log('   Market:', parsed.market);
            console.log('   Bids:', parsed.bids?.slice(0, 3));
            console.log('   Asks:', parsed.asks?.slice(0, 3));
          }
          // 如果是 price_change 消息
          else if (parsed.event_type === 'price_change') {
            console.log('\n💹 价格变化!');
            console.log('   Market:', parsed.market);
            console.log('   Changes:', parsed.price_changes);
          }
          // 其他消息
          else if (parsed.event_type) {
            console.log('\n📨 收到消息类型:', parsed.event_type);
          }
        } catch (e) {
          // JSON 解析失败
        }
      }
      
      console.log('');
    });
    
    ws.on('error', (error) => {
      console.error('\n❌ WebSocket 错误:', error.message);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`\n👋 WebSocket 关闭: ${code} ${reason || ''}`);
      console.log(`总共收到 ${messageCount} 条消息`);
      process.exit(0);
    });
    
    // 60秒后自动关闭
    setTimeout(() => {
      console.log('\n\n⏰ 测试时间结束，关闭连接...');
      ws.close();
    }, 60000);
    
    console.log('WebSocket 运行中... (60秒)');
    console.log('等待订单簿和价格更新消息...\n');
    
  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
