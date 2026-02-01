#!/usr/bin/env node
/**
 * 恢复 Telegram 菜单按钮
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.HOME, '.openclaw/openclaw.json');
let botToken;

try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  botToken = config.channels?.telegram?.botToken;
} catch (error) {
  console.error('❌ 无法读取配置文件:', error.message);
  process.exit(1);
}

if (!botToken) {
  console.error('❌ 未找到 Telegram Bot Token');
  process.exit(1);
}

// 设置菜单按钮为默认（显示命令）
const data = JSON.stringify({
  menu_button: {
    type: 'commands'
  }
});

const options = {
  hostname: 'api.telegram.org',
  path: `/bot${botToken}/setChatMenuButton`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(responseData);
      if (result.ok) {
        console.log('✅ 菜单按钮已恢复！');
        console.log('\n现在你应该可以在 Telegram 左下角看到菜单按钮了');
        console.log('点击它会显示命令列表（/status, /help）');
      } else {
        console.error('❌ 设置失败:', result.description);
      }
    } catch (error) {
      console.error('❌ 解析响应失败:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ 请求失败:', error.message);
});

req.write(data);
req.end();
