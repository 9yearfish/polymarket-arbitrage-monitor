#!/usr/bin/env node
/**
 * 检查并发送 Telegram 通知队列
 * 由 OpenClaw 定期调用
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const notificationsDir = path.join(__dirname, 'data', 'notifications');

async function sendNotifications() {
  if (!fs.existsSync(notificationsDir)) {
    return;
  }
  
  const files = fs.readdirSync(notificationsDir)
    .filter(f => f.startsWith('notify-') && f.endsWith('.json'))
    .sort(); // 按时间顺序
  
  if (files.length === 0) {
    return;
  }
  
  console.log(`发现 ${files.length} 条待发送的通知`);
  
  for (const file of files) {
    const filePath = path.join(notificationsDir, file);
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      if (data.sent) {
        // 已发送，删除文件
        fs.unlinkSync(filePath);
        continue;
      }
      
      // 使用 OpenClaw message 工具发送到 Telegram
      const escapedMessage = data.message.replace(/'/g, "'\\''");
      const command = `openclaw message send --channel telegram --message '${escapedMessage}'`;
      
      console.log(`正在发送通知: ${file}`);
      await execAsync(command);
      
      // 标记为已发送并删除
      fs.unlinkSync(filePath);
      console.log(`✓ 通知已发送并删除: ${file}`);
      
      // 避免发送太快
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`发送通知失败 ${file}:`, error.message);
      // 发送失败的文件保留，下次继续尝试
    }
  }
}

sendNotifications().catch(console.error);
