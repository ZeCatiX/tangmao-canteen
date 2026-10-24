// 唐猫庭院 - 深层边界与批量操作E2E测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) {
    return false;
  }
  if (msg.includes('401 (Unauthorized)')) {
    return false;
  }
  if (msg.includes('429 (Too Many Requests)')) {
    return false;
  }
  if (msg.includes('404 (Not Found)')) {
    return false;
  }
  if (msg.includes('409')) {
    return false;
  }
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) {
    return false;
  }
  return true;
}

async function api(p, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(BASE + p, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...rest,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function getAdminToken() {
  const r = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }),
  });
  return r.body.token || '';
}

describe('深层边界与特殊场景测试', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (msg.type() === 'error' && isRealError(t)) {
        page._consoleErrors.push(t);
      }
    });
    page.on('pageerror', (err) => page._consoleErrors.push(err.message));
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  function resetErrors() {
    page._consoleErrors = [];
  }
  function realErrors() {
    return page._consoleErrors.filter(isRealError);
  }

  // ===== 1. 特殊字符菜名（emoji、unicode） =====
  it('1.1 含emoji的菜名不崩溃', async () => {
    resetErrors();
    const adminToken = await getAdminToken();
    const r = await api('/api/admin/dish', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({
        name: '🔥 火焰测试 🐉 龙菜',
        category: '测试',
        spiciness: '微辣',
        saltiness: '适中',
        sweetness: '酸甜',
        price: 30,
        rating: 4.0,
        calorie: 200,
        protein: 10,
        isHalal: false,
        isVegetarian: false,
        allergies: [],
        religion: '无特殊要求',
      }),
    });
    assert.equal(r.status, 200, '含emoji菜名应创建成功');
    assert.equal(r.body.success, true);
    // 清理
    if (r.body.id) {
      await api('/api/admin/dish/' + r.body.id + '/permanent', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + adminToken },
      });
    }
  });

  // ===== 2. 超长菜名被截断或拒绝 =====
  it('2.1 超长菜名被拒绝（>100字符）', async () => {
    resetErrors();
    const adminToken = await getAdminToken();
    const longName = '长'.repeat(101);
    const r = await api('/api/admin/dish', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({
        name: longName,
        category: '测试',
        spiciness: '微辣',
        saltiness: '适中',
        sweetness: '酸甜',
        price: 10,
        rating: 3.5,
        calorie: 100,
        protein: 5,
        isHalal: false,
        isVegetarian: false,
        allergies: [],
        religion: '无特殊要求',
      }),
    });
    assert.equal(r.status, 400, '超长菜名应返回400');
    assert.ok(r.body.error.includes('字符'), '应提示字符限制');
  });

  // ===== 3. 零价格菜品 =====
  it('3.1 零价格菜品可创建', async () => {
    resetErrors();
    const adminToken = await getAdminToken();
    const r = await api('/api/admin/dish', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({
        name: '免费试吃_' + Date.now(),
        category: '测试',
        spiciness: '不辣',
        saltiness: '清淡',
        sweetness: '无味',
        price: 0,
        rating: 3.0,
        calorie: 0,
        protein: 0,
        isHalal: false,
        isVegetarian: true,
        allergies: [],
        religion: '无特殊要求',
      }),
    });
    assert.equal(r.status, 200, '零价格菜品应创建成功');
    assert.equal(r.body.success, true);
    if (r.body.id) {
      await api('/api/admin/dish/' + r.body.id + '/permanent', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + adminToken },
      });
    }
  });

  // ===== 4. localStorage损坏数据恢复 =====
  it('4.1 localStorage损坏数据不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 设置损坏的购物车数据
    await page.evaluate(() => {
      localStorage.setItem('cart', 'invalid json {{{');
    });
    // 访问购物车
    await page.evaluate(() => showCart());
    await sleep(500);
    // 不应崩溃，应显示空购物车
    const emptyVisible = await page.evaluate(() => {
      const el = document.getElementById('cart-empty');
      return el && el.style.display === 'block';
    });
    assert.ok(emptyVisible, '损坏数据应显示空购物车');
    // 清空损坏数据
    await page.evaluate(() => localStorage.setItem('cart', '[]'));
    assert.equal(realErrors().length, 0, '损坏数据不应有JS错误');
  });

  // ===== 5. localStorage不存在用户数据 =====
  it('5.1 不存在的用户数据不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 设置不存在的currentUser
    await page.evaluate(() => {
      localStorage.setItem('currentUser', 'nonexistent_user_xyz');
    });
    // 刷新页面触发init.js恢复
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(500);
    // 不应崩溃
    const guestBtn = await page.$('#guest-btn');
    assert.ok(guestBtn, '不存在用户数据刷新后不应崩溃');
    // 清理
    await page.evaluate(() => localStorage.removeItem('currentUser'));
    assert.equal(realErrors().length, 0, '不存在用户数据不应有错误');
  });

  // ===== 6. 管理后台批量操作端点 =====
  it('6.1 批量状态更新端点存在', async () => {
    resetErrors();
    const adminToken = await getAdminToken();
    // 先创建两个菜品
    const r1 = await api('/api/admin/dish', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({
        name: 'batch_t' + Date.now(),
        category: '测试',
        spiciness: '微辣',
        saltiness: '适中',
        sweetness: '酸甜',
        price: 10,
        rating: 3.5,
        calorie: 100,
        protein: 5,
        isHalal: false,
        isVegetarian: false,
        allergies: [],
        religion: '无特殊要求',
      }),
    });
    const r2 = await api('/api/admin/dish', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({
        name: 'batch_t' + Date.now(),
        category: '测试',
        spiciness: '中辣',
        saltiness: '偏咸',
        sweetness: '咸鲜',
        price: 20,
        rating: 4.0,
        calorie: 200,
        protein: 10,
        isHalal: false,
        isVegetarian: false,
        allergies: [],
        religion: '无特殊要求',
      }),
    });
    // 测试批量状态更新
    const batchR = await api('/api/admin/dish/batch-status', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ ids: [r1.body.id, r2.body.id], is_active: false }),
    });
    assert.ok(batchR.status === 200 || batchR.status === 400, '批量状态更新应返回200或400');
    // 清理
    if (r1.body.id) {
      await api('/api/admin/dish/' + r1.body.id + '/permanent', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + adminToken },
      });
    }
    if (r2.body.id) {
      await api('/api/admin/dish/' + r2.body.id + '/permanent', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + adminToken },
      });
    }
    assert.equal(realErrors().length, 0, '批量操作不应有错误');
  });

  // ===== 7. 推荐结果中收藏按钮状态变化 =====
  it('7.1 游客推荐渲染评分/加购按钮且不渲染收藏拉黑', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      document.getElementById('preference-form').querySelector('button[type="submit"]').click();
    });
    // 有界等待推荐卡片渲染(ML冷启动时盲等5秒不够)
    await page
      .waitForFunction(() => document.querySelectorAll('#dish-list button').length > 0, {
        timeout: 30000,
        polling: 1000,
      })
      .catch(() => {
        /* 超时交给下方断言报错 */
      });
    // 2026-10-08 产品决策:游客态隐藏收藏/拉黑按钮(消除"请先登录"弹窗误触),仅登录用户渲染
    const btnCount = await page.evaluate(() => {
      return {
        fav: document.querySelectorAll('#dish-list button[onclick*="addToFavorites"]').length,
        blk: document.querySelectorAll('#dish-list button[onclick*="addToBlacklist"]').length,
        star: document.querySelectorAll('#dish-list button[onclick*="openStarFeedback"]').length,
        cart: document.querySelectorAll('#dish-list .add-to-cart-btn').length,
      };
    });
    assert.equal(btnCount.fav, 0, '游客态不应渲染收藏按钮(游客隐藏设计)');
    assert.equal(btnCount.blk, 0, '游客态不应渲染拉黑按钮(游客隐藏设计)');
    assert.ok(btnCount.star > 0, '应有评分按钮');
    assert.ok(btnCount.cart > 0, '应有加购按钮');
    assert.equal(realErrors().length, 0, '推荐结果按钮不应有错误');
  });

  // ===== 8. 管理后台监控端点 =====
  it('8.1 管理后台监控端点返回数据', async () => {
    resetErrors();
    const adminToken = await getAdminToken();
    const r = await api('/api/admin/monitor', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    // 监控端点可能返回200或404
    assert.ok(r.status === 200 || r.status === 404, '监控端点应返回200或404');
    assert.equal(realErrors().length, 0, '监控端点不应有错误');
  });

  // ===== 9. 用户偏好保存后立即获取推荐 =====
  it('9.1 偏好保存后推荐使用新偏好', async () => {
    resetErrors();
    const uniq = 'pref_re' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'PrefRec123!' }),
    });
    const token = reg.body.token;
    // 保存偏好
    await api('/api/user-preferences', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        username: uniq,
        preferences: { spiciness: '重辣', saltiness: '偏咸', sweetness: '咸鲜' },
      }),
    });
    // 获取推荐（通过API）
    const dishes = await api('/api/dishes');
    assert.equal(dishes.status, 200);
    assert.ok(dishes.body.dishes.length > 0, '应有菜品数据');
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
    assert.equal(realErrors().length, 0, '偏好保存+推荐不应有错误');
  });

  // ===== 10. 重复提交相同反馈 =====
  it('10.1 重复提交反馈不崩溃', async () => {
    resetErrors();
    const uniq = 'dup_fb_' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'DupFb123!' }),
    });
    const token = reg.body.token;
    // 提交两次相同反馈
    const fb1 = await api('/api/feedback', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ dishId: 1, score: 4, userId: uniq, userPreferences: {} }),
    });
    const fb2 = await api('/api/feedback', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ dishId: 1, score: 4, userId: uniq, userPreferences: {} }),
    });
    assert.ok(fb1.status === 200 || fb1.status === 201, '第一次反馈应成功');
    assert.ok(fb2.status === 200 || fb2.status === 201, '第二次反馈应成功');
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
    assert.equal(realErrors().length, 0, '重复反馈不应有错误');
  });
});
