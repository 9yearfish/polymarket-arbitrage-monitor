#!/usr/bin/env node
/**
 * 检查待发送的通知队列
 * 返回待发送通知的数量和内容（JSON格式）
 */

const fs = require('fs');
const path = require('path');

const notificationsDir = path.join(__dirname, 'data', 'notifications');

function checkNotifications() {
  if (!fs.existsSync(notificationsDir)) {
    console.log(JSON.stringify({ count: 0, notifications: [] }));
    return;
  }
  
  const files = fs.readdirSync(notificationsDir)
    .filter(f => f.startsWith('notify-') && f.endsWith('.json'))
    .sort(); // 按时间顺序
  
  const notifications = [];
  
  for (const file of files) {
    const filePath = path.join(notificationsDir, file);
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      notifications.push({
        file: file,
        path: filePath,
        timestamp: data.timestamp,
        message: data.message
      });
    } catch (error) {
      // 忽略损坏的文件
    }
  }
  
  console.log(JSON.stringify({ count: notifications.length, notifications: notifications }));
}

checkNotifications();
