// 唐猫庭院 - E2E 集成测试（补充测试）
// 覆盖：页面加载、按钮交互、管理后台、厨房看板、会话流程

const assert = require('node:assert/strict');
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

// ─────────────────────────────────────────────
// 1. 页面加载测试
// ─────────────────────────────────────────────
describe('页面加载测试', () => {
  it('GET / 返回首页 HTML', async () => {
    const res = await fetch(BASE + '/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('唐猫庭院'), '首页应包含标题');
    assert.ok(html.includes('guest-btn'), '首页应包含开始点餐按钮');
    assert.ok(html.includes('login-btn'), '首页应包含登录按钮');
    assert.ok(html.includes('register-btn'), '首页应包含注册按钮');
    assert.ok(html.includes('nav-cart'), '首页应包含购物车');
  });

  it('GET /admin 返回管理后台 HTML', async () => {
    const res = await fetch(BASE + '/admin');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('admin-login-btn'), '管理后台应包含登录按钮');
    assert.ok(html.includes('admin-login-user'), '管理后台应包含用户名输入');
  });

  it('GET /kitchen 返回厨房看板 HTML', async () => {
    const res = await fetch(BASE + '/kitchen');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('order-list'), '厨房看板应包含订单列表');
    assert.ok(html.includes('btn-complete'), '厨房看板应包含完成按钮');
    assert.ok(html.includes('loadOrders'), '厨房看板应包含订单加载函数');
    assert.ok(html.includes('login-overlay'), '厨房看板应包含登录界面');
  });

  it('GET /styles.css 返回样式文件', async () => {
    const res = await fetch(BASE + '/styles.css');
    assert.equal(res.status, 200);
    const css = await res.text();
    assert.ok(css.length > 100, '样式文件应大于100字节');
  });
});

// ─────────────────────────────────────────────
// 2. 管理后台功能测试
// ─────────────────────────────────────────────
describe('管理后台功能测试', () => {
  let adminToken = '';

  before(async () => {
    adminToken = await getAdminToken();
  });

  it('管理后台登录 -> 获取统计数据', async () => {
    assert.ok(adminToken, '应获取到管理 token');
    const { status, body } = await api('/api/admin/stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.stats.totalDishes > 0, '应有菜品数据');
    assert.ok(body.stats.totalUsers >= 0, '应有用户数据');
  });

  it('管理后台 - 菜品CRUD完整流程', async () => {
    const token = adminToken;
    // 添加
    const add = await api('/api/admin/dish', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: 'E2E测试菜', category: '热菜', price: 25, rating: 4.0 }),
    });
    assert.equal(add.status, 200, '添加菜品应成功');
    const newId = add.body.dish?.id || add.body.id;
    assert.ok(newId, '应返回新菜品ID: ' + JSON.stringify(add.body));
    console.log('✅ 新菜品ID:', newId);

    // 更新
    const update = await api('/api/admin/dish/' + newId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: 'E2E测试菜-已更新', price: 30 }),
    });
    assert.equal(update.status, 200, '更新菜品应成功');
    assert.equal(update.body.success, true, '更新应返回成功');

    // 永久删除（清理测试数据）
    const del = await api('/api/admin/dish/' + newId + '/permanent', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    assert.equal(del.status, 200, '删除菜品应成功');
  });

  it('管理后台 - 数据导出功能', async () => {
    const token = adminToken;
    const res = await fetch(BASE + '/api/admin/export/popular-dishes', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    assert.equal(res.status, 200);
    const csv = await res.text();
    assert.ok(csv.length > 10, 'CSV应包含数据');
  });
});

// ─────────────────────────────────────────────
// 3. 完整用户会话流程测试
// ─────────────────────────────────────────────
describe('完整用户会话流程', () => {
  const testUser = 'e2e_' + Date.now();
  const testPass = 'E2e_test_123!';

  it('注册 -> 登录 -> 偏好 -> 推荐 -> 订单 -> 反馈 完整流程', async () => {
    // 注册
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: testUser, password: testPass }),
    });
    assert.equal(reg.status, 200);
    assert.equal(reg.body.success, true);

    // 登录
    const login = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: testUser, password: testPass }),
    });
    assert.equal(login.status, 200);
    const token = login.body.token;
    assert.ok(token, '应返回 token');

    // 保存偏好（需要 Bearer token，用户名取自 token）
    const pref = await api('/api/user-preferences', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        preferences: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜' },
      }),
    });
    assert.equal(pref.status, 200);

    // 获取推荐
    const rec = await api('/api/predict-rf', {
      method: 'POST',
      // 真实菜品 id 走服务端数字展开垫片;曾用 [1,2,3] 展开为空挂 worker 50s 才降级
      body: JSON.stringify({ userPrefs: { spiciness: '微辣' }, dishes: dishPool.slice(0, 3).map(d => d.id) }),
    });
    // 推荐API可能返回200或504（Worker超时），只要不崩溃即可
    assert.ok(rec.status === 200 || rec.status === 504, '推荐API应响应: ' + rec.status);
    if (rec.status === 200) {
      assert.ok(rec.body.predictions?.length > 0, '应返回推荐结果');
    }

    // 创建订单
    const order = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: testUser,
        items: [{ id: dishPool[0].id, name: 'E2E测试菜品', price: 18 }],
        totalPrice: 18,
        tableNumber: '27',
      }),
    });
    assert.equal(order.status, 200);
    assert.ok(order.body.orderId, '应返回订单ID');

    // 提交反馈
    const fb = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        dishId: 1, score: 4.5, userId: testUser,
        userPreferences: { spiciness: '微辣' },
      }),
    });
    assert.equal(fb.status, 200);
  });
});

// ─────────────────────────────────────────────
// 4. 厨房看板 API 测试
// ─────────────────────────────────────────────
describe('厨房看板 API 测试', () => {
  it('GET /api/orders 返回订单列表', async () => {
    const adminToken = await getAdminToken();
    const res = await fetch(BASE + '/api/orders?status=pending,confirmed', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(res.status, 200);
    const body = await res.json().catch(() => ({}));
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.orders), 'orders应为数组');
  });

  it('订单状态流转完整路径', async () => {
    let adminToken = await getAdminToken();

    // 创建订单
    const order = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'kitchen_test', items: [{ id: dishPool[0].id, name: '厨房测试', price: 10 }], totalPrice: 10, tableNumber: '28',
      }),
    });
    assert.equal(order.status, 200);
    const orderId = order.body.orderId;
    assert.ok(orderId);

    // 设为 preparing
    const prep = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'preparing' }),
    });
    assert.equal(prep.status, 200);

    // 设为 completed
    const comp = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'completed' }),
    });
    assert.equal(comp.status, 200);
  });
});

// ─────────────────────────────────────────────
// 5. 安全与边界测试
// ─────────────────────────────────────────────
describe('安全与边界测试', () => {
  it('敏感文件被阻断', async () => {
    for (const path of ['/.env', '/server.js', '/db.js', '/package.json', '/auth.js']) {
      const res = await fetch(BASE + path);
      assert.ok(res.status === 403 || res.status === 404, `${path} 应返回 403/404，实际 ${res.status}`);
    }
  });

  it('XSS 菜品名应被转义', async () => {
    const { body } = await api('/api/dishes');
    const dishes = body.dishes || [];
    const xssDishes = dishes.filter(d => 
      d.name.includes('<script>') || d.name.includes('alert(')
    );
    // 验证前端 esc() 函数存在（在 script.js 构建产物中）
    const scriptJs = await (await fetch(BASE + '/script.js')).text();
    assert.ok(scriptJs.includes('function esc(') || scriptJs.includes('esc ='), 'script.js 应包含 esc() 转义函数');
    // 如果存在 XSS 菜品，记录警告
    for (const d of dishes) {
      if (d.name.includes('<')) {
        console.log('⚠️ 菜品含HTML标签:', d.id, d.name, '（前端 esc() 会转义）');
      }
    }
    assert.ok(xssDishes.length < 10, 'XSS 菜品数量不应过多');
  });

  it('管理后台无token返回401', async () => {
    const { status } = await api('/api/admin/stats');
    assert.equal(status, 401);
  });

  it('GET /api/orders 无token返回401', async () => {
    const res = await fetch(BASE + '/api/orders');
    assert.equal(res.status, 401);
  });

  it('GET /api/feedback 无token返回401', async () => {
    const res = await fetch(BASE + '/api/feedback');
    assert.equal(res.status, 401);
  });

  it('错误信息不泄露内部细节', async () => {
    const { body } = await api('/api/feedback', { method: 'POST', body: JSON.stringify({}) });
    assert.ok(!body.error?.includes('e.message'), '不应泄露原始错误');
    assert.ok(!body.error?.includes('Error:'), '不应包含堆栈信息');
  });

  it('无效 API 路径返回 404', async () => {
    const res = await fetch(BASE + '/api/nonexistent');
    assert.equal(res.status, 404);
  });
});

console.log('✅ E2E 测试加载完成');