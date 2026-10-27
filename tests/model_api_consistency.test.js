// 唐猫庭院 - 模型管理、API数据结构一致性深度E2E测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
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

describe('API响应数据结构一致性检查', () => {
  let adminToken;
  let userToken;
  let testUser;

  before(async () => {
    adminToken = await getAdminToken();
    testUser = 'struct_' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: testUser, password: 'Struct123!' }),
    });
    userToken = reg.body.token;
    if (!userToken) {
      console.warn('注册失败（可能限流），尝试登录已有用户');
      // 尝试登录一个已存在的测试用户
      const login = await api('/api/user/login', {
        method: 'POST',
        body: JSON.stringify({ username: testUser, password: 'Struct123!' }),
      });
      userToken = login.body.token;
    }
  });

  after(async () => {
    if (userToken) {
      await api('/api/user/delete', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + userToken },
        body: JSON.stringify({ username: testUser }),
      });
    }
  });

  // ===== 1. 所有公开API返回 {success: true} =====
  it('1.1 公开API响应包含success字段', async () => {
    const endpoints = ['/api/dishes', '/api/model-metrics', '/api/worker-health'];
    for (const ep of endpoints) {
      const r = await api(ep);
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true, `${ep} 应返回success=true`);
    }
  });

  // ===== 2. 菜品API返回dishes数组 =====
  it('2.1 /api/dishes返回dishes数组', async () => {
    const r = await api('/api/dishes');
    assert.ok(Array.isArray(r.body.dishes), '应返回dishes数组');
    assert.ok(r.body.dishes.length > 0, '应至少有1道菜品');
  });

  // ===== 3. 模型指标返回metrics对象 =====
  it('3.1 /api/model-metrics返回metrics对象', async () => {
    const r = await api('/api/model-metrics');
    assert.ok(r.body.metrics || r.body.data, '应包含metrics或data');
    const metrics = r.body.metrics || r.body.data;
    if (metrics) {
      assert.ok(metrics.mse !== undefined || metrics.MSE !== undefined, '应包含MSE');
      assert.ok(metrics.r2 !== undefined || metrics.R2 !== undefined, '应包含R²');
    }
  });

  // ===== 4. 特征重要性返回importance数组 =====
  it('4.1 /api/feature-importance返回importance数组', async () => {
    const r = await api('/api/feature-importance');
    assert.ok(r.body.importance || r.body.features || r.body.data, '应包含importance/features/data');
  });

  // ===== 5. 管理后台统计返回统计数据 =====
  it('5.1 /api/admin/stats返回统计字段', async () => {
    const r = await api('/api/admin/stats', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    // 统计数据应包含某些字段
    const stats = r.body.stats || r.body.data || r.body;
    assert.ok(stats.todayRecommendations !== undefined || stats.totalDishes !== undefined, '应包含统计字段');
  });

  // ===== 6. 热门菜品返回dishes数组 =====
  it('6.1 /api/admin/popular-dishes返回dishes数组', async () => {
    const r = await api('/api/admin/popular-dishes', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.dishes !== undefined || r.body.data !== undefined, '应包含dishes或data');
  });

  // ===== 7. 反馈摘要返回feedbacks =====
  it('7.1 /api/admin/feedback-summary返回反馈数据', async () => {
    const r = await api('/api/admin/feedback-summary', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.feedbacks !== undefined || r.body.data !== undefined, '应包含feedbacks或data');
  });

  // ===== 8. 用户列表返回users数组 =====
  it('8.1 /api/admin/users返回users数组', async () => {
    const r = await api('/api/admin/users', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.users !== undefined || r.body.data !== undefined, '应包含users或data');
  });

  // ===== 9. 模型历史返回history =====
  it('9.1 /api/admin/model-history返回history', async () => {
    const r = await api('/api/admin/model-history', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.history !== undefined || r.body.data !== undefined, '应包含history或data');
  });

  // ===== 10. 推荐统计返回stats =====
  it('10.1 /api/admin/recommendation-stats返回统计', async () => {
    const r = await api('/api/admin/recommendation-stats', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
  });

  // ===== 11. 订单API返回orders =====
  it('11.1 /api/orders返回orders数组', async () => {
    const r = await api('/api/orders?userId=' + testUser, {
      headers: { Authorization: 'Bearer ' + userToken },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.orders !== undefined, '应包含orders');
  });

  // ===== 12. 错误响应统一格式 =====
  it('12.1 错误响应统一为{success:false,error:...}', async () => {
    // 401错误
    const r401 = await api('/api/admin/stats');
    assert.equal(r401.status, 401);
    assert.equal(r401.body.success, false);
    assert.ok(r401.body.error, '应有error字段');
    // 404错误
    const r404 = await api('/api/nonexistent');
    assert.equal(r404.status, 404);
    assert.equal(r404.body.success, false);
    assert.ok(r404.body.error, '应有error字段');
  });
});

describe('模型管理页面深度交互检查', () => {
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

  // ===== 13. 模型管理页面加载并显示模型信息 =====
  it('13.1 模型管理页面显示模型信息', async () => {
    resetErrors();
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    await page.type('#admin-login-user', 'admin', { delay: 20 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2000);
    await page.evaluate(() => document.querySelector('[data-page="model"]')?.click());
    await sleep(2000);
    const modelVisible = await page.evaluate(() => {
      const el = document.getElementById('page-model');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(modelVisible, '模型管理页面应可见');
    assert.equal(realErrors().length, 0, '模型管理页面不应有JS错误');
  });

  // ===== 14. 重训练按钮存在且可点击 =====
  it('14.1 重训练按钮存在', async () => {
    resetErrors();
    const retrainBtn = await page.$('#retrain-btn');
    assert.ok(retrainBtn, '重训练按钮应存在');
    assert.equal(realErrors().length, 0, '重训练按钮检查不应有错误');
  });

  // ===== 15. 模型对比表格存在 =====
  it('15.1 模型对比表格存在', async () => {
    resetErrors();
    const tableExists = await page.evaluate(() => !!document.getElementById('model-compare-table'));
    assert.ok(tableExists, '模型对比表格应存在');
    assert.equal(realErrors().length, 0, '模型对比表格检查不应有错误');
  });

  // ===== 16. 最差菜品表格存在 =====
  it('16.1 最差菜品表格存在', async () => {
    resetErrors();
    const tableExists = await page.evaluate(() => !!document.getElementById('worst-dishes-table'));
    assert.ok(tableExists, '最差菜品表格应存在');
    assert.equal(realErrors().length, 0, '最差菜品表格检查不应有错误');
  });

  // ===== 17. 模型历史表格存在 =====
  it('17.1 模型历史表格存在', async () => {
    resetErrors();
    const tableExists = await page.evaluate(() => !!document.getElementById('model-history-table'));
    assert.ok(tableExists, '模型历史表格应存在');
    assert.equal(realErrors().length, 0, '模型历史表格检查不应有错误');
  });

  // ===== 18. 数据分析页面图表容器存在 =====
  it('18.1 数据分析页面图表容器存在', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="analytics"]')?.click());
    await sleep(2000);
    const analyticsVisible = await page.evaluate(() => {
      const el = document.getElementById('page-analytics');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(analyticsVisible, '数据分析页面应可见');
    assert.equal(realErrors().length, 0, '数据分析页面不应有错误');
  });

  // ===== 19. 偏好统计页面 =====
  it('19.1 偏好统计页面正常显示', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="preferences"]')?.click());
    await sleep(1500);
    const prefVisible = await page.evaluate(() => {
      const el = document.getElementById('page-preferences');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(prefVisible, '偏好统计页面应可见');
    assert.equal(realErrors().length, 0, '偏好统计页面不应有错误');
  });

  // ===== 20. API文档页面端点列表 =====
  it('20.1 API文档页面显示端点列表', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="apidocs"]')?.click());
    await sleep(1500);
    const rowCount = await page.evaluate(() => {
      const rows = document.querySelectorAll('#page-apidocs tr, #page-apidocs .endpoint');
      return rows.length;
    });
    assert.ok(rowCount > 0, 'API文档应有端点行: ' + rowCount);
    assert.equal(realErrors().length, 0, 'API文档页面不应有错误');
  });

  // ===== 21. 仪表盘统计卡片数字不为NaN =====
  it('21.1 仪表盘统计卡片无NaN', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="dashboard"]')?.click());
    await sleep(1500);
    const hasNaN = await page.evaluate(() => {
      const dash = document.getElementById('page-dashboard');
      if (!dash) {
        return false;
      }
      return dash.textContent.includes('NaN');
    });
    assert.ok(!hasNaN, '仪表盘不应显示NaN');
    assert.equal(realErrors().length, 0, '仪表盘不应有错误');
  });

  // ===== 22. 菜品管理页面表格无NaN =====
  it('22.1 菜品管理表格无NaN', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    const hasNaN = await page.evaluate(() => {
      const page = document.getElementById('page-dishes');
      if (!page) {
        return false;
      }
      return page.textContent.includes('NaN');
    });
    assert.ok(!hasNaN, '菜品管理不应显示NaN');
    assert.equal(realErrors().length, 0, '菜品管理不应有错误');
  });
});
