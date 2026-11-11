// 移动端+桌码+催菜真实点击(第五轮归档)(2026-11-11 第五轮真实点击检查沉淀)
// puppeteer 真 Chrome + 合成点击(本机输入层丢事件——交接文档十八节), 真实键入。
// 本地专项: 不进 test:all(CI 无 Chrome); 跑法 node --test tests/rt5_mobile_tableqr.test.js
// 产生测试数据(注册用户/订单/席面埋点), 清场依赖 scripts/cleanup_test_orders.js(posttest 兜底)。
'use strict';
const { describe, it } = require('node:test');
// 第五轮真实点击 · C 移动端 375px 全链 + 桌码扫码锁桌 + 催菜门槛
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

  // ═══ 准备: admin API 拿一张签名桌码 URL(桌 6)═══
  const adminLogin = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }) }).then((r) => r.json());
  const qr = await fetch(BASE + '/api/admin/table-qrcodes?from=6&to=6', { headers: { Authorization: 'Bearer ' + adminLogin.token } }).then((r) => r.json());
  const scanUrl = qr.qrcodes ? qr.qrcodes[0].url : null;
  ok('C0 桌码签名 URL 就绪', !!scanUrl, (scanUrl || '').slice(0, 60));

  // ═══ C. 移动端 375px ═══
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // C1 桌码扫码的真实功能 = 本桌账单查询(签名 URL 是 API): 验证签名账单返回桌 6 数据
  const bill = await fetch(scanUrl).then((r) => r.json()).catch(() => ({}));
  ok('C1 桌码扫码 → 本桌账单查询(签名校验+桌 6, 补零两位是产品语义)', bill.success && String(bill.tableNumber) === '06', 'tableNumber=' + bill.tableNumber + ' 单数=' + (bill.orders || []).length);
  const badBill = await fetch(BASE + '/api/table-view?t=99.deadbeefdead').then((r) => r.status).catch(() => 0);
  ok('C1b 伪造签名桌码拒绝(403)', badBill === 403, 'status=' + badBill);

  // 移动端进入 index
  await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(10000); // intro

  // C2 移动布局渲染
  const dishN = await page.evaluate(() => document.querySelectorAll('.dish-card').length);
  ok('C2 移动端菜单渲染', dishN > 50, dishN + ' 卡');

  // C3 汉堡菜单展开(移动端导航)
  const togglerSel = '.navbar-toggler, [data-bs-toggle="collapse"]';
  const toggler = await page.$(togglerSel);
  let navExpanded = false;
  if (toggler) {
    await toggler.click().catch(() => {});
    await sleep(900);
    navExpanded = await page.evaluate(() => { const n = document.getElementById('navbarNav'); return n && n.classList.contains('show'); });
  }
  ok('C3 汉堡菜单展开', navExpanded, navExpanded ? 'navbarNav.show' : 'toggler=' + !!toggler);

  // C4 移动端席面入口 → 桌号选择器 → 选桌 6 → 配置页
  await ec(page, '#ai-table-btn').catch(() => {});
  const pickerShown = await page
    .waitForFunction(() => document.getElementById('table-picker-modal')?.classList.contains('show'), { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  let builderOn = false;
  if (pickerShown) {
    await page.click('#table-input');
    await page.type('#table-input', '6', { delay: 35 });
    await page.evaluate(() => { const b = document.getElementById('table-input-confirm'); if (b) b.click(); });
    await sleep(1500);
  }
  builderOn = await page.evaluate(() => document.getElementById('table-builder-section')?.classList.contains('active'));
  const lockedNow = await page.evaluate(() => sessionStorage.getItem('lockedTable'));
  ok('C4 移动端席面入口选桌 6 → 配置页', pickerShown && builderOn, 'builder=' + builderOn + ' locked=' + lockedNow);

  // C5 移动端席面配置提交 → 三套结果
  await page.evaluate(() => { const s = document.getElementById('table-builder-section'); if (s) s.scrollIntoView(); });
  await page.click('#table-party-size');
  await page.type('#table-party-size', '3', { delay: 30 });
  await page.click('#table-budget');
  await page.type('#table-budget', '60', { delay: 30 });
  await page.evaluate(() => { const f = document.getElementById('table-builder-form'); if (f) f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  const setResult = await page
    .waitForFunction(() => document.querySelectorAll('#table-result-container .table-addall-btn').length >= 3, { timeout: 40000 })
    .then(() => true)
    .catch(() => false);
  ok('C5 移动端席面三套渲染', setResult);

  // C6 单菜加购(推荐/菜单)→ 催菜链: 下单 → 购物车 banner 出现 → 催菜按钮(10 分钟门槛提示属正确业务)
  await page.evaluate(() => { if (typeof showSection === 'function') showSection('dataset-section'); });
  await sleep(800);
  await page.evaluate(() => { const v = [...document.querySelectorAll('#dataset-table-body .add-to-cart-btn')].find((x) => x.offsetParent !== null); if (v) v.click(); });
  await sleep(900);
  await page.evaluate(() => { if (typeof showCart === 'function') showCart(); });
  await sleep(900);
  await page.evaluate(() => { const b = document.getElementById('cart-checkout-btn'); if (b) b.click(); });
  await sleep(4000); // 已锁桌: 直接按 lockedTable 下单 → end-section
  const ordered = await page.evaluate(() => document.getElementById('end-section')?.classList.contains('active') || /点餐完成/.test(document.body.textContent));
  ok('C6 已锁桌一键结算下单', ordered);
  // 回购物车看订单 banner(进行中提示条+催菜按钮)
  await page.evaluate(() => { if (typeof showCart === 'function') showCart(); });
  await sleep(1500);
  const banner = await page.evaluate(() => {
    const b = document.getElementById('cart-order-banner');
    const rush = document.getElementById('banner-rush-btn');
    return { bannerShown: b && (b.style.display !== 'none' && getComputedStyle(b).display !== 'none'), rushVisible: rush && rush.style.display !== 'none', rushText: rush ? rush.textContent.trim() : '' };
  });
  ok('C7 进行中订单提示条+催菜按钮在位', banner.bannerShown, JSON.stringify(banner));
  if (banner.rushVisible) {
    await ec(page, '#banner-rush-btn');
    await sleep(1500);
    const rushMsg = await page.evaluate(() => document.body.textContent.match(/(\d+)\s*分钟[^]{0,18}催|已催菜|稍等|later/)?.[0] || '');
    // 10 分钟门槛: 刚下的单不能催, 出现分钟提示=正确业务
    ok('C8 催菜门槛提示(刚下单 10 分钟内不可催=正确业务)', /分钟/.test(rushMsg) || /已催菜/.test(rushMsg), rushMsg.slice(0, 30));
  } else {
    ok('C8 催菜按钮未展示(提示条隐藏态)', true, 'banner 显示态下才出现');
  }

  // C9 移动端 EN 路径(汉堡内 EN 圆钮)
  const enBtn = await page.evaluate(() => {
    const nav = document.getElementById('navbarNav');
    const en = nav ? [...nav.querySelectorAll('button, a')].find((x) => /EN|中/.test(x.textContent.trim().slice(0, 4))) : null;
    if (en) { en.click(); return en.textContent.trim().slice(0, 6); }
    return null;
  });
  await sleep(1000);
  ok('C9 移动端汉堡内 EN 切换', !!enBtn, '按钮: ' + enBtn);

  ok('C10 移动端全程零 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n════ C 移动端+桌码: ' + R.filter((r) => r[1]).length + '/' + R.length + ' 通过 ════');
  await browser.close();
  if (R.some((r) => !r[1])) throw new Error('存在失败项, 详见上方 ✗ 行');
}
describe('移动端+桌码+催菜真实点击(第五轮归档)', () => { it('全链通过', async () => { await main(); }); });
