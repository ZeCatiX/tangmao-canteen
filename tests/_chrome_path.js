// 共享 Chrome 路径探测(puppeteer 测试组用)
// 背景: 57 个 GUI 测试曾写死用户级 Chrome 路径,Chrome 更新迁到系统级后全部哑火(before 挂起→子测试连锁 cancelled),
// 且这批文件不在 test:all 的 CI 入口里,从未被推送验证暴露。改为多候选探测,找不到导出 ''(测试组按 skip 处理)。
'use strict';
const fs = require('fs');

const CANDIDATES = [
  process.env.CHROME_PATH, // 环境变量显式指定优先
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA
    ? process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const CHROME_PATH = CANDIDATES.find((p) => {
  try { return fs.existsSync(p); } catch (e) { return false; }
}) || '';

module.exports = CHROME_PATH;
