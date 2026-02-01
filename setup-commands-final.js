#!/usr/bin/env node
/**
 * 设置完整的中文命令列表
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

const CHAT_ID = '8347505058';

function apiCall(method, payload = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/${method}`,
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
          resolve(JSON.parse(responseData));
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
  console.log('🔧 设置中文命令列表...\n');
  
  try {
    // 1. 设置命令列表
    const commands = [
      { command: 'start', description: '🏠 开始使用' },
      { command: 'status', description: '📊 查看监控状态' },
      { command: 'help', description: '❓ 帮助信息' },
      { command: 'settings', description: '⚙️ 设置选项' }
    ];
    
    const setCmd = await apiCall('setMyCommands', { commands });
    console.log('命令列表设置:', setCmd.ok ? '✅ 成功' : '❌ 失败');
    
    // 2. 设置菜单按钮为 commands 类型
    const setMenu = await apiCall('setChatMenuButton', {
      chat_id: CHAT_ID,
      menu_button: { type: 'commands' }
    });
    console.log('菜单按钮设置:', setMenu.ok ? '✅ 成功' : '❌ 失败');
    
    console.log('\n📋 已设置的命令：');
    commands.forEach(cmd => {
      console.log(`  /${cmd.command} - ${cmd.description}`);
    });
    
    console.log('\n✅ 完成！现在：');
    console.log('1. 退出对话重新进入');
    console.log('2. 点击左下角菜单按钮 ☰');
    console.log('3. 会显示所有中文命令列表');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

main();
