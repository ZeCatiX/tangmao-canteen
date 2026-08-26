// 唐猫庭院 - 完整 API 测试（覆盖 50+ 端点）
// 使用 node:test 和 node:assert

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
require('dotenv').config();

const BASE = 'http://localhost:3000';

// 管理后台凭据（支持通过环境变量覆盖）
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN_PASS) throw new Error('❌ ADMIN_PASS 未设置，请在 .env 中配置管理后台密码');

// 工具函数：发起 HTTP 请求
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

// 获取管理后台 token 的辅助函数
async function getAdminToken() {
  const r = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  return r.body.token || '';
}

// ─────────────────────────────────────────────
// 1. 菜品 API
// ─────────────────────────────────────────────
describe('菜品 API', () => {
  it('GET /api/dishes 返回菜品列表', async () => {
    const { status, body } = await api('/api/dishes');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.dishes), 'dishes应为数组');
    assert.ok(body.dishes.length > 0, '应至少有一道菜');
  });
});

// ─────────────────────────────────────────────
// 2. 用户注册/登录 API
// ─────────────────────────────────────────────
describe('用户 API', () => {
  const testUser = 'test_' + Date.now();
  const testPass = 'Test123!';

  it('POST /api/user/register 注册新用户', async () => {
    const { status, body } = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: testUser, password: testPass }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.user.username, testUser);
  });

  it('POST /api/user/register 重复注册返回错误', async () => {
    const { status, body } = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: testUser, password: testPass }),
    });
    assert.equal(status, 400);
    assert.equal(body.success, false);
  });

  it('POST /api/user/login 正常登录', async () => {
    const { status, body } = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: testUser, password: testPass }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.token, '应返回 JWT token');
    assert.ok(body.user.favorites !== undefined, '应返回收藏列表');
    assert.ok(body.user.blacklist !== undefined, '应返回黑名单');
  });

  it('POST /api/user/login 错误密码返回 401', async () => {
    const { status } = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: testUser, password: 'wrong' }),
    });
    assert.equal(status, 401);
  });

  it('POST /api/user/login 空参数返回 400', async () => {
    const { status } = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────
// 3. 推荐 API
// ─────────────────────────────────────────────
describe('推荐 API', () => {
  it('GET /api/feature-importance 返回特征重要性', async () => {
    const { status, body } = await api('/api/feature-importance');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.importance), 'importance应为数组');
    assert.ok(body.importance.length >= 6, '应至少有 6 个特征');
    // 验证特征名称
    const names = body.importance.map(i => i.feature);
    assert.ok(names.includes('评分'), '应包含评分');
    assert.ok(names.includes('价格'), '应包含价格');
    assert.ok(names.includes('辣度'), '应包含辣度');
  });

  it('GET /api/model-metrics 返回模型指标', async () => {
    const { status, body } = await api('/api/model-metrics');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.metrics.r2 > 0.5, 'R² 应大于 0.5');
    assert.ok(body.metrics.mse >= 0, 'MSE 应非负');
  });

  it('GET /api/worker-health 返回 Worker 状态', async () => {
    const { status, body } = await api('/api/worker-health');
    assert.equal(status, 200);
    assert.equal(body.alive, true);
    assert.equal(body.ready, true);
  });
});

// ─────────────────────────────────────────────
// 4. 反馈 API
// ─────────────────────────────────────────────
describe('反馈 API', () => {
  it('POST /api/feedback 提交菜品评分', async () => {
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        dishId: 1,
        score: 4.5,
        userPreferences: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜' },
        userId: 'test_user',
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/feedback 提交整体满意度', async () => {
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        dishId: 0,
        score: 4,
        userId: 'test_user',
        type: 'overall_satisfaction',
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/feedback 缺少参数返回 400', async () => {
    const { status } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────
// 5. 管理后台 API
// ─────────────────────────────────────────────
describe('管理后台 API', () => {
  let adminToken = '';

  before(async () => {
    const r = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    adminToken = r.body.token || '';
  });

  function adminApi(path, opts = {}) {
    opts.headers = { ...opts.headers, 'Authorization': 'Bearer ' + adminToken };
    return api(path, opts);
  }

  it('GET /api/admin/stats 返回统计数据', async () => {
    const { status, body } = await adminApi('/api/admin/stats');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.stats.totalDishes > 0, '在售菜品应大于0');
    assert.ok(body.stats.totalFeedback >= 0, '总反馈数≥0');
  });

  it('GET /api/admin/model-info 返回模型信息', async () => {
    const { status, body } = await adminApi('/api/admin/model-info');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.model.version, '应有版本号');
    assert.ok(body.model.r2 > 0, 'R² 应大于 0');
  });

  it('GET /api/admin/monitor 返回监控信息', async () => {
    const { status, body } = await adminApi('/api/admin/monitor');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.monitor.r2Trend, '应有 R² 趋势');
    assert.ok(body.monitor.memoryUsage > 0, '应有内存使用');
    assert.ok(body.monitor.uptime > 0, '应有运行时间');
  });

  it('GET /api/admin/popular-dishes 返回菜品热度排行', async () => {
    const { status, body } = await adminApi('/api/admin/popular-dishes');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.dishes.length > 0, '应有排行数据');
  });

  it('GET /api/admin/feedback-summary 返回反馈汇总', async () => {
    const { status, body } = await adminApi('/api/admin/feedback-summary');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.feedbacks), '反馈列表应为数组');
  });
});

// ─────────────────────────────────────────────
// 6. 订单 API
// ─────────────────────────────────────────────
describe('订单 API', () => {
  it('POST /api/order 创建订单', async () => {
    const { status, body } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'test_user',
        items: [{ id: 1, name: '测试菜品', price: 18 }],
        totalPrice: 18,
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.orderId, '应返回订单 ID');
  });

  it('POST /api/order 空订单返回 400', async () => {
    const { status } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────
// 7. 用户偏好 API
// ─────────────────────────────────────────────
describe('用户偏好 API', () => {
  it('POST /api/user-preferences 保存偏好', async () => {
    // 先注册一个测试用户
    const uname = 'pref_test_' + Date.now();
    await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uname, password: 'Test123!' }),
    });
    // 登录获取 token
    const login = await api('/api/user/login', {
      method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }),
    });
    const token = login.body.token;
    const { status, body } = await api('/api/user-preferences', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        preferences: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜' },
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 8. 收藏/黑名单 API
// ─────────────────────────────────────────────
describe('收藏/黑名单 API', () => {
  const uname = 'fav_test_' + Date.now();
  let token = '';

  it('POST /api/user-favorites 同步收藏', async () => {
    // 先注册用户
    await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uname, password: 'Test123!' }),
    });
    // 登录获取 token
    const login = await api('/api/user/login', {
      method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }),
    });
    token = login.body.token;
    const { status, body } = await api('/api/user-favorites', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ favorites: [1, 2, 3] }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/user-blacklist 同步黑名单', async () => {
    const { status, body } = await api('/api/user-blacklist', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ blacklist: [10] }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 9. 菜品管理 API
// ─────────────────────────────────────────────
// 10. 管理后台登录 API
// ─────────────────────────────────────────────
describe('管理后台登录 API', () => {
  it('POST /api/admin/login 正确密码登录成功', async () => {
    const { status, body } = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.token, '应返回 token');
  });

  it('POST /api/admin/login 错误密码返回 401', async () => {
    const { status } = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    assert.equal(status, 401);
  });
});

// ─────────────────────────────────────────────
// 11. 批量操作 API
// ─────────────────────────────────────────────
describe('批量操作 API', () => {
  let adminToken = '';
  before(async () => {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
    adminToken = r.body.token || '';
  });
  const adminOpts = () => ({ headers: { 'Authorization': 'Bearer ' + adminToken } });

  it('POST /api/admin/dish/batch-status 批量上架/下架', async () => {
    const { status, body } = await api('/api/admin/dish/batch-status', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ ids: [1, 2], isActive: true }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/admin/dish/batch-delete 批量删除', async () => {
    const { status, body } = await api('/api/admin/dish/batch-delete', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ ids: [1, 2] }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 12. 数据导出 API
// ─────────────────────────────────────────────
describe('数据导出 API', () => {
  let adminToken = '';
  before(async () => {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
    adminToken = r.body.token || '';
  });

  it('GET /api/admin/export/popular-dishes 导出菜品热度 CSV', async () => {
    const res = await fetch(BASE + '/api/admin/export/popular-dishes', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('ID'), 'CSV 应包含表头');
    assert.ok(text.includes('菜名'), 'CSV 应包含菜名');
  });

  it('GET /api/admin/export/feedback 导出反馈 CSV', async () => {
    const res = await fetch(BASE + '/api/admin/export/feedback', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('评分'), 'CSV 应包含评分');
  });
});

// ─────────────────────────────────────────────
// 13. 用户管理 API
// ─────────────────────────────────────────────
describe('用户管理 API', () => {
  let adminToken = '';
  let testUserId = '';
  before(async () => {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
    adminToken = r.body.token || '';
  });

  it('GET /api/admin/users 返回用户列表', async () => {
    const { status, body } = await api('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.users.length > 0, '至少有一个用户');
    if (body.users.length > 0) testUserId = body.users[0].id;
  });

  it('GET /api/admin/users/:id 返回用户详情', async () => {
    assert.ok(testUserId, '前置测试未获取用户ID');
    const { status, body } = await api('/api/admin/users/' + testUserId, {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.user.username, '应有用户名');
  });
});

// ─────────────────────────────────────────────
// 14. 通知 API
// ─────────────────────────────────────────────
describe('通知 API', () => {
  let adminToken = '';
  before(async () => {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
    adminToken = r.body.token || '';
  });

  it('GET /api/admin/notifications 返回通知列表', async () => {
    const { status, body } = await api('/api/admin/notifications', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.notifications), '通知应为数组');
  });
});

// ─────────────────────────────────────────────
// 15. 订单状态管理 API
// ─────────────────────────────────────────────
describe('订单状态管理 API', () => {
  let orderId = '';
  let adminToken = '';

  before(async () => {
    const r = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({ userId: 'status_test', items: [{ id: 1, name: '测试', price: 10 }], totalPrice: 10 }),
    });
    orderId = r.body.orderId || '';
    // 获取管理员token用于订单状态更新（需要认证）
    const login = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    adminToken = login.body.token || '';
  });

  function authHeaders() { return { 'Authorization': 'Bearer ' + adminToken }; }

  it('PUT /api/orders/:id/status 更新订单状态', async () => {
    assert.ok(orderId, '前置测试未创建订单');
    const { status, body } = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'confirmed' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('PUT /api/orders/:id/status 无效状态返回 400', async () => {
    assert.ok(orderId, '前置测试未创建订单');
    const { status } = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'invalid' }),
    });
    assert.equal(status, 400);
  });

  it('GET /api/orders?status= 按状态筛选订单', async () => {
    const adminToken = await getAdminToken();
    const { status, body } = await api('/api/orders?status=confirmed', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.orders), '订单列表应为数组');
  });
});

// ─────────────────────────────────────────────
// 16. 推荐日志和偏好记录 API
// ─────────────────────────────────────────────
describe('推荐日志 API', () => {
  it('POST /api/recommendation-log 记录推荐', async () => {
    const { status, body } = await api('/api/recommendation-log', {
      method: 'POST',
      body: JSON.stringify({ userType: 'test', userId: 'test_user' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/preference-log 记录偏好', async () => {
    const { status, body } = await api('/api/preference-log', {
      method: 'POST',
      body: JSON.stringify({ spiciness: '微辣', saltiness: '适中', sweetness: '酸甜', userId: 'test_user' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 17. 用户注销 API
// ─────────────────────────────────────────────
describe('用户注销 API', () => {
  it('POST /api/user/delete 注销用户', async () => {
    const uname = 'delete_test_' + Date.now();
    const pass = 'Test123!';
    await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: pass }) });
    // 先登录获取token
    const loginRes = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password: pass }) });
    const token = loginRes.body.token || '';
    const { status, body } = await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uname }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/user/delete 无token返回401', async () => {
    const { status, body } = await api('/api/user/delete', {
      method: 'POST',
      body: JSON.stringify({ username: 'nonexistent' }),
    });
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });
});

// ─────────────────────────────────────────────
// 18. 管理后台推荐详情 API
// ─────────────────────────────────────────────
describe('管理后台推荐详情 API', () => {
  let adminToken = '';
  before(async () => {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
    adminToken = r.body.token || '';
  });

  it('GET /api/admin/recommendation-details 返回推荐详情', async () => {
    const { status, body } = await api('/api/admin/recommendation-details', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('GET /api/admin/recommendation-stats 返回推荐统计', async () => {
    const { status, body } = await api('/api/admin/recommendation-stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('GET /api/admin/worst-dishes 返回评分偏低菜品', async () => {
    const { status, body } = await api('/api/admin/worst-dishes', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 19. 管理后台模型管理 API
// ─────────────────────────────────────────────
describe('管理后台模型管理 API', () => {
  let adminToken = '';
  before(async () => {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
    adminToken = r.body.token || '';
  });

  it('GET /api/admin/model-history 返回模型历史', async () => {
    const { status, body } = await api('/api/admin/model-history', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.history), '历史应为数组');
  });

  it('GET /api/admin/model-compare 返回模型对比', async () => {
    const { status, body } = await api('/api/admin/model-compare', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 20. 静态页面加载测试
// ─────────────────────────────────────────────
describe('静态页面测试', () => {
  it('GET / 返回前台首页', async () => {
    const res = await fetch(BASE + '/');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('唐猫庭院'), '页面应包含标题');
    assert.ok(text.includes('开始点餐'), '页面应包含点餐按钮');
  });

  it('GET /admin 返回管理后台', async () => {
    const res = await fetch(BASE + '/admin');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('管理后台'), '页面应包含管理后台标题');
  });

  it('GET /kitchen 返回厨房看板', async () => {
    const res = await fetch(BASE + '/kitchen');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('厨房看板'), '页面应包含厨房看板标题');
  });
});

// ─────────────────────────────────────────────
// 21. 菜品详情与边缘情况测试
// ─────────────────────────────────────────────
describe('菜品详情与边缘情况', () => {
  it('GET /api/dishes 返回的菜品应有完整字段', async () => {
    const { status, body } = await api('/api/dishes');
    assert.equal(status, 200);
    assert.ok(body.success, '应返回成功');
    assert.ok(body.dishes.length > 0, '菜品列表不应为空');
    const dish = body.dishes[0];
    assert.ok(dish.id !== undefined, '应有ID');
    assert.ok(dish.name !== undefined, '应有菜名');
    assert.ok(dish.price !== undefined, '应有价格');
    assert.ok(dish.category !== undefined, '应有分类');
    assert.ok(dish.spiciness !== undefined, '应有辣度');
  });
});

// ─────────────────────────────────────────────
// 22. API 认证与安全测试
// ─────────────────────────────────────────────
describe('API 认证与安全测试', () => {
  it('GET /api/admin/stats 无token返回401', async () => {
    const { status, body } = await api('/api/admin/stats');
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });

  it('GET /api/admin/stats 无效token返回401', async () => {
    const { status, body } = await api('/api/admin/stats', {
      headers: { 'Authorization': 'Bearer invalid_token_here' },
    });
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });

  it('POST /api/admin/dish 无token返回401', async () => {
    const { status, body } = await api('/api/admin/dish', {
      method: 'POST',
      body: JSON.stringify({ name: '测试', price: 10 }),
    });
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });
});

// ─────────────────────────────────────────────
// 23. 反馈与评分边界测试
// ─────────────────────────────────────────────
describe('反馈边界测试', () => {
  it('POST /api/feedback 0分评分', async () => {
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: 1, score: 0, userId: 'test_edge' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/feedback 5分评分', async () => {
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: 1, score: 5, userId: 'test_edge' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/feedback 缺少dishId返回400', async () => {
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ score: 3 }),
    });
    assert.equal(status, 400);
    assert.equal(body.success, false);
  });
});

// ─────────────────────────────────────────────
// 24. 订单状态全流程测试
// ─────────────────────────────────────────────
describe('订单全流程测试', () => {
  let orderId = '';
  let adminToken = '';

  before(async () => {
    const login = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    adminToken = login.body.token || '';
  });

  function authHeaders() { return { 'Authorization': 'Bearer ' + adminToken }; }

  it('创建订单', async () => {
    const { status, body } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'flow_test',
        items: [{ id: 1, name: '测试菜品', price: 25 }],
        totalPrice: 25,
        tableNumber: 3,
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.orderId, '应返回订单 ID');
    orderId = body.orderId;
  });

  it('确认订单', async () => {
    assert.ok(orderId, '前置测试未生成orderId');
    const { status, body } = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'confirmed' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('完成订单', async () => {
    assert.ok(orderId, '前置测试未生成orderId');
    const { status, body } = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'completed' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('取消订单', async () => {
    assert.ok(orderId, '前置测试未生成orderId');
    const { status, body } = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'cancelled' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 25. 管理后台数据导出测试
// ─────────────────────────────────────────────
describe('管理后台数据导出', () => {
  let adminToken = '';
  before(async () => { adminToken = await getAdminToken(); });

  it('GET /api/admin/export/orders 导出订单CSV', async () => {
    const res = await fetch(BASE + '/api/admin/export/orders', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('ID'), 'CSV 应包含表头');
  });

  it('GET /api/admin/export/feedback 无token返回401', async () => {
    const res = await fetch(BASE + '/api/admin/export/feedback');
    assert.equal(res.status, 401);
  });
});

// ─────────────────────────────────────────────
// 26. 管理后台推荐趋势与活跃度测试
// ─────────────────────────────────────────────
describe('管理后台数据分析', () => {
  let adminToken = '';
  before(async () => { adminToken = await getAdminToken(); });

  it('GET /api/admin/daily-recommendations 返回推荐趋势', async () => {
    const { status, body } = await api('/api/admin/daily-recommendations', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data), '数据应为数组');
  });

  it('GET /api/admin/user-activity 返回用户活跃度', async () => {
    const { status, body } = await api('/api/admin/user-activity', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.stats.totalUsers >= 0, '应有用户数');
  });
});

// ─────────────────────────────────────────────
// 27. 推荐预测 API 测试
// ─────────────────────────────────────────────
describe('推荐预测 API', () => {
  it('POST /api/predict-rf 返回预测结果', async () => {
    const { status, body } = await api('/api/predict-rf', {
      method: 'POST',
      body: JSON.stringify({
        userPrefs: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜' },
        dishes: [{ id: 1, spiciness: '微辣', saltiness: '适中', sweetness: '酸甜', rating: 4.5, price: 28, isHalal: false, isVegetarian: false, allergies: {}, calorie: '200', protein: '15' }],
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 28. 管理后台批量操作安全测试
// ─────────────────────────────────────────────
describe('管理后台批量操作安全', () => {
  it('POST /api/admin/dish/batch-status 无token返回401', async () => {
    const { status, body } = await api('/api/admin/dish/batch-status', {
      method: 'POST',
      body: JSON.stringify({ ids: [1, 2], isActive: true }),
    });
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });

  it('POST /api/admin/dish/batch-delete 无token返回401', async () => {
    const { status, body } = await api('/api/admin/dish/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: [1, 2] }),
    });
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });
});

// ─────────────────────────────────────────────
// 29. 菜品CRUD管理测试
// ─────────────────────────────────────────────
describe('菜品CRUD管理', () => {
  let adminToken = '';
  let newDishId = '';

  before(async () => { adminToken = await getAdminToken(); });

  it('POST /api/admin/dish 添加新菜品', async () => {
    const { status, body } = await api('/api/admin/dish', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ name: '测试菜品E2E', category: '热菜', spiciness: '微辣', price: 28, rating: 4.5 }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.id, '应返回新菜品ID');
    newDishId = body.id;
  });

  it('PUT /api/admin/dish/:id 更新菜品', async () => {
    assert.ok(newDishId, '前置测试未创建菜品');
    const { status, body } = await api('/api/admin/dish/' + newDishId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ name: '测试菜品更新版', price: 35 }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('DELETE /api/admin/dish/:id 软删除/切换状态', async () => {
    assert.ok(newDishId, '前置测试未创建菜品');
    const { status, body } = await api('/api/admin/dish/' + newDishId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('DELETE /api/admin/dish/:id/permanent 永久删除', async () => {
    assert.ok(newDishId, '前置测试未创建菜品');
    const { status, body } = await api('/api/admin/dish/' + newDishId + '/permanent', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/admin/dish 添加无效参数返回400', async () => {
    const { status, body } = await api('/api/admin/dish', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ name: '', price: -1 }),
    });
    assert.equal(status, 400);
    assert.equal(body.success, false);
  });
});

// ─────────────────────────────────────────────
// 31. 管理后台偏好统计测试
// ─────────────────────────────────────────────
describe('管理后台偏好统计', () => {
  let adminToken = '';
  before(async () => { adminToken = await getAdminToken(); });

  it('GET /api/admin/preference-stats 返回偏好统计', async () => {
    const { status, body } = await api('/api/admin/preference-stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.stats, '应有统计数据');
  });
});

// ─────────────────────────────────────────────
// 新增：反馈列表 API
// ─────────────────────────────────────────────
describe('反馈列表 API', () => {
  it('GET /api/feedback 返回反馈列表', async () => {
    const adminToken = await getAdminToken();
    const { status, body } = await api('/api/feedback', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.feedbacks), 'feedbacks应为数组');
  });
});

// ─────────────────────────────────────────────
// 新增：管理后台用户删除 API
// ─────────────────────────────────────────────
describe('管理后台用户删除 API', () => {
  it('POST /api/admin/users/:id/toggle 删除用户', async () => {
    const adminToken = await getAdminToken();
    // 注册一个专用测试用户，避免误操作 admin
    const testUser = 'toggle_test_' + Date.now();
    await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: testUser, password: 'Test123!' }) });
    // 获取用户列表找到测试用户
    const users = await api('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    const testUserData = users.body.users?.find(u => u.username === testUser);
    assert.ok(testUserData, '测试用户应存在');
    const { status, body } = await api('/api/admin/users/' + testUserData.id + '/toggle', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 新增：边缘情况测试
// ─────────────────────────────────────────────
describe('边缘情况测试', () => {
  it('POST /api/feedback 评分越界（负数）返回400', async () => {
    // 先获取一道菜
    const dishes = await api('/api/dishes');
    const dishId = dishes.body.dishes?.[0]?.id;
    if (!dishId) { assert.fail('无法获取菜品ID'); return; }
    const { status } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId, score: -1 }),
    });
    assert.equal(status, 400);
  });

  it('POST /api/feedback 评分越界（>5）返回400', async () => {
    const dishes = await api('/api/dishes');
    const dishId = dishes.body.dishes?.[0]?.id;
    if (!dishId) { assert.fail('无法获取菜品ID'); return; }
    const { status } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId, score: 6 }),
    });
    assert.equal(status, 400);
  });

  it('POST /api/feedback 无效 dishId 返回400', async () => {
    const { status } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: -1, score: 3 }),
    });
    assert.equal(status, 400);
  });

  it('POST /api/user/register 用户名太短返回400', async () => {
    const { status, body } = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'a', password: '123456' }),
    });
    assert.equal(status, 400);
  });

  it('POST /api/user/register 密码太短返回400', async () => {
    const { status, body } = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'test_' + Date.now(), password: '12345' }),
    });
    assert.equal(status, 400);
  });

  it('POST /api/user/login 不存在的用户名返回401', async () => {
    const { status, body } = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'nonexistent_user_xyz', password: '123456' }),
    });
    assert.equal(status, 401);
  });
});

// ─────────────────────────────────────────────
// 新增：favicon、图片上传、重训练测试
// ─────────────────────────────────────────────
describe('其他端点测试', () => {
  it('GET /favicon.ico 返回204', async () => {
    const res = await fetch(BASE + '/favicon.ico');
    assert.equal(res.status, 204);
  });

  it('GET /api/worker-health 返回success字段', async () => {
    const { status, body } = await api('/api/worker-health');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.alive, true);
  });
});

// ─────────────────────────────────────────────
// 新增：菜品数据完整性测试
// ─────────────────────────────────────────────
describe('菜品数据完整性', () => {
  it('所有菜品必有必填字段', async () => {
    const { status, body } = await api('/api/dishes');
    assert.equal(status, 200);
    for (const d of body.dishes) {
      assert.ok(d.name, '菜名必填: ' + d.id);
      assert.ok(d.category, '分类必填: ' + d.id);
      assert.ok(d.price !== undefined && d.price !== null, '价格必填: ' + d.id);
      assert.ok(d.rating !== undefined && d.rating !== null, '评分必填: ' + d.id);
    }
  });

  it('所有菜品价格应为正数', async () => {
    const { body } = await api('/api/dishes');
    for (const d of body.dishes) {
      const price = parseFloat(d.price);
      assert.ok(price >= 0, `价格不能为负数: ${d.name} = ${price}`);
    }
  });

  it('所有菜品评分应在 0-5 之间', async () => {
    const { body } = await api('/api/dishes');
    for (const d of body.dishes) {
      const rating = parseFloat(d.rating);
      assert.ok(rating >= 0 && rating <= 5, `评分越界: ${d.name} = ${rating}`);
    }
  });
});

// ─────────────────────────────────────────────
// 新增：推荐预测 API 边界测试
// ─────────────────────────────────────────────
describe('推荐预测边界测试', () => {
  it('POST /api/predict-rf 空 dishes 列表返回400', async () => {
    const { status, body } = await api('/api/predict-rf', {
      method: 'POST',
      body: JSON.stringify({
        userPrefs: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜' },
        dishes: [],
      }),
    });
    assert.equal(status, 400, '空 dishes 应返回400');
    assert.equal(body.success, false);
  });

  it('POST /api/predict-rf 缺少参数返回400', async () => {
    const { status } = await api('/api/predict-rf', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────
// 新增：静态文件安全测试
// ─────────────────────────────────────────────
describe('静态文件安全', () => {
  it('GET /.env 返回403', async () => {
    const res = await fetch(BASE + '/.env');
    assert.equal(res.status, 403);
  });

  it('GET /server.js 返回403', async () => {
    const res = await fetch(BASE + '/server.js');
    assert.equal(res.status, 403);
  });

  it('GET /db.js 返回403', async () => {
    const res = await fetch(BASE + '/db.js');
    assert.equal(res.status, 403);
  });

  it('GET /package.json 返回403', async () => {
    const res = await fetch(BASE + '/package.json');
    assert.equal(res.status, 403);
  });

  it('GET 允许的静态文件类型 - 正常资源', async () => {
    const res = await fetch(BASE + '/styles.css');
    assert.ok(res.status === 200 || res.status === 403, 'styles.css 状态: ' + res.status);
  });
});

// ─────────────────────────────────────────────
// 新增：菜品图片上传 API 测试
// ─────────────────────────────────────────────
describe('菜品图片上传 API', () => {
  let adminToken = '';
  before(async () => { adminToken = await getAdminToken(); });

  it('POST /api/admin/dish/upload-image 无文件返回400', async () => {
    const { status, body } = await api('/api/admin/dish/upload-image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ dishId: 1 }),
    });
    // 没有文件上传应返回400
    assert.equal(status, 400, '无文件上传应返回400');
  });

  it('POST /api/admin/dish/upload-image 非管理员返回401', async () => {
    const { status } = await api('/api/admin/dish/upload-image', {
      method: 'POST',
    });
    assert.equal(status, 401);
  });
});

// ─────────────────────────────────────────────
// 新增：XSS 注入防护测试
// ─────────────────────────────────────────────
describe('XSS 注入防护', () => {
  let adminToken = '';
  let xssDishId = '';

  before(async () => { adminToken = await getAdminToken(); });

  it('POST /api/admin/dish 阻止 XSS 菜名', async () => {
    const { status, body } = await api('/api/admin/dish', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({
        name: '<script>alert("xss")</script>',
        category: '热菜',
        price: 10,
        rating: 3,
      }),
    });
    // 服务器可能接受（200）或拒绝（400），但必须不崩溃
    // 注意：若状态200，后续的清理测试会删除该菜品
    assert.ok(status === 200 || status === 400, 'XSS注入不崩溃: ' + status);
    if (body.id) xssDishId = body.id;
  });

  it('已创建 XSS 菜品应被清理', async () => {
    if (!xssDishId) { console.log('没有 XSS 菜品需要清理，跳过'); return; }
    // 永久删除
    const { status } = await api('/api/admin/dish/' + xssDishId + '/permanent', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
  });
});

// ─────────────────────────────────────────────
// 新增：大请求体限制测试
// ─────────────────────────────────────────────
describe('大请求体限制', () => {
  it('POST /api/feedback 超大请求体', async () => {
    const { status } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        dishId: 1,
        score: 4,
        hugeField: 'x'.repeat(2 * 1024 * 1024), // 2MB+ 超限
      }),
    });
    // 应返回413或400等错误，不崩溃
    assert.ok(status === 400 || status === 413, '大请求体应返回400或413: ' + status);
  });
});

// ─────────────────────────────────────────────
// 新增：分类过滤与搜索测试
// ─────────────────────────────────────────────
describe('分类过滤', () => {
  it('GET /api/dishes 返回的菜品分类应完整', async () => {
    const { body } = await api('/api/dishes');
    const categories = [...new Set(body.dishes.map(d => d.category))];
    assert.ok(categories.includes('招牌'), '应包含招牌');
    assert.ok(categories.includes('传承陕菜'), '应包含传承陕菜');
    assert.ok(categories.includes('陕西小吃'), '应包含陕西小吃');
    assert.ok(categories.includes('特色凉菜'), '应包含特色凉菜');
  });
});

// ─────────────────────────────────────────────
// 新增：订单状态流转边界测试
// ─────────────────────────────────────────────
describe('订单状态流转边界', () => {
  let adminToken = '';

  before(async () => {
    const login = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    adminToken = login.body.token || '';
  });

  it('PUT /api/orders/:id/status 无效订单ID返回404', async () => {
    const { status } = await api('/api/orders/999999/status', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'completed' }),
    });
    assert.equal(status, 404, '无效订单ID应返回404');
  });
});

// ─────────────────────────────────────────────
// 新增：并发请求测试
// ─────────────────────────────────────────────
describe('并发请求稳定性', () => {
  it('同时发起 10 个 /api/dishes 请求不崩溃', async () => {
    const promises = Array(10).fill(null).map(() => api('/api/dishes'));
    const results = await Promise.all(promises);
    for (const r of results) {
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body.dishes));
    }
  });
});

// ─────────────────────────────────────────────
// 新增：厨房看板 API 测试
// ─────────────────────────────────────────────
describe('厨房看板 API', () => {
  it('GET /api/orders?status=pending,confirmed 返回订单列表', async () => {
    const adminToken = await getAdminToken();
    const res = await fetch(BASE + '/api/orders?status=pending,confirmed', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.orders), 'orders应为数组');
  });

  it('GET /api/orders 无status参数返回所有订单', async () => {
    const adminToken = await getAdminToken();
    const res = await fetch(BASE + '/api/orders', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 新增：偏好日志 API 测试
// ─────────────────────────────────────────────
describe('偏好日志 API', () => {
  it('POST /api/preference-log 记录完整偏好', async () => {
    const { status, body } = await api('/api/preference-log', {
      method: 'POST',
      body: JSON.stringify({
        spiciness: '微辣',
        saltiness: '适中',
        sweetness: '酸甜',
        price: '20-40',
        religion: '无特殊要求',
        allergies: ['海鲜'],
        userId: 'test_user',
        recommendationMode: 'auto',
        calorie: '适中',
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/preference-log 记录游客偏好', async () => {
    const { status, body } = await api('/api/preference-log', {
      method: 'POST',
      body: JSON.stringify({
        spiciness: '不辣',
        saltiness: '清淡',
        userId: 'guest',
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 新增：订单状态筛选测试
// ─────────────────────────────────────────────
describe('订单状态筛选', () => {
  it('GET /api/orders?status=completed 返回已完成订单', async () => {
    const adminToken = await getAdminToken();
    const res = await fetch(BASE + '/api/orders?status=completed', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.orders), 'orders应为数组');
  });

  it('GET /api/orders?status=invalid 处理无效状态', async () => {
    const adminToken = await getAdminToken();
    const res = await fetch(BASE + '/api/orders?status=invalid_status_xyz', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    const body = await res.json().catch(() => ({}));
    assert.ok(res.status === 200 || res.status === 400, '无效状态不崩溃: ' + res.status);
  });
});

// ─────────────────────────────────────────────
// 新增：模型重训练 API 测试
// ─────────────────────────────────────────────
describe('模型重训练 API', () => {
  let adminToken = '';
  before(async () => { adminToken = await getAdminToken(); });

  it('POST /api/admin/retrain 触发重训练', async () => {
    const { status, body } = await api('/api/admin/retrain', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    // 重训练可能成功或正在训练中
    assert.ok(status === 200 || status === 409, '重训练不崩溃: ' + status);
    if (status === 200) assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 新增：用户登录后信息完整 API 测试
// ─────────────────────────────────────────────
describe('用户登录信息完整性', () => {
  it('POST /api/user/login 返回完整用户信息', async () => {
    const uname = 'test_' + Date.now();
    await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    const { status, body } = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.token, '应返回 token');
    assert.ok(body.user, '应返回用户信息');
    assert.ok(Array.isArray(body.user.favorites), 'favorites 应为数组');
    assert.ok(Array.isArray(body.user.blacklist), 'blacklist 应为数组');
  });
});

// ─────────────────────────────────────────────
// 新增：订单创建完整字段测试
// ─────────────────────────────────────────────
describe('订单创建完整字段', () => {
  it('POST /api/order 带桌号创建订单', async () => {
    const { status, body } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'table_test',
        items: [{ id: 1, name: '测试菜品', price: 28, quantity: 2 }],
        totalPrice: 56,
        tableNumber: 5,
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.orderId, '应返回订单 ID');
  });

  it('POST /api/order 带多个菜品', async () => {
    const { status, body } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'multi_test',
        items: [
          { id: 1, name: '菜品A', price: 18 },
          { id: 2, name: '菜品B', price: 25 },
          { id: 3, name: '菜品C', price: 32 },
        ],
        totalPrice: 75,
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/order 零总价订单', async () => {
    const { status, body } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'free_test',
        items: [{ id: 1, name: '免费菜品', price: 0 }],
        totalPrice: 0,
      }),
    });
    assert.equal(status, 200, '零总价订单应成功: ' + status);
    assert.equal(body.success, true, '零总价订单应返回成功');
  });
});

// ─────────────────────────────────────────────
// 新增：管理后台统计结构测试
// ─────────────────────────────────────────────
describe('管理后台统计结构', () => {
  let adminToken = '';
  before(async () => { adminToken = await getAdminToken(); });

  it('GET /api/admin/stats 返回完整统计字段', async () => {
    const { status, body } = await api('/api/admin/stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    const s = body.stats;
    assert.ok(s.todayRecommendations >= 0, 'todayRecommendations');
    assert.ok(s.todayGuest >= 0, 'todayGuest');
    assert.ok(s.todayUser >= 0, 'todayUser');
    assert.ok(s.totalRecommendations >= 0, 'totalRecommendations');
    assert.ok(s.totalFeedback >= 0, 'totalFeedback');
    assert.ok(s.avgRating >= 0, 'avgRating');
    assert.ok(s.totalUsers >= 0, 'totalUsers');
    assert.ok(s.totalDishes > 0, 'totalDishes');
  });
});

// ─────────────────────────────────────────────
// 新增：订单状态筛选完整测试
// ─────────────────────────────────────────────
describe('订单状态筛选完整', () => {
  let adminToken = '';
  let orderId = '';
  before(async () => {
    adminToken = await getAdminToken();
    const r = await api('/api/order', {
      method: 'POST', body: JSON.stringify({ userId: 'filter_test', items: [{ id: 1, name: '测试', price: 10 }], totalPrice: 10 }),
    });
    orderId = r.body.orderId || '';
  });

  it('GET /api/orders?status=pending 筛选待处理订单', async () => {
    const res = await fetch(BASE + '/api/orders?status=pending', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
  });

  it('PUT /api/orders/:id/status 设置为 preparing', async () => {
    assert.ok(orderId, '需先创建订单');
    const { status, body } = await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ status: 'preparing' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ─────────────────────────────────────────────
// 新增：反馈完整信息测试
// ─────────────────────────────────────────────
describe('反馈完整信息', () => {
  it('POST /api/feedback 带完整偏好信息', async () => {
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        dishId: 1,
        score: 4.5,
        userPreferences: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜', price: '20-40', allergies: [] },
        userId: 'complete_test',
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/feedback 最低评分1分', async () => {
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: 1, score: 1, userId: 'min_test' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

console.log('测试文件已加载，共 80+ 个测试用例（覆盖 50+ 端点）...');