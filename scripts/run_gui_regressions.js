#!/usr/bin/env node
'use strict';
// GUI 回归一键跑批(2026-11-12)
// 顺序执行五份本地真实点击回归(puppeteer 真 Chrome, 不进 test:all——CI 无 Chrome):
//   rt4_customer_clicks / rt4_admin_kitchen_clicks / rt5_user_lifecycle / rt5_admin_deep / rt5_mobile_tableqr
// 用法: node scripts/run_gui_regressions.js
//   前置: 本地服务在线(pm2 tangmao) + tests/_chrome_path 可用
//   日志: tests/gui_regression_logs/<日期>.log(gitignore, 追加写)
// 产生测试数据(订单/注册用户), 收尾自动跑 scripts/cleanup_test_orders.js 清场。
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SUITES = [
  'tests/rt4_customer_clicks.test.js',
  'tests/rt4_admin_kitchen_clicks.test.js',
  'tests/rt5_user_lifecycle.test.js',
  'tests/rt5_admin_deep.test.js',
  'tests/rt5_mobile_tableqr.test.js',
];
const LOG_DIR = path.join(ROOT, 'tests', 'gui_regression_logs');

// 前置: 服务在线
let online = false;
try {
  const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8', 'http://localhost:3000/'], { encoding: 'utf8', shell: true });
  online = String(r.stdout).trim() === '200';
} catch (e) {}
if (!online) {
  console.error('✗ 本地服务未在线(http://localhost:3000)——先 pm2 start tangmao');
  process.exit(2);
}

fs.mkdirSync(LOG_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1_$2');
const logPath = path.join(LOG_DIR, stamp + '.log');
const log = (line) => {
  console.log(line);
  fs.appendFileSync(logPath, line + '\n');
};

log('══ GUI 回归跑批 ' + new Date().toLocaleString() + ' ══');
const results = [];
let failed = 0;
for (const suite of SUITES) {
  const t0 = Date.now();
  log('▶ ' + path.basename(suite));
  const r = spawnSync('node', ['--test', suite], { encoding: 'utf8', cwd: ROOT, env: process.env, timeout: 420000 });
  const dur = Math.round((Date.now() - t0) / 1000);
  const pass = (r.stdout || '').match(/ℹ pass (\d+)/);
  const fail = (r.stdout || '').match(/ℹ fail (\d+)/);
  const ok = r.status === 0;
  results.push({ suite: path.basename(suite), pass: pass ? pass[1] : '?', fail: fail ? fail[1] : '?', dur, ok });
  log('  ' + (ok ? '✓' : '✗') + ' pass=' + (pass ? pass[1] : '?') + ' fail=' + (fail ? fail[1] : '?') + ' (' + dur + 's)');
  if (!ok) {
    failed++;
    // 失败详情落日志
    const errLines = (r.stdout || '').split('\n').filter((l) => l.includes('✖')).slice(0, 10);
    log('  失败项: ' + errLines.join(' | '));
    const stderrTail = (r.stderr || '').split('\n').slice(-8).join('\n');
    log('  stderr 尾部:\n' + stderrTail);
  }
}

log('══ 汇总: ' + results.filter((r) => r.ok).length + '/' + results.length + ' 套件通过 ══');
for (const r of results) log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.suite + ' (pass ' + r.pass + ')');

// 清场: 测试单
const cl = spawnSync('node', ['scripts/cleanup_test_orders.js'], { encoding: 'utf8', cwd: ROOT, timeout: 120000 });
log('清场: ' + ((cl.stdout || '').match(/取消 \d+ 张测试单/) || ['(无输出)'])[0]);

log('日志: ' + logPath);
console.log('');
console.log(failed === 0 ? '✅ GUI 回归全部通过' : '❌ ' + failed + ' 个套件失败(详见上方/日志)');
fs.appendFileSync(logPath, '\n');
process.exit(failed === 0 ? 0 : 1);
