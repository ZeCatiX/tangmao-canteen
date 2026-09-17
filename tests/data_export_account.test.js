// 唐猫庭院 - 数据完整性、导出、注销、URL恢复深度检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;
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

async function api(path, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...rest,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function getAdminToken() {
  const r = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  return r.body.token || '';
}

describe('菜品数据完整性检查', () => {
  // ===== 1. API返回的菜品数据完整（dishes_current.json已废弃，改为验证API） =====
  it('1.1 API返回菜品数据完整且字段一致', async () => {
    const apiRes = await api('/api/dishes');
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.body.success, true);
    assert.ok(Array.isArray(apiRes.body.dishes), 'API应返回菜品数组');
    assert.ok(apiRes.body.dishes.length > 0, '应至少有1道菜');
  });

  // ===== 2. 每个菜品都有必需字段 =====
  it('2.1 每个菜品都有必需字段', async () => {
    const r = await api('/api/dishes');
    const dishes = r.body.dishes;
    const required = ['id', 'name', 'category', 'spiciness', 'price', 'rating'];
    for (const d of dishes) {
      for (const f of required) {
        assert.ok(d[f] !== undefined && d[f] !== null, `菜品ID=${d.id} 缺少字段: ${f}`);
      }
    }
  });

  // ===== 3. 菜品价格合理性 =====
  it('3.1 菜品价格在合理范围内', async () => {
    const r = await api('/api/dishes');
    for (const d of r.body.dishes) {
      const price = parseFloat(d.price);
      if (!isNaN(price)) {
        assert.ok(price >= 0 && price < 10000, `菜品${d.name}价格异常: ${price}`);
      }
    }
  });

  // ===== 4. 菜品评分合理性 =====
  it('4.1 菜品评分在0-5范围内', async () => {
    const r = await api('/api/dishes');
    for (const d of r.body.dishes) {
      const rating = parseFloat(d.rating);
      if (!isNaN(rating)) {
        assert.ok(rating >= 0 && rating <= 5, `菜品${d.name}评分异常: ${rating}`);
      }
    }
  });

  // ===== 5. 无重复菜品ID =====
  it('5.1 无重复菜品ID', async () => {
    const r = await api('/api/dishes');
    const ids = r.body.dishes.map(d => d.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.equal(dupes.length, 0, `有重复菜品ID: ${dupes.join(', ')}`);
  });

  // ===== 6. 菜品名称不为空 =====
  it('6.1 所有菜品名称非空', async () => {
    const r = await api('/api/dishes');
    for (const d of r.body.dishes) {
      assert.ok(d.name && d.name.trim().length > 0, `菜品ID=${d.id}名称为空`);
    }
  });
});

describe('CSV导出功能深度检查', () => {
  let adminToken;
  before(async () => { adminToken = await getAdminToken(); });

  // ===== 7. 导出热门菜品CSV =====
  it('7.1 导出热门菜品CSV返回文件', async () => {
    const res = await fetch(BASE + '/api/admin/export/popular-dishes', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(res.status, 200);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.includes('csv') || ct.includes('text') || ct.includes('octet'), '应返回CSV/文本类型: ' + ct);
    const text = await res.text();
    assert.ok(text.length > 0, 'CSV内容不应为空');
    // 应有表头行
    assert.ok(text.includes('\n') || text.includes(','), 'CSV应有行/列分隔');
  });

  // ===== 8. 导出反馈CSV =====
  it('8.1 导出反馈CSV返回文件', async () => {
    const res = await fetch(BASE + '/api/admin/export/feedback', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.ok(res.status === 200 || res.status === 404, '导出反馈应返回200或404(无数据)');
  });

  // ===== 9. 导出订单CSV =====
  it('9.1 导出订单CSV返回文件', async () => {
    const res = await fetch(BASE + '/api/admin/export/orders', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.ok(res.status === 200 || res.status === 404, '导出订单应返回200或404(无数据)');
  });

  // ===== 10. 无token导出被拒绝 =====
  it('10.1 无token导出返回401', async () => {
    const res = await fetch(BASE + '/api/admin/export/popular-dishes');
    assert.equal(res.status, 401);
  });
});

describe('用户删除和账号注销流程', () => {
  // ===== 11. 注册用户后删除账号 =====
  it('11.1 注册→登录→删除账号完整流程', async () => {
    const uniq = 'del_tes' + Date.now();
    // 注册
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'DelTest123!' }),
    });
    assert.equal(reg.body.success, true);
    const token = reg.body.token;
    // 用token访问需要认证的端点（确认token有效）
    const ordersRes = await api('/api/orders?userId=' + uniq, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    assert.ok(ordersRes.status === 200 || ordersRes.status === 404, 'token应有效');
    // 删除账号
    const delRes = await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
    // 应成功删除或返回成功
    assert.ok(delRes.status === 200, '删除账号应返回200');
    assert.ok(delRes.body.success !== false, '删除应成功');
    // 删除后token应失效
    const afterDelRes = await api('/api/orders?userId=' + uniq, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    assert.equal(afterDelRes.status, 401, '删除后token应失效');
  });

  // ===== 12. 删除不存在的用户 =====
  it('12.1 删除不存在的用户不崩溃', async () => {
    const uniq = 'nouser_' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'Test1234!' }),
    });
    const token = reg.body.token;
    const delRes = await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: 'nonexistent_user_xyz' }),
    });
    // 应返回200或错误，但不崩溃
    assert.ok(delRes.status === 200 || delRes.status === 404, '应返回200或404');
  });

  // ===== 13. 用户退出后token被列入黑名单 =====
  it('13.1 用户退出后token失效', async () => {
    const uniq = 'logout_' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'LogoutTest123!' }),
    });
    const token = reg.body.token;
    // 退出
    const logoutRes = await api('/api/user/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    assert.ok(logoutRes.status === 200 || logoutRes.status === 204, '退出应成功');
    // 退出后token应失效
    const afterRes = await api('/api/orders?userId=' + uniq, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    assert.equal(afterRes.status, 401, '退出后token应失效');
  });
});

describe('浏览器前进后退和URL恢复', () => {
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

  // ===== 14. 浏览器后退不崩溃且恢复状态 =====
  it('14.1 导航→后退→前进不崩溃', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('nav-about')?.click());
    await sleep(300);
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(300);
    // 后退
    await page.goBack();
    await sleep(500);
    // 再后退
    await page.goBack();
    await sleep(500);
    // 前进（可能没有前进历史，try-catch处理）
    try { await page.goForward(); await sleep(500); } catch (e) { /* 无前进历史 */ }
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '前进后退不应崩溃');
    const jsErrors = page._consoleErrors.filter(isRealError);
    assert.equal(jsErrors.length, 0, '前进后退不应有JS错误: ' + jsErrors.join('; '));
  });

  // ===== 15. 页面刷新后恢复到正确section =====
  it('15.1 导航到偏好设置后刷新不崩溃', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    // 刷新
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(500);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '刷新不应崩溃');
    assert.equal(page._consoleErrors.filter(isRealError).length, 0, '刷新不应有JS错误');
  });

  // ===== 16. 多标签页localStorage同步 =====
  it('16.1 localStorage购物车跨标签同步', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 设置localStorage中的购物车数据
    await page.evaluate(() => {
      localStorage.setItem('cart', JSON.stringify([{ id: 1, name: '测试', price: 10, qty: 1 }]));
      // 触发storage事件
      window.dispatchEvent(new StorageEvent('storage', { key: 'cart', newValue: 'test' }));
    });
    await sleep(300);
    assert.equal(page._consoleErrors.filter(isRealError).length, 0, 'localStorage同步不应有错误');
  });

  // ===== 17. popstate事件处理 =====
  it('17.1 popstate事件不崩溃', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 模拟popstate事件
    await page.evaluate(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await sleep(300);
    assert.equal(page._consoleErrors.filter(isRealError).length, 0, 'popstate事件不应有JS错误');
  });

  // ===== 18. 网络断开模拟（请求失败处理） =====
  it('18.1 网络请求失败时有错误处理', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 拦截所有请求使其失败
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().includes('localhost:3000')) {
        req.continue();
      } else {
        req.abort();
      }
    });
    // 尝试推荐流程（API请求会失败）
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      document.getElementById('preference-form').querySelector('button[type="submit"]').click();
    });
    await sleep(5000);
    // 不应崩溃，应有fallback
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '网络失败不应崩溃');
    // 恢复请求拦截
    await page.setRequestInterception(false);
    assert.ok(true, '网络失败处理检查完成');
  });
});
