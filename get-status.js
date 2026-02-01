#!/usr/bin/env node
/**
 * 获取监控器运行状态
 * 生成过去10分钟的统计报告
 */

const fs = require('fs');
const path = require('path');

function getStatus() {
  const statsFile = path.join(__dirname, 'data', 'stats.json');
  
  if (!fs.existsSync(statsFile)) {
    return {
      status: 'offline',
      message: '❌ 监控器未运行或未找到统计数据'
    };
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    const current = data.current;
    const history = data.history || [];
    
    // 计算运行时间
    const uptimeSeconds = current.uptime;
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeStr = hours > 0 
      ? `${hours}小时${minutes}分${seconds}秒`
      : `${minutes}分${seconds}秒`;
    
    // 计算平均速率（如果有历史记录）
    let messageRate = 0;
    let priceUpdateRate = 0;
    
    if (history.length >= 2) {
      const oldest = history[0];
      const newest = history[history.length - 1];
      const timeDiff = (new Date(newest.timestamp) - new Date(oldest.timestamp)) / 1000;
      
      if (timeDiff > 0) {
        messageRate = ((newest.messagesReceived - oldest.messagesReceived) / timeDiff).toFixed(1);
        priceUpdateRate = ((newest.priceUpdates - oldest.priceUpdates) / timeDiff).toFixed(1);
      }
    }
    
    // 生成报告文本
    const report = `📊 <b>Polymarket 套利监控器状态</b>

⏱️ <b>运行时间</b>: ${uptimeStr}
📈 <b>监控市场</b>: ${current.markets} 个

<b>📡 实时数据统计</b>:
  • 接收消息: ${current.messagesReceived.toLocaleString()} 条
  • 价格更新: ${current.priceUpdates.toLocaleString()} 次
  • 套利检查: ${current.arbitrageChecks.toLocaleString()} 次
  • 发现机会: ${current.opportunitiesFound} 个

<b>⚡ 速率</b> (过去${history.length * 30}秒):
  • 消息速率: ${messageRate} 条/秒
  • 价格更新: ${priceUpdateRate} 次/秒

⏰ <b>最后更新</b>: ${new Date(current.timestamp).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}

✅ 监控器运行正常`;

    return {
      status: 'online',
      message: report,
      data: current
    };
    
  } catch (error) {
    return {
      status: 'error',
      message: `❌ 读取统计数据失败: ${error.message}`
    };
  }
}

// 如果直接运行，输出JSON
if (require.main === module) {
  const result = getStatus();
  console.log(JSON.stringify(result));
}

module.exports = getStatus;
