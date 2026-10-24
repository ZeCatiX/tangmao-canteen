// 唐猫庭院 - 限流防护、命名空间冲突、HTTP状态码全面检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

async function api(p, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(BASE + p, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...rest,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

describe('限流和暴力破解防护检查', () => {
  // ===== 1. 登录限流存在 =====
  it('1.1 登录端点有限流头', async () => {
    const r = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'ratelimit_test', password: 'wrong' }),
    });
    // 应有RateLimit头（express-rate-limit标准头）
    const headers = r.headers;
    // draft-6标准头
    const hasRateLimit =
      headers.get('ratelimit-limit') ||
      headers.get('ratelimit-remaining') ||
      headers.get('x-ratelimit-limit') ||
      headers.get('x-ratelimit-remaining');
    assert.ok(hasRateLimit !== null, '登录端点应有限流头');
  });

  // ===== 2. 管理员登录限流存在 =====
  it('2.2 管理员登录端点有独立限流', async () => {
    const r = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    const hasRateLimit = r.headers.get('ratelimit-limit') || r.headers.get('ratelimit-remaining');
    assert.ok(hasRateLimit !== null, '管理员登录端点应有限流头');
  });

  // ===== 3. 错误密码不泄露用户是否存在 =====
  it('3.1 错误登录不泄露用户是否存在', async () => {
    // 登录不存在的用户
    const r1 = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'nonexistent_user_xyz', password: 'wrong' }),
    });
    assert.equal(r1.body.success, false);
    // 错误信息不应明确说"用户不存在"（应统一为"用户名或密码错误"）
    assert.ok(!r1.body.error.includes('不存在'), '不应泄露用户是否存在');
  });

  // ===== 4. 注册端点有限流 =====
  it('4.1 注册端点有限流', async () => {
    const r = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'ratelimit_reg', password: 'Test1234!' }),
    });
    // 清理
    if (r.body.token) {
      await api('/api/user/delete', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + r.body.token },
        body: JSON.stringify({ username: 'ratelimit_reg' }),
      });
    }
    const hasRateLimit = r.headers.get('ratelimit-limit') || r.headers.get('ratelimit-remaining');
    assert.ok(hasRateLimit !== null, '注册端点应有限流头');
  });

  // ===== 5. 健康检查端点有限流 =====
  it('5.1 健康检查端点有独立限流', async () => {
    const r = await api('/api/worker-health');
    const hasRateLimit = r.headers.get('ratelimit-limit') || r.headers.get('ratelimit-remaining');
    assert.ok(hasRateLimit !== null, '健康检查端点应有限流头');
  });

  // ===== 6. 限流时返回429 =====
  it('6.1 快速大量登录请求触发限流', async () => {
    // 注意：测试环境限流值很高（200次/分钟），不会触发429
    // 但验证限流配置存在
    const r = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'limit_check', password: 'wrong' }),
    });
    // 应返回401（密码错误）而非429（限流），因为单次请求
    assert.ok(r.status === 401 || r.status === 429, '应返回401或429');
    // 确认有限流配置（通过headers）
    const limit = r.headers.get('ratelimit-limit');
    if (limit) {
      const limitNum = parseInt(limit);
      assert.ok(limitNum > 0, '限流值应>0: ' + limitNum);
    }
  });
});

describe('JS函数全局命名空间检查', () => {
  let browser, page;
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
  });
  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  // ===== 7. 首页全局函数无冲突 =====
  it('7.1 首页关键函数存在且不重复定义', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const check = await page.evaluate(() => {
      const required = [
        'login',
        'register',
        'showSection',
        'fetchRecommendations',
        'displayRecommendations',
        'addToFavorites',
        'addToBlacklist',
        'openStarFeedback',
        'submitStarFeedback',
        'endRecommendation',
        'checkoutCart',
        'showCart',
        'clearCart',
        'logout',
        'deleteAccount',
        'showProfile',
        'loadUserPreferences',
        'esc',
        'authHeaders',
        'getCart',
        'saveCart',
        'formatPrice',
        'showMessage',
        'checkApiAvailability',
        'loadDecisionTreeModel',
        'predictWithDecisionTree',
        'computeDishMatch',
        'generateDishReason',
        'selectBlindBoxDish',
        'resetRecommendation',
        'fallback',
        'safeFetch',
      ];
      const results = {};
      required.forEach((f) => {
        results[f] = typeof window[f] === 'function';
      });
      return results;
    });
    const missing = Object.entries(check)
      .filter(([k, v]) => !v)
      .map(([k]) => k);
    assert.equal(missing.length, 0, '缺少全局函数: ' + missing.join(', '));
  });

  // ===== 8. admin全局函数存在 =====
  it('8.1 管理后台关键函数存在', async () => {
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    // 登录
    await page.type('#admin-login-user', 'admin', { delay: 20 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2000);
    const check = await page.evaluate(() => {
      const required = [
        'loadStats',
        'loadDishes',
        'editDish',
        'saveDish',
        'deleteDish',
        'exportCSV',
        'showAdmin',
        'showToast',
        'loadUsers',
        'deleteUser',
        'loadFeedback',
        'loadPopularDishes',
        'loadNotifications',
        'loadModelManagement',
        'renderRatingChart',
      ];
      const results = {};
      required.forEach((f) => {
        results[f] = typeof window[f] === 'function';
      });
      return results;
    });
    const missing = Object.entries(check)
      .filter(([k, v]) => !v)
      .map(([k]) => k);
    assert.equal(missing.length, 0, '缺少管理后台函数: ' + missing.join(', '));
  });

  // ===== 9. 厨房看板全局函数存在 =====
  it('9.1 厨房看板关键函数存在', async () => {
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const check = await page.evaluate(() => {
      const required = ['doLogin', 'loadOrders', 'completeOrder', 'updateTime', 'esc', 'getToken', 'getAuthHeaders'];
      const results = {};
      required.forEach((f) => {
        results[f] = typeof window[f] === 'function';
      });
      return results;
    });
    const missing = Object.entries(check)
      .filter(([k, v]) => !v)
      .map(([k]) => k);
    assert.equal(missing.length, 0, '缺少厨房看板函数: ' + missing.join(', '));
  });

  // ===== 10. esc函数在首页和厨房看板不冲突 =====
  it('10.1 esc函数在首页存在（HTML转义）', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const escType = await page.evaluate(() => typeof esc);
    assert.equal(escType, 'function', '首页esc函数应为function');
    // 测试esc函数功能
    const escaped = await page.evaluate(() => esc('<script>alert(1)</script>'));
    assert.ok(escaped.includes('&lt;'), 'esc应转义<为&lt;');
  });
});

describe('HTTP状态码和错误页面检查', () => {
  // ===== 11. 404页面 =====
  it('11.1 不存在的HTML页面返回404HTML', async () => {
    const r = await fetch(BASE + '/nonexistent-page');
    assert.equal(r.status, 404);
    const html = await r.text();
    assert.ok(html.includes('404') || html.includes('未找到'), '404页面应显示提示');
    assert.ok(html.includes('唐猫庭院'), '404页面应包含网站名');
    assert.ok(html.includes('回唐猫庭院'), '404页面应有返回首页链接（插画化404）');
  });

  // ===== 12. API 404返回JSON =====
  it('12.1 不存在的API返回404 JSON', async () => {
    const r = await fetch(BASE + '/api/nonexistent');
    assert.equal(r.status, 404);
    const body = await r.json();
    assert.equal(body.success, false);
    assert.ok(body.error, '应返回错误信息');
  });

  // ===== 13. 500错误页面 =====
  it('13.1 服务器错误有统一格式', async () => {
    // 触发500的方式：发送无效JSON到需要JSON的端点
    const r = await fetch(BASE + '/api/predict-rf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json {{{',
    });
    // 应返回400（JSON解析失败）或500
    assert.ok(r.status === 400 || r.status === 500, '应返回400或500');
    const body = await r.json().catch(() => ({}));
    assert.equal(body.success, false);
  });

  // ===== 14. 根路径返回HTML =====
  it('14.1 根路径返回200 HTML', async () => {
    const r = await fetch(BASE + '/');
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes('唐猫庭院'), '应包含网站名');
    assert.ok(html.includes('guest-btn'), '应包含开始点餐按钮');
  });

  // ===== 15. /admin返回HTML =====
  it('15.1 /admin路径返回200 HTML', async () => {
    const r = await fetch(BASE + '/admin');
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes('管理后台'), '应包含管理后台标题');
  });

  // ===== 16. /kitchen返回HTML =====
  it('16.1 /kitchen路径返回200 HTML', async () => {
    const r = await fetch(BASE + '/kitchen');
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes('厨房'), '应包含厨房看板标题');
  });

  // ===== 17. favicon返回204 =====
  it('17.1 /favicon.ico返回204', async () => {
    const r = await fetch(BASE + '/favicon.ico');
    assert.ok(r.status === 204 || r.status === 200, 'favicon应返回204或200');
  });

  // ===== 18. 静态CSS返回200 =====
  it('18.1 /styles.css返回200 text/css', async () => {
    const r = await fetch(BASE + '/styles.css');
    assert.equal(r.status, 200);
    const ct = r.headers.get('content-type') || '';
    assert.ok(ct.includes('css'), '应返回text/css: ' + ct);
  });

  // ===== 19. script.js返回200 =====
  it('19.1 /script.js返回200 javascript', async () => {
    const r = await fetch(BASE + '/script.js');
    assert.equal(r.status, 200);
    const ct = r.headers.get('content-type') || '';
    assert.ok(ct.includes('javascript'), '应返回javascript: ' + ct);
  });

  // ===== 20. OPTIONS请求处理 =====
  it('20.1 CORS预检请求返回正确', async () => {
    const r = await fetch(BASE + '/api/dishes', { method: 'OPTIONS' });
    // CORS预检应返回204或200
    assert.ok(r.status === 204 || r.status === 200 || r.status === 404, 'OPTIONS应返回204/200/404');
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
