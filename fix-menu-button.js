#!/usr/bin/env node
/**
 * 修复 Telegram 左下角菜单按钮
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

// 方法1: 设置为默认状态
function setDefault() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({});
    
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
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 方法2: 明确设置为 commands 类型
function setCommands() {
  return new Promise((resolve, reject) => {
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
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('正在修复 Telegram 左下角菜单按钮...\n');
  
  try {
    // 先尝试设置为默认
    const result1 = await setDefault();
    console.log('✅ 已恢复为默认菜单按钮');
    
    // 再设置为 commands 类型
    const result2 = await setCommands();
    console.log('✅ 已设置菜单按钮类型为 commands');
    
    console.log('\n完成！现在：');
    console.log('1. 关闭并重新打开 Telegram 对话');
    console.log('2. 或者在 Telegram 中发送任意消息刷新');
    console.log('3. 左下角应该会出现菜单按钮 ☰');
    console.log('4. 点击菜单按钮会显示命令列表');
    
  } catch (error) {
    console.error('❌ 设置失败:', error.message);
  }
}

main();
