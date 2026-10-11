const crypto = require('crypto');
const db = require('better-sqlite3')('./data/app.db');
const appId = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_app_id'").get().value;
const state = crypto.randomBytes(16).toString('hex');
const redirectUri = 'http://localhost:3000/api/feishu/oauth/callback';

// Minimal URL - just the essential params
const url1 = 'https://open.feishu.cn/open-apis/authen/v1/authorize?' + 
  'client_id=' + appId + 
  '&redirect_uri=' + encodeURIComponent(redirectUri) + 
  '&response_type=code' +
  '&state=' + state;

console.log('Test URL (minimal params):');
console.log(url1);
console.log('');
console.log('Please open this URL in your browser and report the exact error.');
