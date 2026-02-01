#!/usr/bin/env node
/**
 * 设置完整的 OpenClaw 默认命令列表（中文版）
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
  console.log('🔧 设置完整的 OpenClaw 命令列表（中文）...\n');
  
  try {
    // OpenClaw 默认命令（翻译成中文）
    const commands = [
      { command: 'start', description: '🏠 开始使用' },
      { command: 'help', description: '❓ 显示可用命令' },
      { command: 'status', description: '📊 查看监控状态' },
      { command: 'commands', description: '📋 列出所有命令' },
      { command: 'skill', description: '🛠️ 运行技能' },
      { command: 'whoami', description: '👤 显示你的ID' },
      { command: 'subagents', description: '🤖 子代理管理' },
      { command: 'usage', description: '💰 使用统计' },
      { command: 'reset', description: '🔄 重置会话' },
      { command: 'new', description: '✨ 新建会话' },
      { command: 'think', description: '🧠 思考级别' },
      { command: 'verbose', description: '📢 详细模式' },
      { command: 'reasoning', description: '💭 推理可见性' },
      { command: 'model', description: '🤖 设置模型' },
      { command: 'models', description: '📚 列出模型' },
      { command: 'stop', description: '⏹️ 停止运行' },
      { command: 'restart', description: '🔄 重启系统' },
      { command: 'approve', description: '✅ 批准请求' },
      { command: 'context', description: '📖 上下文说明' },
      { command: 'tts', description: '🔊 语音控制' },
      { command: 'send', description: '📤 发送设置' },
      { command: 'activation', description: '🎯 激活模式' },
      { command: 'elevated', description: '🔓 特权模式' },
      { command: 'exec', description: '⚙️ 执行设置' },
      { command: 'config', description: '🔧 配置管理' },
      { command: 'debug', description: '🐛 调试模式' },
      { command: 'queue', description: '⏳ 队列设置' },
    ];
    
    const setCmd = await apiCall('setMyCommands', { commands });
    console.log('命令列表设置:', setCmd.ok ? '✅ 成功' : '❌ 失败');
    
    // 设置菜单按钮为 commands 类型
    const setMenu = await apiCall('setChatMenuButton', {
      chat_id: CHAT_ID,
      menu_button: { type: 'commands' }
    });
    console.log('菜单按钮设置:', setMenu.ok ? '✅ 成功' : '❌ 失败');
    
    console.log(`\n📋 已设置 ${commands.length} 个命令\n`);
    console.log('常用命令：');
    console.log('  /status - 📊 查看监控状态');
    console.log('  /help - ❓ 显示可用命令');
    console.log('  /commands - 📋 列出所有命令');
    console.log('  /model - 🤖 设置模型');
    console.log('  /think - 🧠 思考级别');
    console.log('  /usage - 💰 使用统计');
    
    console.log('\n✅ 完成！现在：');
    console.log('1. 退出对话重新进入');
    console.log('2. 点击左下角菜单按钮 ☰');
    console.log('3. 会显示所有 OpenClaw 命令（中文）');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

main();
