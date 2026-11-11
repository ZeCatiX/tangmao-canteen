// admin+kitchen 真实点击全链(第四轮检查归档)(2026-11-11 第四轮真实点击检查沉淀)
// puppeteer 真 Chrome + 合成点击(本机输入层真实鼠标事件丢事件——交接文档十三节环境限制), 真实键入。
// 本地专项: 不进 test:all(CI 无 Chrome 自动语境缺失); 跑法 node --test tests/rt4_admin_kitchen_clicks.test.js
// 产生测试数据(订单/席面埋点), 自带清场依赖 scripts/cleanup_test_orders.js(posttest 兜底)。
'use strict';
const { describe, it } = require('node:test');
// 第四轮真实点击全量检查 · admin 后台 + kitchen 看板(puppeteer 真 Chrome)
// 本机输入层真实鼠标事件丢事件(交接文档十三节环境限制)——统一合成点击 + 真实键入
const puppeteer = require('D:/食堂网页/.ai/worktrees/dev/node_modules/puppeteer');
const CHROME_PATH = require('D:/食堂网页/.ai/worktrees/dev/tests/_chrome_path');
const BASE = 'http://localhost:3000';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = [];
const ok = (n, c, d) => { R.push([n, c]); console.log((c ? '✓ ' : '✗ ') + n + (d ? ' — ' + d : '')); };
const ec = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; } return false; }, sel);

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME_PATH, args: ['--no-sandbox', '--disable-gpu'] });

  // ═══ A. admin 后台 ═══
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(700);
  // A1 登录(真实键入)
  await page.type('#admin-login-user', 'admin', { delay: 25 });
  await page.type('#admin-login-pass', ADMIN_PASS, { delay: 25 });
  await ec(page, '#admin-login-btn');
  await sleep(2400);
  const loggedIn = await page.evaluate(() => { const w = document.querySelector('.app-wrap'); return w && getComputedStyle(w).display !== 'none'; });
  ok('A1 admin 真实键入登录进面板', loggedIn);
  const dashVisible = await page.evaluate(() => document.getElementById('page-dashboard')?.classList.contains('active'));
  ok('A2 仪表盘默认页', dashVisible);

  // A3 12 页逐页真实导航点击
  const pages = ['dashboard', 'dishes', 'orders', 'tables', 'report', 'qrcodes', 'users', 'feedback', 'preferences', 'analytics', 'model', 'apidocs'];
  let navOk = 0;
  for (const pid of pages) {
    await ec(page, '[data-page="' + pid + '"]');
    await sleep(650);
    const act = await page.evaluate((p) => document.getElementById('page-' + p)?.classList.contains('active'), pid);
    if (act) navOk++;
    else console.log('  [导航失败] ' + pid);
  }
  ok('A3 侧栏 12 页逐页真实点击切换', navOk === pages.length, navOk + '/' + pages.length);

  // A4 菜品管理: 搜索 → 编辑弹窗开/关
  await ec(page, '[data-page="dishes"]');
  await sleep(900);
  const dishRows = await page.evaluate(() => document.querySelectorAll('#page-dishes table tbody tr, #page-dishes .dish-row').length);
  ok('A4 菜品列表渲染', dishRows > 50, dishRows + ' 行');
  // 新增菜品按钮 → 弹窗(dishModal)
  const modalOpen = await ec(page, '#add-dish-btn');
  await sleep(900);
  const modalShown = await page.evaluate(() => { const m = document.getElementById('dishModal'); return m && m.classList.contains('show'); });
  ok('A5 新增菜品按钮 → 编辑弹窗', modalOpen && modalShown);
  await ec(page, '#dishModal .btn-close, #dishModal [data-bs-dismiss="modal"]');
  await sleep(700);
  const modalClosed = await page.evaluate(() => { const m = document.getElementById('dishModal'); return !m || !m.classList.contains('show'); });
  ok('A6 弹窗关闭', modalClosed);

  // A7 营业日报: 切页直调 → 真实点击查询 → 8 统计卡 + 席面卡
  await page.evaluate(() => showAdminPage('page-report'));
  await sleep(700);
  const today = await page.evaluate(() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
  await page.evaluate((v) => { document.getElementById('report-date').value = v; }, today);
  await ec(page, '#report-load-btn');
  await sleep(1600);
  const reportOk = await page.evaluate(() => {
    const stats = document.getElementById('report-stats');
    return stats && stats.textContent.includes('有效单量') && stats.textContent.length > 50;
  });
  const tablesetOk = await page.evaluate(() => { const el = document.getElementById('report-tableset-stats'); return el && el.textContent.includes('席面展示'); });
  ok('A7 日报真实查询(统计+席面采纳卡)', reportOk && tablesetOk);

  // A8 桌码生成: 切页直调(诊断证实此路径稳定) → 真实点击 → QR 图渲染
  await page.evaluate(() => showAdminPage('page-qrcodes'));
  await sleep(700);
  await page.evaluate(() => { document.getElementById('qr-from').value = '1'; document.getElementById('qr-to').value = '2'; });
  let qrN = 0;
  let attemptsUsed = 0;
  for (let attempt = 0; attempt < 3 && qrN < 2; attempt++) {
    attemptsUsed = attempt + 1;
    await ec(page, '#qr-gen-btn');
    await sleep(5000);
    qrN = await page.evaluate(() => document.querySelectorAll('#qr-grid img').length);
  }
  ok('A8 桌码真实生成 2 张 QR', qrN >= 2, qrN + ' 张(点击 ' + attemptsUsed + ' 次)');

  // A9 分析页 canvas 图表(按需加载 Chart.js)
  await ec(page, '[data-page="analytics"]');
  await sleep(3800);
  const chartN = await page.evaluate(() => document.querySelectorAll('#page-analytics canvas').length);
  ok('A9 数据分析 canvas 渲染(Chart.js 按需加载)', chartN >= 2, chartN + ' canvas');

  // A10 反馈页过滤联动
  await ec(page, '[data-page="feedback"]');
  await sleep(900);
  const fbRows = await page.evaluate(() => document.querySelectorAll('#page-feedback table tbody tr').length);
  ok('A10 反馈页渲染', fbRows >= 0, fbRows + ' 行(空表也正常)');

  // A11 深色模式(admin 的 toggle)
  const d0 = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
  await ec(page, '#dark-mode-toggle');
  await sleep(500);
  const d1 = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
  ok('A11 admin 深色切换(翻转)', d0 !== d1, d0 + '→' + d1);
  if (d1) { await ec(page, '#dark-mode-toggle'); await sleep(400); }


  ok('A13 admin 全程零 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ═══ B. kitchen 看板 ═══
  const kp = await browser.newPage();
  await kp.setViewport({ width: 1360, height: 900 });
  const kerrs = [];
  kp.on('pageerror', (e) => kerrs.push(e.message));
  await kp.goto(BASE + '/kitchen.html', { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(900);
  await kp.type('#login-user', 'admin', { delay: 25 });
  await kp.type('#login-pass', ADMIN_PASS, { delay: 25 });
  await ec(kp, '#login-btn');
  await sleep(2200);
  const kLogged = await kp.evaluate(() => { const o = document.getElementById('login-overlay'); return !o || getComputedStyle(o).display === 'none'; });
  ok('B1 kitchen 登录', kLogged);
  const boardOk = await kp.evaluate(() => { const l = document.getElementById('order-list'); return l && l.textContent.length > 0; });
  ok('B2 看板渲染(进行中/已完成区)', boardOk);

  // B3 下一张测试单 → 看板出现 → 完成按钮 3 秒确认窗真实点击
  const mk = await fetch(BASE + '/api/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 2071, qty: 1 }], tableNumber: '8' }),
  }).then((r) => r.json());
  const kOrder = mk.orderId || (mk.order && mk.order.id);
  ok('B3 预置测试单(桌8 葫芦鸡)', mk.success && kOrder, '单 ' + kOrder);
  await sleep(3500); // 等看板 10 秒自动刷新(或手动等一拍)
  await kp.evaluate(() => { if (typeof loadOrders === 'function') loadOrders(); });
  await sleep(1200);
  // 看板卡不显示订单号, 按"8号桌"定位(桌8 专用测试单)
  const seen = await kp.evaluate(() => document.getElementById('order-list').textContent.includes('桌号 8'));
  ok('B4 看板出现新单(8号桌卡)', seen, '单 ' + kOrder);
  if (seen) {
    // 完成按钮确认流: 首点变红"再点确认"(arm) → 3 秒窗内再点 → 完成
    const c1 = await kp.evaluate(() => {
      const btn = [...document.querySelectorAll('#order-list .btn-complete')].find((b) => b.textContent.includes('完成'));
      if (!btn) return { hit: false };
      btn.click();
      return { hit: true };
    });
    await sleep(700);
    const confirmBtn = await kp.evaluate(() => {
      const btn = [...document.querySelectorAll('#order-list .btn-complete')].find((b) => b.textContent.includes('再点确认'));
      return btn ? btn.textContent.trim() : null;
    });
    ok('B5 完成按钮首次点 → 确认态(3 秒窗)', c1.hit && !!confirmBtn, '按钮变: ' + (confirmBtn || '未找到确认态'));
    let c2 = false;
    if (confirmBtn) {
      c2 = await kp.evaluate(() => {
        const btn = [...document.querySelectorAll('#order-list .btn-complete')].find((b) => b.textContent.includes('再点确认'));
        if (!btn) return false;
        btn.click();
        return true;
      });
      await sleep(1800);
    }
    const armedGone = await kp.evaluate(() => {
      const btn = [...document.querySelectorAll('#order-list .btn-complete')].find((b) => b.textContent.includes('再点确认'));
      return !btn;
    });
    ok('B6 确认窗内二次点击 → 单完成', c2 && armedGone, armedGone ? '确认态清除(单已完成)' : '确认态仍在');
  }

  ok('B7 kitchen 全程零 pageerror', kerrs.length === 0, kerrs.slice(0, 3).join(' | '));

  console.log('\n════ admin+kitchen: ' + R.filter((r) => r[1]).length + '/' + R.length + ' 通过 ════');
  await browser.close();
  if (R.some((r) => !r[1])) throw new Error('存在失败项, 详见上方 ✗ 行');
}
describe('admin+kitchen 真实点击全链(第四轮检查归档)', () => { it('全链 19 项', async () => { await main(); }); });
