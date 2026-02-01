#!/usr/bin/env node
/**
 * 设置完整命令列表：OpenClaw + Polymarket 监控器
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
  console.log('🔧 设置完整命令列表（OpenClaw + Polymarket）...\n');
  
  try {
    const commands = [
      // === Polymarket 监控器专用命令 ===
      { command: 'pm_status', description: '📊 Polymarket 监控状态' },
      { command: 'pm_stats', description: '📈 监控统计数据' },
      { command: 'pm_opportunities', description: '🚨 当前套利机会' },
      { command: 'pm_threshold', description: '⚙️ 设置套利阈值' },
      { command: 'pm_pause', description: '⏸️ 暂停监控' },
      { command: 'pm_resume', description: '▶️ 恢复监控' },
      { command: 'pm_markets', description: '📋 监控市场列表' },
      
      // === OpenClaw 核心命令 ===
      { command: 'start', description: '🏠 开始使用' },
      { command: 'help', description: '❓ 显示可用命令' },
      { command: 'status', description: '📊 系统状态' },
      { command: 'commands', description: '📋 列出所有命令' },
      
      // === 常用功能 ===
      { command: 'whoami', description: '👤 显示你的ID' },
      { command: 'usage', description: '💰 使用统计' },
      { command: 'model', description: '🤖 设置模型' },
      { command: 'models', description: '📚 列出模型' },
      
      // === 会话管理 ===
      { command: 'reset', description: '🔄 重置会话' },
      { command: 'new', description: '✨ 新建会话' },
      { command: 'stop', description: '⏹️ 停止运行' },
      
      // === 高级设置 ===
      { command: 'skill', description: '🛠️ 运行技能' },
      { command: 'think', description: '🧠 思考级别' },
      { command: 'verbose', description: '📢 详细模式' },
      { command: 'reasoning', description: '💭 推理可见性' },
      { command: 'tts', description: '🔊 语音控制' },
      
      // === 系统管理 ===
      { command: 'restart', description: '🔄 重启系统' },
      { command: 'approve', description: '✅ 批准请求' },
      { command: 'config', description: '🔧 配置管理' },
      { command: 'debug', description: '🐛 调试模式' },
    ];
    
    const setCmd = await apiCall('setMyCommands', { commands });
    console.log('命令列表设置:', setCmd.ok ? '✅ 成功' : '❌ 失败');
    
    const setMenu = await apiCall('setChatMenuButton', {
      chat_id: CHAT_ID,
      menu_button: { type: 'commands' }
    });
    console.log('菜单按钮设置:', setMenu.ok ? '✅ 成功' : '❌ 失败');
    
    console.log(`\n📋 已设置 ${commands.length} 个命令\n`);
    
    console.log('📊 Polymarket 专用命令：');
    console.log('  /pm_status - 监控状态');
    console.log('  /pm_stats - 统计数据');
    console.log('  /pm_opportunities - 套利机会');
    console.log('  /pm_threshold - 设置阈值');
    console.log('  /pm_pause - 暂停监控');
    console.log('  /pm_resume - 恢复监控');
    console.log('  /pm_markets - 市场列表');
    
    console.log('\n🤖 OpenClaw 常用命令：');
    console.log('  /help - 帮助');
    console.log('  /status - 系统状态');
    console.log('  /model - 设置模型');
    console.log('  /usage - 使用统计');
    
    console.log('\n✅ 完成！退出对话重新进入，点击 ☰ 查看菜单');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

main();
