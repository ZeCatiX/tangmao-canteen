// 唐猫庭院 - API边界情况与安全测试
// 覆盖：空body、超大body、特殊字符、SQL注入、XSS、未授权访问
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

async function api(path, options = {}) {
  const url = BASE + path;
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(url, {
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

describe('API边界情况与安全测试', () => {
  let adminToken;

  before(async () => {
    adminToken = await getAdminToken();
    assert.ok(adminToken, '应获取管理员token');
  });

  // ===== 1. 空body请求 =====
  it('1.1 POST空body到推荐API不崩溃', async () => {
    const r = await fetch(BASE + '/api/predict-rf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await r.json().catch(() => ({}));
    assert.ok(r.status === 400 || r.status === 500, '应返回400或500');
    assert.ok(body.success === false || body.error, '应返回错误信息');
  });

  // ===== 2. 超大body =====
  it('2.1 超大body被服务器拒绝', async () => {
    const largeData = 'x'.repeat(2 * 1024 * 1024); // 2MB
    const r = await fetch(BASE + '/api/preference-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: largeData }),
    });
    // 服务器限制了1mb body，应返回413或400
    assert.ok(r.status === 413 || r.status === 400 || r.status === 500, '超大body应被拒绝');
  });

  // ===== 3. 特殊字符注入 =====
  it('3.1 特殊字符在菜品名中不崩溃', async () => {
    const specialNames = ['<script>alert(1)</script>', '"; DROP TABLE dishes; --', "' OR '1'='1", 'null\u0000byte'];
    for (const name of specialNames) {
      const r = await api('/api/admin/dish', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({
          name: name,
          category: '测试',
          spiciness: '微辣',
          saltiness: '适中',
          sweetness: '酸甜',
          price: 10,
          calorie: 100,
          protein: 10,
          isHalal: false,
          isVegetarian: false,
          allergies: [],
          religion: '无特殊要求',
        }),
      });
      // 应成功创建或返回错误，但不崩溃
      assert.ok(r.status === 200 || r.status === 400 || r.status === 500, '特殊字符菜品名应返回合理状态码');
      // 如果创建成功，清理
      if (r.status === 200 && r.body.dishId) {
        await api('/api/admin/dish/' + r.body.dishId + '/permanent', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + adminToken },
        });
      }
    }
  });

  // ===== 4. 未授权访问 =====
  it('4.1 无token访问管理端点返回401', async () => {
    const endpoints = ['/api/admin/stats', '/api/admin/popular-dishes', '/api/admin/feedback-summary'];
    for (const ep of endpoints) {
      const r = await api(ep);
      assert.equal(r.status, 401, ep + ' 应返回401');
    }
  });

  // ===== 5. 无效token访问 =====
  it('5.1 无效token访问返回401', async () => {
    const r = await api('/api/admin/stats', {
      headers: { Authorization: 'Bearer invalid_token_12345' },
    });
    assert.equal(r.status, 401, '无效token应返回401');
  });

  // ===== 6. SQL注入尝试 =====
  it('6.1 SQL注入在登录中被阻止', async () => {
    const r = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: "admin' OR '1'='1", password: 'anything' }),
    });
    assert.equal(r.body.success, false, 'SQL注入登录应失败');
    assert.ok(!r.body.token, '不应返回token');
  });

  // ===== 7. XSS在菜品名中被转义 =====
  it('7.1 XSS在菜品API响应中被转义', async () => {
    const r = await api('/api/dishes');
    assert.equal(r.status, 200);
    const dishes = r.body.dishes || [];
    // 检查所有菜品名不含原始<script>标签
    dishes.forEach((d) => {
      if (d.name) {
        assert.ok(!d.name.includes('<script>'), '菜品名不应包含原始script标签');
      }
    });
  });

  // ===== 8. 路径遍历尝试 =====
  it('8.1 路径遍历被阻止', async () => {
    const paths = ['/../.env', '/../../etc/passwd', '/%2e%2e/.env', '/api/../package.json'];
    for (const p of paths) {
      const r = await fetch(BASE + p);
      assert.ok(r.status === 403 || r.status === 404, p + ' 应返回403或404');
    }
  });

  // ===== 9. 敏感文件被阻断 =====
  it('9.1 敏感文件被阻断', async () => {
    const sensitive = ['/server.js', '/db.js', '/auth.js', '/user_storage.js', '/.env', '/package.json'];
    for (const f of sensitive) {
      const r = await fetch(BASE + f);
      assert.ok(r.status === 403 || r.status === 404, f + ' 应返回403或404');
    }
  });

  // ===== 10. 订单状态非法值 =====
  it('10.1 订单状态非法值被拒绝', async () => {
    const r = await api('/api/orders/99999/status', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'INVALID_STATUS' }),
    });
    assert.ok(r.status === 400 || r.status === 404, '非法订单状态应返回400或404');
  });

  // ===== 11. 推荐API空菜品列表 =====
  it('11.1 推荐API空菜品列表返回错误', async () => {
    const r = await api('/api/predict-rf', {
      method: 'POST',
      body: JSON.stringify({ userPrefs: { spiciness: '微辣' }, dishes: [] }),
    });
    assert.equal(r.status, 400, '空菜品列表应返回400');
    assert.equal(r.body.success, false, '应返回失败');
  });

  // ===== 12. 反馈API空评分 =====
  it('12.1 反馈API无效评分被处理', async () => {
    const r = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: 1, score: 999, userId: 'guest' }),
    });
    // 应被接受或拒绝，但不崩溃
    assert.ok(r.status === 200 || r.status === 400, '无效评分应返回200或400');
  });

  // ===== 13. CORS头 =====
  it('13.1 API响应包含CORS头', async () => {
    const r = await fetch(BASE + '/api/dishes');
    const corsHeader = r.headers.get('access-control-allow-origin');
    // CORS头应存在（允许跨域）
    assert.ok(corsHeader !== null, '应包含CORS头');
  });

  // ===== 14. 安全HTTP头 =====
  it('14.1 响应包含安全HTTP头', async () => {
    const r = await fetch(BASE + '/');
    assert.ok(r.headers.get('x-content-type-options'), '应包含X-Content-Type-Options');
    assert.ok(r.headers.get('x-frame-options') || r.headers.get('content-security-policy'), '应包含安全头');
  });

  // ===== 15. 速率限制 =====
  it('15.1 快速连续请求不崩溃', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(api('/api/dishes'));
    }
    const results = await Promise.all(promises);
    // 所有请求应成功或被限流，但不崩溃
    results.forEach((r) => {
      assert.ok(r.status === 200 || r.status === 429, '快速请求应返回200或429');
    });
  });
});
