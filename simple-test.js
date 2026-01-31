// 完全按照官方文档的 Python WebSocket 示例实现
// https://docs.polymarket.com/quickstart/websocket/WSS-Quickstart

const WebSocket = require('ws');

const MARKET_CHANNEL = "market";
const USER_CHANNEL = "user";

class WebSocketOrderBook {
  constructor(channelType, url, data, auth, messageCallback, verbose) {
    this.channelType = channelType;
    this.url = url;
    this.data = data;
    this.auth = auth;
    this.messageCallback = messageCallback;
    this.verbose = verbose;
    
    const furl = url + "/ws/" + channelType;
    console.log(`连接到: ${furl}`);
    console.log(`订阅数据:`, data);
    console.log('');
    
    this.ws = new WebSocket(furl);
    this.orderbooks = {};
    this.messageCount = 0;
    
    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data) => this.onMessage(data));
    this.ws.on('error', (error) => this.onError(error));
    this.ws.on('close', (code, reason) => this.onClose(code, reason));
  }
  
  onMessage(message) {
    this.messageCount++;
    const timestamp = new Date().toISOString();
    
    console.log('\n' + '='.repeat(80));
    console.log(`[消息 #${this.messageCount}] ${timestamp}`);
    console.log('='.repeat(80));
    console.log(message.toString());
    console.log('');
    
    if (this.messageCallback) {
      this.messageCallback(message.toString());
    }
  }
  
  onError(error) {
    console.error("Error:", error);
    process.exit(1);
  }
  
  onClose(code, reason) {
    console.log(`\nWebSocket 关闭: ${code} ${reason || ''}`);
    console.log(`总共收到 ${this.messageCount} 条消息`);
    process.exit(0);
  }
  
  onOpen() {
    console.log('✓ WebSocket 连接成功\n');
    
    if (this.channelType === MARKET_CHANNEL) {
      const subscription = {
        "assets_ids": this.data,
        "type": MARKET_CHANNEL
      };
      console.log('发送订阅:', JSON.stringify(subscription, null, 2));
      this.ws.send(JSON.stringify(subscription));
    } else if (this.channelType === USER_CHANNEL && this.auth) {
      const subscription = {
        "markets": this.data,
        "type": USER_CHANNEL,
        "auth": this.auth
      };
      console.log('发送订阅:', JSON.stringify(subscription, null, 2));
      this.ws.send(JSON.stringify(subscription));
    } else {
      process.exit(1);
    }
    
    // 启动 PING 线程
    this.startPing();
  }
  
  subscribeToTokenIds(assetsIds) {
    if (this.channelType === MARKET_CHANNEL) {
      const msg = {
        "assets_ids": assetsIds,
        "operation": "subscribe"
      };
      this.ws.send(JSON.stringify(msg));
    }
  }
  
  unsubscribeToTokenIds(assetsIds) {
    if (this.channelType === MARKET_CHANNEL) {
      const msg = {
        "assets_ids": assetsIds,
        "operation": "unsubscribe"
      };
      this.ws.send(JSON.stringify(msg));
    }
  }
  
  startPing() {
    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send("PING");
      }
    }, 10000);
  }
  
  run() {
    // WebSocket 已经在构造函数中启动
    console.log('WebSocket 运行中...\n');
    console.log('等待消息... (按 Ctrl+C 结束)\n');
  }
}

// 主程序 - 完全按照文档示例
if (require.main === module) {
  const url = "wss://ws-subscriptions-clob.polymarket.com";
  
  // 这里不需要 API 密钥，因为 market channel 是公开的
  const apiKey = "";
  const apiSecret = "";
  const apiPassphrase = "";
  
  // 使用文档中的示例 token ID
  const assetIds = [
    "109681959945973300464568698402968596289258214226684818748321941747028805721376",
  ];
  
  const conditionIds = []; // market channel 不需要这个
  
  const auth = {
    "apiKey": apiKey,
    "secret": apiSecret,
    "passphrase": apiPassphrase
  };
  
  console.log('=== Polymarket WebSocket 测试 (按文档实现) ===\n');
  
  const marketConnection = new WebSocketOrderBook(
    MARKET_CHANNEL,
    url,
    assetIds,
    auth,
    null,
    true
  );
  
  // 可选：订阅额外的 token
  // setTimeout(() => {
  //   marketConnection.subscribeToTokenIds(["123"]);
  // }, 5000);
  
  marketConnection.run();
}
