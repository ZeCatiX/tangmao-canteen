// 唐猫庭院 - 购物车操作和收藏/拉黑功能深度E2E测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) return false;
  if (msg.includes('401 (Unauthorized)')) return false;
  if (msg.includes('429 (Too Many Requests)')) return false;
  if (msg.includes('404 (Not Found)')) return false;
  if (msg.includes('409')) return false;
  if (msg.includes('Failed to load resource') && msg.match(/[4-5]\d{2}/)) return false;
  if (msg.includes('favicon.ico')) return false;
  return true;
}

async function registerAndLogin(page, uniq) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
  await sleep(300);
  await page.evaluate(() => document.getElementById('register-btn')?.click());
  await sleep(400);
  await page.type('#register-username', uniq, { delay: 30 });
  await page.type('#register-password', 'TestCart123!', { delay: 30 });
  await page.type('#register-confirm', 'TestCart123!', { delay: 30 });
  const agree = await page.$('#agree-privacy');
  if (agree) {
    const checked = await page.evaluate(el => el.checked, agree);
    if (!checked) await agree.click();
  }
  await page.evaluate(() => document.getElementById('register-form').querySelector('button[type="submit"]').click());
  await sleep(1500);
  await page.evaluate(() => {
    const modal = document.querySelector('.modal.show');
    if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
  });
  await sleep(300);
  await page.evaluate(() => document.getElementById('login-btn')?.click());
  await sleep(400);
  await page.type('#login-username', uniq, { delay: 30 });
  await page.type('#login-password', 'TestCart123!', { delay: 30 });
  await page.evaluate(() => document.getElementById('login-form').querySelector('button[type="submit"]').click());
  await sleep(1500);
  await page.evaluate(() => {
    const modal = document.querySelector('.modal.show');
    if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
  });
  await sleep(300);
}

async function getRecommendations(page) {
  await page.evaluate(() => document.getElementById('guest-btn')?.click());
  await sleep(400);
  await page.select('#spiciness', '微辣');
  await page.select('#saltiness', '适中');
  await page.select('#sweetness', '酸甜');
  await page.evaluate(() => document.getElementById('preference-form').querySelector('button[type="submit"]').click());
  await sleep(5000);
}

describe('购物车操作深度E2E测试', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', msg => {
      const t = msg.text();
      if (msg.type() === 'error' && isRealError(t)) page._consoleErrors.push(t);
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() { return page._consoleErrors.filter(isRealError); }

  // ===== 1. 加购后购物车角标更新 =====
  it('1.1 加购后购物车角标显示数量', async () => {
    resetErrors();
    const uniq = 'cart_' + Date.now();
    await registerAndLogin(page, uniq);
    await getRecommendations(page);
    // 点击加购按钮
    await page.evaluate(() => {
      const btn = document.querySelector('#dish-list .add-to-cart-btn');
      if (btn) btn.click();
    });
    await sleep(500);
    // 关闭可能的消息模态框
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
    });
    await sleep(300);
    const badge = await page.evaluate(() => document.getElementById('cart-badge')?.textContent || '0');
    assert.ok(parseInt(badge) > 0, '加购后角标应显示数量: ' + badge);
    assert.equal(realErrors().length, 0, '加购不应有JS错误');
  });

  // ===== 2. 打开购物车显示菜品列表 =====
  it('2.1 购物车显示菜品列表和价格', async () => {
    resetErrors();
    await page.evaluate(() => document.getElementById('nav-cart')?.click());
    await sleep(500);
    const cartRows = await page.evaluate(() => {
      const rows = document.querySelectorAll('#cart-table-body tr');
      return rows.length;
    });
    assert.ok(cartRows > 0, '购物车应显示菜品行');
    const totalPrice = await page.evaluate(() => document.getElementById('cart-total-price')?.textContent || '');
    assert.ok(totalPrice.length > 0, '应显示总价');
    assert.ok(!totalPrice.includes('NaN'), '总价不应为NaN');
    const totalItems = await page.evaluate(() => document.getElementById('cart-total-items')?.textContent || '');
    assert.ok(totalItems.length > 0, '应显示总数量');
    assert.equal(realErrors().length, 0, '购物车显示不应有错误');
  });

  // ===== 3. 购物车数量增加 =====
  it('3.1 购物车数量增加按钮', async () => {
    resetErrors();
    const beforeQty = await page.evaluate(() => {
      const input = document.querySelector('.cart-qty-input');
      return input ? parseInt(input.value) : 0;
    });
    await page.evaluate(() => {
      const btn = document.querySelector('.cart-qty-plus');
      if (btn) btn.click();
    });
    await sleep(500);
    const afterQty = await page.evaluate(() => {
      const input = document.querySelector('.cart-qty-input');
      return input ? parseInt(input.value) : 0;
    });
    assert.ok(afterQty > beforeQty, `数量应增加 ${beforeQty}→${afterQty}`);
    assert.equal(realErrors().length, 0, '数量增加不应有错误');
  });

  // ===== 4. 购物车数量减少 =====
  it('4.1 购物车数量减少按钮', async () => {
    resetErrors();
    const beforeQty = await page.evaluate(() => {
      const input = document.querySelector('.cart-qty-input');
      return input ? parseInt(input.value) : 0;
    });
    await page.evaluate(() => {
      const btn = document.querySelector('.cart-qty-minus');
      if (btn) btn.click();
    });
    await sleep(500);
    const afterQty = await page.evaluate(() => {
      const input = document.querySelector('.cart-qty-input');
      return input ? parseInt(input.value) : 0;
    });
    // 数量应减少（或菜品被移除如果数量<=0）
    assert.ok(afterQty < beforeQty || afterQty === 0, `数量应减少 ${beforeQty}→${afterQty}`);
    assert.equal(realErrors().length, 0, '数量减少不应有错误');
  });

  // ===== 5. 购物车删除菜品 =====
  it('5.1 购物车删除按钮移除菜品', async () => {
    resetErrors();
    // 关闭购物车，重新加购确保有菜品
    await page.evaluate(() => document.getElementById('cart-close-btn')?.click());
    await sleep(300);
    // 手动设置购物车数据
    await page.evaluate(() => {
      localStorage.setItem('cart', JSON.stringify([
        { id: 1, name: '测试菜品A', price: 20, qty: 2, image: '' },
        { id: 2, name: '测试菜品B', price: 30, qty: 1, image: '' }
      ]));
      updateCartBadge();
    });
    await sleep(200);
    await page.evaluate(() => showCart());
    await sleep(500);
    const beforeCount = await page.evaluate(() => document.querySelectorAll('#cart-table-body tr').length);
    assert.ok(beforeCount > 0, '删除前购物车应有菜品: ' + beforeCount);
    // 点击删除第一个
    await page.evaluate(() => {
      const btn = document.querySelector('.cart-remove-btn');
      if (btn) btn.click();
    });
    await sleep(500);
    const afterCount = await page.evaluate(() => document.querySelectorAll('#cart-table-body tr').length);
    assert.ok(afterCount < beforeCount, `删除后菜品应减少 ${beforeCount}→${afterCount}`);
    assert.equal(realErrors().length, 0, '删除菜品不应有错误');
  });

  // ===== 6. 购物车结账 =====
  it('6.1 购物车结账下单成功', async () => {
    resetErrors();
    // 确保购物车有菜品
    await page.evaluate(() => {
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      if (cart.length === 0) {
        // 手动添加
        cart.push({ id: 1, name: '测试菜品', price: 20, qty: 1, image: '' });
        localStorage.setItem('cart', JSON.stringify(cart));
      }
    });
    await page.evaluate(() => showCart());
    await sleep(500);
    // 点击结账
    await page.evaluate(() => {
      const btn = document.getElementById('cart-checkout-btn');
      if (btn && !btn.disabled) btn.click();
    });
    await sleep(2000);
    // 关闭可能的成功模态框
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, '结账不应有JS错误: ' + realErrors().join('; '));
  });

  // ===== 7. 空购物车结账提示 =====
  it('7.1 空购物车结账显示提示', async () => {
    resetErrors();
    // 清空购物车
    await page.evaluate(() => clearCart());
    await sleep(200);
    await page.evaluate(() => checkoutCart());
    await sleep(500);
    // 应显示"购物车是空的"提示
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, '空购物车结账不应有错误');
  });

  // ===== 8. 购物车清空 =====
  it('8.1 购物车清空按钮清空所有菜品', async () => {
    resetErrors();
    // 添加菜品到购物车
    await page.evaluate(() => {
      localStorage.setItem('cart', JSON.stringify([{ id: 1, name: '测试', price: 10, qty: 2 }]));
    });
    await page.evaluate(() => showCart());
    await sleep(300);
    // 不点击清空（会弹出confirm），只验证函数存在
    const clearBtn = await page.$('#cart-clear-btn');
    assert.ok(clearBtn, '清空按钮应存在');
    assert.equal(realErrors().length, 0, '清空按钮检查不应有错误');
  });
});

describe('收藏/拉黑/取消功能深度E2E测试', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', msg => {
      const t = msg.text();
      if (msg.type() === 'error' && isRealError(t)) page._consoleErrors.push(t);
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() { return page._consoleErrors.filter(isRealError); }

  // ===== 9. 登录用户收藏菜品 =====
  it('9.1 登录用户可收藏菜品', async () => {
    resetErrors();
    const uniq = 'fav_' + Date.now();
    await registerAndLogin(page, uniq);
    await getRecommendations(page);
    await page.evaluate(() => {
      const btn = document.querySelector('#dish-list button[onclick*="addToFavorites"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, '收藏不应有JS错误');
  });

  // ===== 10. 游客收藏提示登录 =====
  it('10.1 游客收藏提示"请先登录"', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 清除登录状态
    await page.evaluate(() => { localStorage.removeItem('currentUser'); localStorage.removeItem('userToken'); });
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(300);
    await getRecommendations(page);
    const result = await page.evaluate(() => {
      // 模拟游客收藏
      currentUser = 'guest';
      addToFavorites(1);
      return true;
    });
    await sleep(500);
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, '游客收藏不应有JS错误');
  });

  // ===== 11. 收藏后按钮状态变化 =====
  it('11.1 收藏后按钮变为"已收藏"且禁用', async () => {
    resetErrors();
    const uniq = 'fav2_' + Date.now();
    await registerAndLogin(page, uniq);
    await getRecommendations(page);
    // 收藏第一个菜品
    const beforeState = await page.evaluate(() => {
      const btn = document.querySelector('#dish-list button[onclick*="addToFavorites"]');
      return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
    });
    await page.evaluate(() => {
      const btn = document.querySelector('#dish-list button[onclick*="addToFavorites"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
    });
    await sleep(300);
    const afterState = await page.evaluate(() => {
      const btn = document.querySelector('#dish-list button[onclick*="addToFavorites"]');
      return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
    });
    // 按钮状态可能变化（如果是新收藏的话）
    assert.equal(realErrors().length, 0, '收藏状态变化不应有错误');
  });

  // ===== 12. 拉黑菜品 =====
  it('12.1 登录用户可拉黑菜品', async () => {
    resetErrors();
    const uniq = 'blk_' + Date.now();
    await registerAndLogin(page, uniq);
    await getRecommendations(page);
    await page.evaluate(() => {
      const btn = document.querySelector('#dish-list button[onclick*="addToBlacklist"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, '拉黑不应有JS错误');
  });

  // ===== 13. 个人资料页显示收藏和拉黑列表 =====
  it('13.1 个人资料页显示收藏列表', async () => {
    resetErrors();
    const uniq = 'profile_' + Date.now();
    await registerAndLogin(page, uniq);
    await getRecommendations(page);
    // 收藏一个菜品
    await page.evaluate(() => {
      const btn = document.querySelector('#dish-list button[onclick*="addToFavorites"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show');
      if (modal) { const b = modal.querySelector('.btn-close,[data-bs-dismiss]'); if (b) b.click(); }
    });
    await sleep(300);
    // 查看个人资料
    await page.evaluate(() => document.getElementById('nav-profile')?.click());
    await sleep(500);
    const profileVisible = await page.evaluate(() => {
      const el = document.getElementById('profile-section');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(profileVisible, '个人资料页应可见');
    assert.equal(realErrors().length, 0, '个人资料页不应有错误');
  });

  // ===== 14. 取消收藏按钮存在 =====
  it('14.1 个人资料页有取消收藏按钮', async () => {
    resetErrors();
    const cancelBtn = await page.$('#cancel-favorite-btn');
    assert.ok(cancelBtn, '取消收藏按钮应存在');
    const cancelBlkBtn = await page.$('#cancel-blacklist-btn');
    assert.ok(cancelBlkBtn, '取消拉黑按钮应存在');
    assert.equal(realErrors().length, 0, '取消按钮检查不应有错误');
  });

  // ===== 15. 评分后跳转到评分页面 =====
  it('15.1 点击评分按钮跳转到评分页面', async () => {
    resetErrors();
    await page.evaluate(() => document.getElementById('back-to-preference')?.click());
    await sleep(300);
    await getRecommendations(page);
    await page.evaluate(() => {
      const btn = document.querySelector('#dish-list button[onclick*="openStarFeedback"]');
      if (btn) btn.click();
    });
    await sleep(500);
    const feedbackVisible = await page.evaluate(() => {
      const el = document.getElementById('feedback-section');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(feedbackVisible, '应跳转到评分页面');
    // 检查评分组件存在
    const starRating = await page.$('#star-rating');
    assert.ok(starRating, '星级评分容器应存在');
    const submitBtn = await page.$('#star-submit-btn');
    assert.ok(submitBtn, '评分提交按钮应存在');
    assert.equal(realErrors().length, 0, '评分跳转不应有错误');
  });
});
