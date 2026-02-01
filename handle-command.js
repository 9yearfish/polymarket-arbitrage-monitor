#!/usr/bin/env node
/**
 * 处理 Telegram 命令
 * 用法: node handle-command.js "用户消息内容"
 */

const getStatus = require('./get-status');
const fs = require('fs');
const path = require('path');

function handleCommand(message) {
  const msg = message.toLowerCase().trim();
  
  // 状态查询命令
  if (msg === '/status' || msg === '状态' || msg === '/stats' || 
      msg === 'status' || msg === '监控状态' || msg === '运行状态') {
    
    const statusResult = getStatus();
    
    if (statusResult.status === 'online') {
      // 写入通知队列
      const notificationsDir = path.join(__dirname, 'data', 'notifications');
      if (!fs.existsSync(notificationsDir)) {
        fs.mkdirSync(notificationsDir, { recursive: true });
      }
      
      const notificationFile = path.join(notificationsDir, `status-${Date.now()}.json`);
      const notification = {
        timestamp: new Date().toISOString(),
        message: statusResult.message,
        sent: false
      };
      
      fs.writeFileSync(notificationFile, JSON.stringify(notification, null, 2));
      
      return {
        handled: true,
        response: '状态查询已加入队列'
      };
    } else {
      return {
        handled: true,
        response: statusResult.message
      };
    }
  }
  
  // 帮助命令
  if (msg === '/help' || msg === '帮助' || msg === 'help') {
    const helpMessage = `🤖 <b>Polymarket 套利监控器命令</b>

<b>可用命令：</b>
  /status - 查看监控器运行状态
  /help - 显示此帮助信息

监控器会在发现套利机会时自动通知！`;
    
    return {
      handled: true,
      response: helpMessage
    };
  }
  
  // 未识别的命令
  return {
    handled: false,
    response: null
  };
}

// 如果直接运行
if (require.main === module) {
  const message = process.argv[2] || '';
  const result = handleCommand(message);
  console.log(JSON.stringify(result));
}

module.exports = handleCommand;
