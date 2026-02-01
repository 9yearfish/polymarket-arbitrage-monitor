#!/usr/bin/env node
/**
 * 设置 Telegram Bot 命令菜单
 */

const https = require('https');

// 从配置文件读取 bot token
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

// 设置命令列表
const commands = [
  {
    command: 'status',
    description: '📊 查看监控器运行状态'
  },
  {
    command: 'help',
    description: '❓ 显示帮助信息'
  }
];

// 调用 Telegram API 设置命令
const data = JSON.stringify({ commands });

const options = {
  hostname: 'api.telegram.org',
  path: `/bot${botToken}/setMyCommands`,
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
        console.log('✅ Telegram 命令菜单设置成功！');
        console.log('\n可用命令：');
        commands.forEach(cmd => {
          console.log(`  /${cmd.command} - ${cmd.description}`);
        });
        console.log('\n现在在 Telegram 中输入 "/" 就能看到命令菜单了！');
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
