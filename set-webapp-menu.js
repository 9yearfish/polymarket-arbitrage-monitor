#!/usr/bin/env node
/**
 * 设置左下角的 Web App 菜单按钮
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

// Web App URL - 使用 GitHub Pages
const WEB_APP_URL = 'https://9yearfish.github.io/polymarket-arbitrage-monitor/status-webapp.html';

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
  console.log('🔧 设置左下角 Web App 菜单按钮...\n');
  
  try {
    // 设置 Web App 菜单按钮
    const result = await apiCall('setChatMenuButton', {
      chat_id: CHAT_ID,
      menu_button: {
        type: 'web_app',
        text: '📊 查看状态',
        web_app: {
          url: WEB_APP_URL
        }
      }
    });
    
    if (result.ok) {
      console.log('✅ 成功！左下角菜单按钮已设置');
      console.log(`   按钮文字: 📊 查看状态`);
      console.log(`   Web App URL: ${WEB_APP_URL}`);
      console.log('\n📱 现在在 Telegram 中：');
      console.log('1. 完全关闭对话');
      console.log('2. 重新打开对话');
      console.log('3. 左下角应该会显示 "📊 查看状态" 按钮');
      console.log('4. 点击按钮会打开监控状态页面');
    } else {
      console.log('❌ 设置失败:', result.description);
      console.log('\n注意: 需要先在 GitHub 仓库中启用 GitHub Pages');
      console.log('或者使用其他可访问的 HTTPS URL');
    }
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

main();
