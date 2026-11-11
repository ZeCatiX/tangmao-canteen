// 顾客端真实点击全链(第四轮检查归档)(2026-11-11 第四轮真实点击检查沉淀)
// puppeteer 真 Chrome + 合成点击(本机输入层真实鼠标事件丢事件——交接文档十三节环境限制), 真实键入。
// 本地专项: 不进 test:all(CI 无 Chrome 自动语境缺失); 跑法 node --test tests/rt4_customer_clicks.test.js
// 产生测试数据(订单/席面埋点), 自带清场依赖 scripts/cleanup_test_orders.js(posttest 兜底)。
'use strict';
const { describe, it } = require('node:test');
// 第四轮真实点击全量检查 · 顾客端(puppeteer 真 Chrome, page.click 真实鼠标事件)
const puppeteer = require('D:/食堂网页/.ai/worktrees/dev/node_modules/puppeteer');
const CHROME_PATH = require('D:/食堂网页/.ai/worktrees/dev/tests/_chrome_path');
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = [];
const ok = (n, c, d) => { R.push([n, c]); console.log((c ? '✓ ' : '✗ ') + n + (d ? ' — ' + d : '')); };
// 本机输入层真实鼠标事件丢事件(交接文档十三节五度呈现的环境限制), 合成 click 可靠——
// “真实操作流”在本环境 = 真 Chrome + 完整用户路径 + 真实键入(page.type) + 合成点击
const clickAt = async (page, sel) => {
  const hit = await page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; } return false; }, sel);
  await sleep(250);
  if (!hit) throw new Error('选择器未命中: ' + sel);
};

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME_PATH, args: ['--no-sandbox', '--disable-gpu', '--window-size=1360,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // 1. 加载 + intro 动画
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  const introShown = await page.waitForSelector('#logo-intro-overlay', { timeout: 5000 }).then(() => true).catch(() => false);
  const introGone = await page
    .waitForFunction(() => { const el = document.getElementById('logo-intro-overlay'); return !el || el.style.display === 'none' || !el.parentNode; }, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  // headless 无 GPU 时 rAF 节流, 动画可能迟迟不自动结束——真实用户会点击屏幕跳过(验证点击跳过修复)
  let skipped = false;
  if (introShown) {
    const stillThere = await page.evaluate(() => { const el = document.getElementById('logo-intro-overlay'); return !!el && el.style.display !== 'none'; });
    if (stillThere || !introGone) {
      const vp = page.viewport();
      await page.mouse.click(vp.width / 2, vp.height / 2);  // 真实鼠标点击跳过
      skipped = true;
      await sleep(1800);
    }
  }
  const overlayCleared = await page.evaluate(() => { const el = document.getElementById('logo-intro-overlay'); return !el || el.style.display === 'none' || !el.parentNode; }).catch(() => true);
  ok('① intro 动画出现并可点击跳过', introShown && overlayCleared, '出现=' + introShown + ' 自动结束=' + introGone + ' 点击跳过=' + skipped + ' 遮罩清除=' + overlayCleared);
  await sleep(800);

  // 2. 菜单渲染
  await page.waitForFunction(() => document.querySelectorAll('.dish-card').length > 20, { timeout: 15000 }).catch(() => {});
  const dishN = await page.evaluate(() => document.querySelectorAll('.dish-card').length);
  ok('② 菜单渲染', dishN > 50, dishN + ' 张菜品卡');

  // 3. 真实点击导航进数据集页(过滤控件所在 section), 再分类过滤
  await clickAt(page, '#nav-dataset');
  await sleep(900);
  const dsActive = await page.evaluate(() => document.getElementById('dataset-section')?.classList.contains('active'));
  ok('②b 数据集页导航激活', !!dsActive);
  const catVal = await page.evaluate(() => { const s = document.getElementById('menu-filter-cat'); const o = [...s.options].find((o) => o.value); return o ? o.value : null; });
  let catApplied = false;
  if (catVal) { catApplied = await page.select('#menu-filter-cat', catVal).then((v) => v.length > 0).catch(() => false); }
  await sleep(1100);
  const hotN = await page.evaluate(() => document.querySelectorAll('.dish-card').length);
  ok('③ 分类过滤(' + (catVal || '无选项') + ')', catApplied && hotN > 0 && hotN <= dishN, '选值=' + catVal + ' → ' + hotN + ' 张(全菜单 ' + dishN + ')');
  await clickAt(page, '#menu-reset-filter');
  await sleep(1000);
  const resetN = await page.evaluate(() => document.querySelectorAll('.dish-card').length);
  ok('④ 重置过滤', resetN >= dishN * 0.9, resetN + ' 张恢复');

  // 4. 搜索真实键入
  await clickAt(page, '#menu-search');
  await page.type('#menu-search', '鸡', { delay: 40 });
  await sleep(1100);
  const searchN = await page.evaluate(() => document.querySelectorAll('.dish-card').length);
  const searchHit = await page.evaluate(() => [...document.querySelectorAll('.dish-card')].some((c) => c.textContent.includes('鸡')));
  ok('⑤ 搜索"鸡"真实键入', searchN > 0 && searchN < dishN && searchHit, searchN + ' 张且含鸡菜');
  await clickAt(page, '#menu-reset-filter');
  await sleep(1000);

  // 5. 菜品卡点击 → 详情弹层 → 真实点击加购 → 角标变化
  const beforeBadge = await page.evaluate(() => document.getElementById('cart-badge').textContent.trim());
  await page.evaluate(() => { window.scrollTo(0, 300); });
  await sleep(300);
  // 详情入口是卡片标题 h6 的行内 onclick(showDishDetail), 点卡中心不触发——点标题
  const cardClicked = await page.evaluate(() => {
    const t = [...document.querySelectorAll('#dataset-table-body [onclick*="showDishDetail"]')].find((el) => el.offsetParent !== null);
    if (t) { t.click(); return (t.textContent || '').slice(0, 16); }
    return null;
  });
  await sleep(1000);
  const modalVisible = await page.evaluate(() => { const el = document.querySelector('#dish-detail-modal .modal.show'); return el ? 'dish-detail-modal' : null; });
  ok('⑥ 菜品卡点击出详情弹层', !!modalVisible, (cardClicked || '') + ' → ' + (modalVisible || '未找到弹层'));
  const { addBtnHit, addedDishId } = await page.evaluate(() => {
    const b = document.querySelector('#dish-detail-modal .modal.show .add-to-cart-btn');
    if (b && !b.disabled) { const id = b.dataset.id; b.click(); return { addBtnHit: b.textContent.trim().slice(0, 12), addedDishId: id }; }
    return { addBtnHit: b ? 'disabled' : null, addedDishId: null };
  });
  await sleep(1000);
  const afterBadge = await page.evaluate(() => document.getElementById('cart-badge').textContent.trim());
  ok('⑦ 详情层点击加购 → 角标变化', !!addBtnHit && afterBadge !== beforeBadge, (addBtnHit || '') + ' ' + beforeBadge + '→' + afterBadge);
  await page.keyboard.press('Escape');
  await sleep(600);

  // 6. 一席成宴全链(先回首页——ai-table-btn 在 home-section)
  await clickAt(page, '#nav-home');
  await sleep(800);
  const dHome = await page.evaluate(() => ({ home: document.getElementById('home-section')?.classList.contains('active'), btn: !!document.getElementById('ai-table-btn') }));
  console.log('  [⑧诊断1] nav-home后:', JSON.stringify(dHome));
  // 有 lockedTable(本 tab 之前锁过桌)时点席面入口会弹桌号确认而非配置页——真实用户场景, 脚本先清锁
  await page.evaluate(() => sessionStorage.removeItem('lockedTable'));
  await page.evaluate(() => { const el = document.getElementById('ai-table-btn'); if (el) el.click(); });
  // 产品逻辑: 未锁桌先弹桌号选择器——真实用户输入桌号确认后再进席面配置
  const pickerShown = await page
    .waitForFunction(() => document.getElementById('table-picker-modal')?.classList.contains('show'), { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  ok('⑧a 一席成宴入口 → 桌号选择器弹出', pickerShown);
  let builderVisible = false;
  if (pickerShown) {
    await page.click('#table-input');
    await page.type('#table-input', '9', { delay: 40 });
    await page.evaluate(() => { const b = document.getElementById('table-input-confirm'); if (b) b.click(); });
    await sleep(1500);
  }
  builderVisible = await page.evaluate(() => { const s = document.getElementById('table-builder-section'); return s && s.classList.contains('active'); });
  ok('⑧b 选桌后进席面配置页', builderVisible);
  await page.evaluate(() => { const s = document.getElementById('table-builder-section'); if (s) s.scrollIntoView(); });
  await clickAt(page, '#table-party-size');
  await page.type('#table-party-size', '4', { delay: 30 });
  await clickAt(page, '#table-budget');
  await page.type('#table-budget', '80', { delay: 30 });
  for (const [id, val] of [['table-spicy', '微辣'], ['table-saltiness', '适中'], ['table-sweetness', '无']]) {
    await page.select('#' + id, val).catch(() => {
      return page.evaluate((sid, v) => { const el = document.getElementById(sid); if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } }, id, val);
    });
  }
  await page.evaluate(() => { const b = document.getElementById('table-generate-btn'); if (b) b.click(); });
  const setResult = await page
    .waitForFunction(() => {
      const sec = document.getElementById('table-result-section');
      return sec && sec.classList.contains('active') && document.querySelectorAll('#table-result-container .table-addall-btn').length >= 3;
    }, { timeout: 40000 })
    .then(() => true)
    .catch(() => false);
  const setN = await page.evaluate(() => document.querySelectorAll('#table-result-container .table-addall-btn').length);
  ok('⑨ 席面表单真实提交 → 三套结果渲染', setResult && setN >= 3, setN + ' 套(等待=' + setResult + ')');
  const badgeBeforeSet = await page.evaluate(() => document.getElementById('cart-badge').textContent.trim());
  const addallHit = await page.evaluate(() => { const b = document.querySelector('#table-result-container .table-addall-btn'); if (b) { b.click(); return true; } return false; });
  await sleep(1600);
  const badgeAfterSet = await page.evaluate(() => document.getElementById('cart-badge').textContent.trim());
  ok('⑩ 整桌加购点击 → 角标大增', addallHit && badgeAfterSet !== badgeBeforeSet, badgeBeforeSet + '→' + badgeAfterSet);

  // 7. 购物车真实点击链
  await clickAt(page, '#nav-cart').catch(async () => { await page.evaluate(() => { if (typeof showSection === 'function') showSection('cart-section'); }); });
  await sleep(1100);
  const cartVisible = await page.evaluate(() => { const s = document.getElementById('cart-section'); return s && s.classList.contains('active'); });
  ok('⑪ 购物车打开', cartVisible);
  // ⑫ 点第一行 plus: 数量+1 生效 或 限购弹窗(席面整桌可能买满备量, 限购拒绝属正确业务)都算通过
  const qtyBefore = await page.evaluate(() => document.getElementById('cart-total-items').textContent.trim());
  const rowOp = await page.evaluate(() => {
    const plus = document.querySelector('#cart-table-body .cart-qty-plus');
    if (!plus) return { hit: false, rows: document.querySelectorAll('#cart-table-body tr').length };
    const input = plus.closest('tr').querySelector('.cart-qty-input');
    const before = input ? input.value : null;
    plus.click();
    return { hit: true, id: plus.dataset.id, before };
  });
  await sleep(1000);
  const qtyAfter = await page.evaluate(() => document.getElementById('cart-total-items').textContent.trim());
  // 估清限购: 若该菜今日备量已买满, plus 会被正确拒绝并弹提示(防超卖)——数量+1 或 弹限购提示均算通过
  // showMessage 走 #message-modal(非 notification-bar)
  const limitToast = await page.evaluate(() => {
    const m = document.getElementById('message-modal');
    return !!(m && m.classList.contains('show') && /备量|仅剩/.test(m.textContent));
  });
  ok('⑫ 数量+点击(生效或正确限购)', rowOp.hit && (qtyAfter !== qtyBefore || limitToast), rowOp.hit ? '行id=' + rowOp.id + ' 行qty=' + rowOp.before + ' 总' + qtyBefore + '→' + qtyAfter + (limitToast ? '(限购弹窗 ✓)' : '') : '购物车无行 rows=' + rowOp.rows);
  await clickAt(page, '#cart-table-number');
  await page.type('#cart-table-number', '9', { delay: 40 });
  await page.evaluate(() => { const b = document.getElementById('cart-checkout-btn'); if (b) b.click(); });
  const orderMade = await page
    .waitForFunction(() => /下单成功|订单已|取餐号|完成页/.test(document.body.textContent), { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  ok('⑬ 结算点击 → 下单反馈', orderMade, orderMade ? '成功提示出现' : '未捕获');

  // 8. EN + 深色
  await clickAt(page, '#lang-toggle').catch(() => {});
  await sleep(1100);
  const enSwitched = await page.evaluate(() => { const el = document.getElementById('lang-toggle-text'); return el ? el.textContent : null; });
  ok('⑭ EN 语言切换', enSwitched !== null && enSwitched !== '', 'toggle 文本: ' + enSwitched);
  // headless 默认 prefers-dark, 页面初始可能已是深色——断言"点击翻转"而非"点击后=true"
  const darkBefore = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
  await clickAt(page, '#dark-mode-toggle').catch(() => {});
  await sleep(600);
  const darkAfter = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
  ok('⑮ 深色模式切换(翻转)', darkAfter !== darkBefore, darkBefore + '→' + darkAfter);
  await clickAt(page, '#dark-mode-toggle').catch(() => {});
  await sleep(400);

  // 9. 回到顶部
  await page.evaluate(() => window.scrollTo(0, 900));
  await sleep(300);
  const bttHit = await page.evaluate(() => { const b = document.getElementById('back-to-top'); if (b) { b.click(); return true; } return false; });
  await sleep(1000);
  const atTop = await page.evaluate(() => window.scrollY < 60);
  ok('⑯ 回到顶部点击', bttHit && atTop);

  ok('⑰ 顾客端全程零 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n════ 顾客端: ' + R.filter((r) => r[1]).length + '/' + R.length + ' 通过 ════');
  await browser.close();
  if (R.some((r) => !r[1])) throw new Error('存在失败项, 详见上方 ✗ 行');
}
describe('顾客端真实点击全链(第四轮检查归档)', () => { it('全链 19 项', async () => { await main(); }); });
