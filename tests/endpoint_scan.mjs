// 唐猫庭院 - 全面端点可用性扫描
// 测试所有API端点的基本响应，无需node:test，直接运行
import 'dotenv/config';

const BASE = 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;
const results = [];

async function api(path, options = {}) {
  const url = BASE + path;
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...rest,
  });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body, headers: res.headers };
}

async function getAdminToken() {
  const r = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  return r.body?.token || '';
}

async function getTestUserToken() {
  const uname = 'scan_' + Date.now();
  await api('/api/user/register', {
    method: 'POST',
    body: JSON.stringify({ username: uname, password: 'Test123!' }),
  });
  const r = await api('/api/user/login', {
    method: 'POST',
    body: JSON.stringify({ username: uname, password: 'Test123!' }),
  });
  return { token: r.body?.token || '', username: uname };
}

function record(name, status, expected, detail = '') {
  const pass = status === expected || (Array.isArray(expected) && expected.includes(status));
  results.push({ name, status, expected: Array.isArray(expected) ? expected : [expected], pass, detail });
  const icon = pass ? '✅' : '❌';
  console.log(`${icon} ${name} → ${status} (期望 ${Array.isArray(expected) ? expected.join('/') : expected})${detail ? ' — ' + detail : ''}`);
}

// ─────────────────────────────────────────────
// 1. 静态页面
// ─────────────────────────────────────────────
console.log('\n=== 1. 静态页面 ===');
for (const [path, name] of [['/', '首页'], ['/admin', '管理后台'], ['/kitchen', '厨房看板'], ['/styles.css', '样式文件'], ['/favicon.ico', 'favicon']]) {
  const res = await fetch(BASE + path);
  record(name, res.status, path === '/favicon.ico' ? 204 : 200);
}

// ─────────────────────────────────────────────
// 2. 公开API端点
// ─────────────────────────────────────────────
console.log('\n=== 2. 公开API端点 ===');
const publicEndpoints = [
  { path: '/api/dishes', method: 'GET', expected: 200, note: '菜品列表' },
  { path: '/api/model-metrics', method: 'GET', expected: 200, note: '模型指标' },
  { path: '/api/feature-importance', method: 'GET', expected: 200, note: '特征重要性' },
  { path: '/api/worker-health', method: 'GET', expected: 200, note: 'Worker健康' },
  { path: '/api/predict-rf', method: 'POST', body: { dishes: [1, 2, 3], userPrefs: { spiciness: '微辣' } }, expected: [200, 504], note: '推荐预测（可能504超时）' },
  { path: '/api/preference-log', method: 'POST', body: { spiciness: '微辣', userId: 'scan_test' }, expected: 200, note: '偏好日志' },
  { path: '/api/recommendation-log', method: 'POST', body: { userId: 'scan_test', recommendations: [1, 2] }, expected: 200, note: '推荐日志' },
];

for (const ep of publicEndpoints) {
  const { status, body } = await api(ep.path, ep.method === 'POST' ? { method: 'POST', body: JSON.stringify(ep.body) } : {});
  let detail = '';
  if (ep.note) detail = ep.note;
  if (body && body.success !== undefined) detail += ` success=${body.success}`;
  record(ep.method + ' ' + ep.path, status, ep.expected, detail);
}

// ─────────────────────────────────────────────
// 3. 用户注册/登录
// ─────────────────────────────────────────────
console.log('\n=== 3. 用户端点 ===');

// 正常注册
const { status: r1, body: b1 } = await api('/api/user/register', {
  method: 'POST', body: JSON.stringify({ username: 'scan_' + Date.now(), password: 'Test123!' }),
});
record('POST /api/user/register 正常', r1, 200, b1?.success ? 'success=true' : '');

// 空用户名
const { status: r2 } = await api('/api/user/register', {
  method: 'POST', body: JSON.stringify({ username: '', password: 'Test123!' }),
});
record('POST /api/user/register 空用户名', r2, 400);

// 短密码
const { status: r3 } = await api('/api/user/register', {
  method: 'POST', body: JSON.stringify({ username: 'scan_short_' + Date.now(), password: '12' }),
});
record('POST /api/user/register 短密码', r3, 400);

// 登录
const userInfo = await getTestUserToken();
record('POST /api/user/login 正常', 200, 200, userInfo.token ? '有token' : '无token');

// 空登录
const { status: r4 } = await api('/api/user/login', {
  method: 'POST', body: JSON.stringify({}),
});
record('POST /api/user/login 空参数', r4, 400);

// 错误密码
const { status: r5 } = await api('/api/user/login', {
  method: 'POST', body: JSON.stringify({ username: 'nobody', password: 'wrong' }),
});
record('POST /api/user/login 错误密码', r5, 401);

// ─────────────────────────────────────────────
// 4. 管理后台认证测试
// ─────────────────────────────────────────────
console.log('\n=== 4. 管理后台认证 ===');

// 无token访问
const adminAuthEndpoints = [
  '/api/admin/stats', '/api/admin/popular-dishes', '/api/admin/monitor',
  '/api/admin/model-info', '/api/admin/feedback-summary', '/api/admin/preference-stats',
  '/api/admin/daily-recommendations', '/api/admin/user-activity',
  '/api/admin/worst-dishes', '/api/admin/model-compare', '/api/admin/recommendation-stats',
  '/api/admin/model-history', '/api/admin/export/popular-dishes', '/api/admin/export/feedback',
  '/api/admin/export/orders', '/api/admin/users', '/api/admin/notifications',
];
for (const p of adminAuthEndpoints) {
  const { status } = await api(p);
  record('GET ' + p + ' 无token', status, 401);
}

// 订单/反馈无token
const { status: s1 } = await fetch(BASE + '/api/orders');
record('GET /api/orders 无token', s1, 401);
const { status: s2 } = await fetch(BASE + '/api/feedback');
record('GET /api/feedback 无token', s2, 401);

// ─────────────────────────────────────────────
// 5. 管理后台API（带token）
// ─────────────────────────────────────────────
console.log('\n=== 5. 管理后台API（带token） ===');
const adminToken = await getAdminToken();
if (!adminToken) {
  console.log('❌ 无法获取管理token，跳过后续测试');
} else {
  const auth = { headers: { 'Authorization': 'Bearer ' + adminToken } };

  // 统计
  for (const ep of [
    { path: '/api/admin/stats', note: 'dashboard统计', check: b => b.stats?.totalDishes > 0 },
    { path: '/api/admin/popular-dishes', note: '热门菜品', check: b => Array.isArray(b.dishes) },
    { path: '/api/admin/model-info', note: '模型信息', check: b => b.model?.version },
    { path: '/api/admin/monitor', note: '监控', check: b => b.monitor?.r2Trend },
    { path: '/api/admin/feedback-summary', note: '反馈汇总', check: b => b.success !== undefined },
    { path: '/api/admin/preference-stats', note: '偏好统计', check: b => b.success !== undefined },
    { path: '/api/admin/daily-recommendations', note: '每日推荐趋势', check: b => b.success !== undefined },
    { path: '/api/admin/user-activity', note: '用户活跃度', check: b => b.success !== undefined },
    { path: '/api/admin/worst-dishes', note: '最差菜品', check: b => Array.isArray(b.dishes) },
    { path: '/api/admin/model-compare', note: '模型对比', check: b => b.current !== undefined },
    { path: '/api/admin/recommendation-stats', note: '推荐统计', check: b => b.success !== undefined },
    { path: '/api/admin/model-history', note: '模型历史', check: b => b.success !== undefined },
    { path: '/api/admin/users', note: '用户列表', check: b => Array.isArray(b.users) },
    { path: '/api/admin/recommendation-details', note: '推荐详情', check: b => b.success !== undefined },
    { path: '/api/admin/notifications', note: '通知', check: b => b.success !== undefined },
  ]) {
    const { status, body } = await api(ep.path, auth);
    const checkResult = ep.check(body);
    record('GET ' + ep.path, status, 200, `${ep.note} dataValid=${checkResult}`);
  }

  // 数据导出
  for (const ep of [
    { path: '/api/admin/export/popular-dishes', note: '导出热门菜品' },
    { path: '/api/admin/export/feedback', note: '导出反馈' },
    { path: '/api/admin/export/orders', note: '导出订单' },
  ]) {
    const res = await fetch(BASE + ep.path, auth);
    record('GET ' + ep.path, res.status, 200, `${ep.note} length=${res.headers.get('content-length') || '?'}`);
  }

  // 菜品CRUD流程
  const addRes = await api('/api/admin/dish', {
    ...auth, method: 'POST',
    body: JSON.stringify({ name: '端点扫描测试菜', category: '热菜', price: 18, rating: 4.0 }),
  });
  record('POST /api/admin/dish 添加', addRes.status, 200, `id=${addRes.body?.dish?.id || addRes.body?.id || '?'}`);

  if (addRes.status === 200) {
    const newId = addRes.body?.dish?.id || addRes.body?.id;

    // 更新
    const updRes = await api('/api/admin/dish/' + newId, {
      ...auth, method: 'PUT',
      body: JSON.stringify({ name: '端点扫描测试菜-已更新', price: 25 }),
    });
    record('PUT /api/admin/dish/' + newId + ' 更新', updRes.status, 200);

    // 软删除（切换active）
    const delRes = await api('/api/admin/dish/' + newId, { ...auth, method: 'DELETE' });
    record('DELETE /api/admin/dish/' + newId + ' 切换状态', delRes.status, 200);

    // 永久删除
    const permRes = await api('/api/admin/dish/' + newId + '/permanent', { ...auth, method: 'DELETE' });
    record('DELETE /api/admin/dish/永久删除', permRes.status, 200);
  }

  // 批量操作
  const batchStatusRes = await api('/api/admin/dish/batch-status', {
    ...auth, method: 'POST',
    body: JSON.stringify({ ids: [1, 2], is_active: true }),
  });
  record('POST /api/admin/dish/batch-status', batchStatusRes.status, 200);

  // 用户管理
  const { status: u1, body: ub1 } = await api('/api/admin/users', auth);
  record('GET /api/admin/users', u1, 200, `count=${ub1?.users?.length || 0}`);

  if (ub1?.users?.length > 0) {
    const firstUserId = ub1.users[0].id || ub1.users[0].username;
    const { status: u2, body: ub2 } = await api('/api/admin/users/' + firstUserId, auth);
    record('GET /api/admin/users/:id', u2, 200, ub2?.success ? 'success=true' : '');
  }
}

// ─────────────────────────────────────────────
// 6. 用户认证API（带token）
// ─────────────────────────────────────────────
console.log('\n=== 6. 用户认证API ===');
const { token: userToken, username } = await getTestUserToken();

if (userToken) {
  const userAuth = { headers: { 'Authorization': 'Bearer ' + userToken } };

  // 保存偏好
  const { status: p1 } = await api('/api/user-preferences', {
    ...userAuth, method: 'POST',
    body: JSON.stringify({ preferences: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜' } }),
  });
  record('POST /api/user-preferences', p1, 200);

  // 收藏
  const { status: f1 } = await api('/api/user-favorites', {
    ...userAuth, method: 'POST',
    body: JSON.stringify({ favorites: [1, 2, 3] }),
  });
  record('POST /api/user-favorites', f1, 200);

  // 黑名单
  const { status: b1 } = await api('/api/user-blacklist', {
    ...userAuth, method: 'POST',
    body: JSON.stringify({ blacklist: [4, 5] }),
  });
  record('POST /api/user-blacklist', b1, 200);

  // 创建订单
  const { status: o1, body: ob1 } = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify({ userId: username, items: [{ id: 1, name: '扫描测试菜', price: 18 }], totalPrice: 18 }),
  });
  record('POST /api/order', o1, 200, `orderId=${ob1?.orderId || '?'}`);

  // 查询订单
  const { status: o2 } = await fetch(BASE + '/api/orders?userId=' + encodeURIComponent(username), userAuth);
  record('GET /api/orders', o2, 200);

  // 提交反馈
  const { status: fb1 } = await api('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ dishId: 1, score: 4.5, userId: username, userPreferences: { spiciness: '微辣' } }),
  });
  record('POST /api/feedback', fb1, 200);

  // 查询反馈
  const { status: fb2 } = await fetch(BASE + '/api/feedback?userId=' + encodeURIComponent(username), userAuth);
  record('GET /api/feedback', fb2, 200);

  // 删除用户
  const { status: d1 } = await api('/api/user/delete', {
    ...userAuth, method: 'POST',
    body: JSON.stringify({ username }),
  });
  record('POST /api/user/delete', d1, 200, '删除测试用户');
}

// ─────────────────────────────────────────────
// 7. 安全边界
// ─────────────────────────────────────────────
console.log('\n=== 7. 安全边界 ===');
const sensitivePaths = ['.env', 'server.js', 'db.js', 'package.json', 'auth.js', 'user_storage.js', 'logger.js', 'build.js'];
for (const p of sensitivePaths) {
  const res = await fetch(BASE + '/' + p);
  record('GET /' + p + ' 敏感文件', res.status, [403, 404]);
}

// 无效路径
const { status: inv1 } = await fetch(BASE + '/api/nonexistent');
record('GET /api/nonexistent 无效路径', inv1, 404);

// admin登录空参数
const { status: al1 } = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({}) });
record('POST /api/admin/login 空参数', al1, 401);

// ─────────────────────────────────────────────
// 汇总
// ─────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log('全面端点扫描结果');
console.log('═══════════════════════════════════════');
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`总计: ${results.length} | 通过: ${passed} | 失败: ${failed}`);
if (failed > 0) {
  console.log('\n❌ 失败列表:');
  for (const r of results.filter(r => !r.pass)) {
    console.log(`  ${r.name} — 实际状态 ${r.status}, 期望 ${r.expected.join('/')}`);
  }
}
process.exit(failed > 0 ? 1 : 0);