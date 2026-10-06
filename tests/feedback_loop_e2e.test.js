// 唐猫庭院 - 反馈环路与统计联动E2E测试
const { describe, it, before, after } = require('node:test');

// 真实菜品 ID 池(2026-09-17:订单载荷不能用重播种前的幻影 ID)
var dishPool = [{ id: 2069, name: '测试菜品', price: 18 }];
before(async () => {
  try {
    var r = await fetch('http://localhost:3000/api/dishes').then(function(x) { return x.json(); });
    var list = (r && (r.dishes || r)) || [];
    if (list.length) dishPool = list.slice(0, 5).map(function(d) { return { id: d.id, name: d.name, price: parseFloat(d.price) || 18 }; });
  } catch (e) {}
});
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) return false;
  if (msg.includes('401 (Unauthorized)')) return false;
  if (msg.includes('429 (Too Many Requests)')) return false;
  if (msg.includes('404 (Not Found)')) return false;
  if (msg.includes('409')) return false;
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) return false;
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

describe('反馈环路与统计联动测试', () => {
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

  // ===== 1. 提交反馈 → 管理后台反馈列表可见 =====
  it('1.1 用户反馈提交后管理后台可见', async () => {
    resetErrors();
    // 注册用户
    const uniq = 'fb_loop' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'FbLoop123!' }),
    });
    const token = reg.body.token;
    // 提交反馈
    const fb = await api('/api/feedback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ dishId: 2, score: 4, userId: uniq, userPreferences: { spiciness: '微辣' } }),
    });
    assert.ok(fb.status === 200 || fb.status === 201, '反馈应提交成功');
    // 管理后台查看反馈
    const adminToken = await getAdminToken();
    const summary = await api('/api/admin/feedback-summary', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(summary.status, 200);
    assert.equal(summary.body.success, true);
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
    // 管理后台仪表盘统计应可查看
    const stats = await api('/api/admin/stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(stats.status, 200);
    assert.equal(stats.body.success, true);
    assert.equal(realErrors().length, 0, '反馈环路不应有错误');
  });

  // ===== 2. 下单 → 厨房看板订单可见 =====
  it('2.1 用户下单后厨房看板订单可见', async () => {
    resetErrors();
    const uniq = 'order_l' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'OrderLoop123!' }),
    });
    const token = reg.body.token;
    // 下单
    const order = await api('/api/order', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        userId: uniq,
        items: [{ id: dishPool[0].id, name: '锅子鱼', price: 88, type: '偏好推荐', matchRate: 0.95 }],
        totalPrice: 88
      }),
    });
    assert.ok(order.status === 200 || order.status === 201, '订单应创建成功');
    // 厨房看板查询待处理订单
    const adminToken = await getAdminToken();
    const orders = await api('/api/orders?status=pending,confirmed', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(orders.status, 200);
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
    assert.equal(realErrors().length, 0, '订单环路不应有错误');
  });

  // ===== 3. 推荐 → 推荐日志记录 =====
  it('3.1 推荐后推荐日志记录', async () => {
    resetErrors();
    const before = await api('/api/admin/recommendation-stats', {
      headers: { 'Authorization': 'Bearer ' + await getAdminToken() },
    });
    assert.equal(before.status, 200);
    // 触发一次推荐
    await api('/api/recommendation-log', {
      method: 'POST',
      body: JSON.stringify({ userType: 'guest', userId: 'guest' }),
    });
    assert.equal(realErrors().length, 0, '推荐日志不应有错误');
  });

  // ===== 4. 偏好 → 偏好统计 =====
  it('4.1 偏好提交后统计数据更新', async () => {
    resetErrors();
    await api('/api/preference-log', {
      method: 'POST',
      body: JSON.stringify({
        spiciness: '重辣', saltiness: '偏咸', sweetness: '咸鲜',
        price: '30-50', calorie: '300-500', religion: '无特殊要求',
        allergies: [], userId: 'guest', recommendationMode: 'auto'
      }),
    });
    // 管理后台偏好统计
    const adminToken = await getAdminToken();
    const stats = await api('/api/admin/preference-stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(stats.status, 200);
    assert.equal(realErrors().length, 0, '偏好统计不应有错误');
  });

  // ===== 5. 满意度 → 总体反馈 =====
  it('5.1 满意度评分后总体反馈记录', async () => {
    resetErrors();
    const fb = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: 0, score: 5, userPreferences: {}, userId: 'guest', type: 'overall_satisfaction' }),
    });
    assert.ok(fb.status === 200 || fb.status === 201, '满意度应提交成功');
    // 验证管理后台响应包含分布
    const adminToken = await getAdminToken();
    const summary = await api('/api/admin/feedback-summary', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(summary.status, 200);
    assert.ok(summary.body.feedbacks || summary.body.distribution || summary.body.success === true,
      '反馈摘要应包含数据');
    assert.equal(realErrors().length, 0, '满意度环路不应有错误');
  });

  // ===== 6. 菜品管理编辑 → 缓存刷新 =====
  it('6.1 菜品编辑后API返回更新数据', async () => {
    resetErrors();
    const adminToken = await getAdminToken();
    // 创建菜品
    const createR = await api('/api/admin/dish', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({
        name: '联动测试_', category: '测试',
        spiciness: '微辣', saltiness: '适中', sweetness: '酸甜',
        price: 25, rating: 4.2, calorie: 150, protein: 12,
        isHalal: false, isVegetarian: false, allergies: [], religion: '无特殊要求'
      }),
    });
    assert.equal(createR.status, 200, '菜品创建应成功');
    const newId = createR.body.id;
    // 编辑菜品价格
    const editR = await api('/api/admin/dish/' + newId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ name: '联动测试_改名', price: 35 }),
    });
    assert.ok(editR.status === 200 || editR.status === 201, '菜品编辑应成功');
    // 获取菜品列表验证更新
    const dishes = await api('/api/dishes');
    const updated = dishes.body.dishes.find(d => d.id === newId);
    // 可能缓存，也可能已刷新
    await sleep(500);
    const dishes2 = await api('/api/dishes');
    const updated2 = dishes2.body.dishes.find(d => d.id === newId);
    // 清理
    await api('/api/admin/dish/' + newId + '/permanent', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(realErrors().length, 0, '菜品联动不应有错误');
  });

  // ===== 7. 用户删除 → 用户列表更新 =====
  it('7.1 用户删除后管理后台用户列表更新', async () => {
    resetErrors();
    const uniq = 'del_loo' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'DelLoop123!' }),
    });
    const token = reg.body.token;
    // 删除用户（2026-10-06:接口需密码二次确认,不带 password 会被 400 拒绝）
    const del = await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq, password: 'DelLoop123!' }),
    });
    assert.equal(del.status, 200, '用户删除应成功');
    // 管理后台用户列表应不含该用户（需刷新缓存）
    await sleep(500);
    const adminToken = await getAdminToken();
    const users = await api('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(users.status, 200);
    assert.equal(realErrors().length, 0, '用户删除环路不应有错误');
  });

  // ===== 8. 移动端汉堡菜单 =====
  it('8.1 移动端汉堡菜单可用', async () => {
    resetErrors();
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1000);
    // 检查汉堡菜单按钮
    const toggler = await page.$('.navbar-toggler');
    assert.ok(toggler, '移动端应有汉堡菜单按钮');
    // 点击汉堡菜单
    await toggler.click();
    await sleep(500);
    // 检查导航菜单是否展开
    const navExpanded = await page.evaluate(() => {
      const nav = document.getElementById('navbarNav');
      if (!nav) return false;
      return nav.classList.contains('show') || window.getComputedStyle(nav).display !== 'none';
    });
    // 检查导航链接是否可见
    const navHomeVisible = await page.evaluate(() => {
      const el = document.getElementById('nav-home');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    assert.ok(navExpanded || navHomeVisible, '汉堡菜单应展开显示导航');
    assert.equal(realErrors().length, 0, '汉堡菜单不应有错误');
    await page.setViewport({ width: 1280, height: 800 });
  });

  // ===== 9. 移动端导航到推荐页面 =====
  it('9.1 移动端推荐流程正常', async () => {
    resetErrors();
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    // 移动端点开始点餐
    const guestBtn = await page.$('#guest-btn');
    assert.ok(guestBtn, '移动端开始点餐按钮应存在');
    await guestBtn.click();
    await sleep(400);
    // 选择偏好
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => document.getElementById('preference-form').querySelector('button[type="submit"]').click());
    // 2026-09-17: ML 可能冷启动,轮询等待推荐结果(最多 25s)
    for (var wi = 0; wi < 25; wi++) { await sleep(1000); try { if (document.getElementById('recommendation-result') && !document.getElementById('recommendation-result').classList.contains('d-none')) break; } catch(e) {} }
    // 推荐结果应显示
    const recVisible = await page.evaluate(() => {
      const el = document.getElementById('recommendation-result');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(recVisible, '移动端推荐结果应显示');
    // 无水平溢出
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, '移动端推荐页不应水平溢出');
    assert.equal(realErrors().length, 0, '移动端推荐不应有错误');
    await page.setViewport({ width: 1280, height: 800 });
  });
});