// 唐猫庭院 - 管理后台API端点全面响应正确性 + HTML meta完整性检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const ROOT = path.join(__dirname, '..');
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

async function getAdminToken() {
  const r = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  return r.body.token || '';
}

describe('管理后台所有API端点响应正确性', () => {
  let adminToken;
  let userToken;
  let testUser;

  before(async () => {
    adminToken = await getAdminToken();
    assert.ok(adminToken, '应获取管理员token');
    // 注册测试用户
    testUser = 'api_tes' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: testUser, password: 'ApiTest123!' }),
    });
    userToken = reg.body.token;
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

  // ===== 1. 公开API（无需认证） =====
  it('1.1 公开API端点返回200', async () => {
    const publicApis = [
      { method: 'GET', path: '/api/dishes' },
      { method: 'GET', path: '/api/model-metrics' },
      { method: 'GET', path: '/api/feature-importance' },
      { method: 'GET', path: '/api/worker-health' },
    ];
    for (const ep of publicApis) {
      const r = await api(ep.path, { method: ep.method });
      assert.equal(r.status, 200, `${ep.method} ${ep.path} 应返回200`);
      assert.equal(r.body.success, true, `${ep.path} 应返回success=true`);
    }
  });

  // ===== 2. 需要管理员认证的API =====
  it('2.1 管理员API端点带token返回200', async () => {
    const adminApis = [
      { method: 'GET', path: '/api/admin/stats' },
      { method: 'GET', path: '/api/admin/popular-dishes' },
      { method: 'GET', path: '/api/admin/feedback-summary' },
      { method: 'GET', path: '/api/admin/preference-stats' },
      { method: 'GET', path: '/api/admin/daily-recommendations' },
      { method: 'GET', path: '/api/admin/user-activity' },
      { method: 'GET', path: '/api/admin/recommendation-details' },
      { method: 'GET', path: '/api/admin/model-history' },
      { method: 'GET', path: '/api/admin/worst-dishes' },
      { method: 'GET', path: '/api/admin/model-compare' },
      { method: 'GET', path: '/api/admin/recommendation-stats' },
      { method: 'GET', path: '/api/admin/users' },
      { method: 'GET', path: '/api/admin/notifications' },
    ];
    for (const ep of adminApis) {
      const r = await api(ep.path, {
        method: ep.method,
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      assert.equal(r.status, 200, `${ep.method} ${ep.path} 应返回200，实际: ${r.status}`);
    }
  });

  // ===== 3. 管理员API不带token返回401 =====
  it('3.1 管理员API端点无token返回401', async () => {
    const protectedApis = [
      '/api/admin/stats',
      '/api/admin/popular-dishes',
      '/api/admin/feedback-summary',
      '/api/admin/users',
      '/api/admin/notifications',
    ];
    for (const p of protectedApis) {
      const r = await api(p);
      assert.equal(r.status, 401, `${p} 无token应返回401`);
    }
  });

  // ===== 4. 用户API =====
  it('4.1 用户API端点响应正确', async () => {
    // 偏好保存
    const prefR = await api('/api/user-preferences', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + userToken },
      body: JSON.stringify({ username: testUser, preferences: { spiciness: '微辣' } }),
    });
    assert.ok(prefR.status === 200, '偏好保存应返回200');
    // 订单查询
    const orderR = await api('/api/orders?userId=' + testUser, {
      headers: { Authorization: 'Bearer ' + userToken },
    });
    assert.equal(orderR.status, 200, '订单查询应返回200');
    // 反馈查询
    const fbR = await api('/api/feedback', {
      headers: { Authorization: 'Bearer ' + userToken },
    });
    assert.equal(fbR.status, 200, '反馈查询应返回200');
  });

  // ===== 5. 软认证API（游客也可访问） =====
  it('5.1 软认证API端点无需token也可访问', async () => {
    const softApis = [
      { method: 'POST', path: '/api/preference-log', body: { spiciness: '微辣', userId: 'guest' } },
      { method: 'POST', path: '/api/recommendation-log', body: { userType: 'guest', userId: 'guest' } },
      { method: 'POST', path: '/api/feedback', body: { dishId: 1, score: 4, userId: 'guest' } },
      { method: 'POST', path: '/api/order', body: { userId: 'guest', items: [], totalPrice: 0 } },
    ];
    for (const ep of softApis) {
      const r = await api(ep.path, {
        method: ep.method,
        body: JSON.stringify(ep.body),
      });
      assert.ok(
        r.status === 200 || r.status === 201 || r.status === 400,
        `${ep.method} ${ep.path} 应返回200/201/400，实际: ${r.status}`
      );
    }
  });

  // ===== 6. API版本兼容性 =====
  it('6.1 /api/v1/* 前缀路由兼容', async () => {
    const r = await api('/api/v1/dishes');
    assert.equal(r.status, 200, '/api/v1/dishes 应返回200（版本兼容）');
    assert.equal(r.body.success, true, '版本兼容应返回success=true');
  });

  // ===== 7. API响应包含JSON =====
  it('7.1 所有API响应Content-Type为JSON', async () => {
    const apis = ['/api/dishes', '/api/worker-health', '/api/model-metrics'];
    for (const p of apis) {
      const r = await api(p);
      const ct = r.headers.get('content-type') || '';
      assert.ok(ct.includes('json'), `${p} 应返回JSON Content-Type: ${ct}`);
    }
  });

  // ===== 8. 404页面 =====
  it('8.1 不存在的API路径返回404 JSON', async () => {
    const r = await api('/api/nonexistent-endpoint-12345');
    assert.equal(r.status, 404);
    assert.equal(r.body.success, false);
    assert.ok(r.body.error, '应返回错误信息');
  });
});

describe('HTML页面meta标签和SEO完整性', () => {
  // ===== 9. 首页meta标签 =====
  it('9.1 首页有完整的meta标签', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('<meta charset'), '应有charset声明');
    assert.ok(html.includes('viewport'), '应有viewport meta');
    assert.ok(html.includes('lang='), '应有lang属性');
    assert.ok(html.includes('<title>'), '应有title标签');
    assert.ok(html.includes('唐猫'), 'title应包含网站名');
  });

  // ===== 10. 管理后台meta标签 =====
  it('10.1 管理后台有完整的meta标签', () => {
    const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    assert.ok(html.includes('<meta charset'), '应有charset声明');
    assert.ok(html.includes('viewport'), '应有viewport meta');
    assert.ok(html.includes('lang='), '应有lang属性');
    assert.ok(html.includes('<title>'), '应有title标签');
    assert.ok(html.includes('description'), '应有meta description');
  });

  // ===== 11. 厨房看板meta标签 =====
  it('11.1 厨房看板有完整的meta标签', () => {
    const html = fs.readFileSync(path.join(ROOT, 'kitchen.html'), 'utf8');
    assert.ok(html.includes('<meta charset'), '应有charset声明');
    assert.ok(html.includes('viewport'), '应有viewport meta');
    assert.ok(html.includes('lang='), '应有lang属性');
    assert.ok(html.includes('<title>'), '应有title标签');
    assert.ok(html.includes('description'), '应有meta description');
  });

  // ===== 12. 所有页面charset为UTF-8 =====
  it('12.1 所有页面charset为UTF-8', () => {
    const files = ['index.html', 'admin.html', 'kitchen.html'];
    for (const f of files) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(html.includes('UTF-8') || html.includes('utf-8'), `${f} 应声明UTF-8 charset`);
    }
  });

  // ===== 13. 所有页面有favicon =====
  it('13.1 首页有favicon引用', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('icon') || html.includes('favicon'), '首页应有favicon引用');
  });

  // ===== 14. 首页有skip-to-content链接 =====
  it('14.1 首页有无障碍skip链接', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('main-content') || html.includes('skip'), '首页应有无障碍skip链接');
  });

  // ===== 15. 所有CSS和JS资源路径正确 =====
  it('15.1 所有资源路径使用相对路径', () => {
    const files = ['index.html', 'admin.html', 'kitchen.html'];
    for (const f of files) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // 不应有绝对路径引用本地资源（http://localhost除外）
      const srcMatches = html.match(/(?:src|href)="(\/[^"]+)"/g) || [];
      for (const m of srcMatches) {
        const url = m.match(/"([^"]+)"/)[1];
        // /开头的路径是服务器相对路径，可以接受
        // 但不应有 file:/// 或 C:\ 等本地路径
        assert.ok(!url.includes('file:') && !url.includes(':\\'), `${f} 不应引用本地文件路径: ${url}`);
      }
    }
  });
});
