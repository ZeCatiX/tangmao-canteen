// 生成每桌的签名桌码链接（用于制作二维码贴纸，贴在桌上）
// 用法: node gen_table_links.js [基础URL] [最大桌号]
// 例:   node gen_table_links.js https://your-domain.com 30
require('dotenv').config();
const crypto = require('crypto');

const SECRET = process.env.TABLE_SECRET || process.env.JWT_SECRET || 'tangmao-table-secret';
const BASE = process.argv[2] || 'http://localhost:3000';
const MAX = parseInt(process.argv[3] || '30', 10);

function sig(n) {
  return crypto.createHmac('sha256', SECRET).update(String(n)).digest('hex').slice(0, 16);
}

console.log('桌号\t链接（用二维码工具生成图片后贴到对应餐桌）');
for (let i = 1; i <= MAX; i++) {
  console.log(i + '号桌\t' + BASE + '/?t=' + i + '.' + sig(i));
}
console.log('\n提示：链接即凭证，请勿外传；如泄露可在 .env 修改 TABLE_SECRET 后重新生成。');
