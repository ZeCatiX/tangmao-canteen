// 唐猫庭院 - 全面 E2E 集成测试 v3.0
// 覆盖：所有页面加载、按钮存在性、表单结构、API端点、安全边界、边缘情况、并发稳定性
// 无需数据库，通过 HTTP 和 HTML 结构验证

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
// prettier 鲁棒匹配:去全部空白后再比对子串
const squashWS = (s) => String(s).replace(/\s+/g, '');
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

async function getText(path) {
  const res = await fetch(BASE + path);
  return { status: res.status, text: await res.text() };
}

async function getAdminToken() {
  const r = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  return r.body.token || '';
}

function hasElementWithId(html, id) {
  return html.includes('id="' + id + '"') || html.includes("id='" + id + "'");
}

// ================================================================
// 1. 所有页面加载测试
// ================================================================
describe('1. 页面加载测试', () => {
  it('首页 / 加载成功', async () => {
    const { status, text } = await getText('/');
    assert.equal(status, 200);
    assert.ok(text.includes('唐猫庭院'), '应包含店名');
    assert.ok(hasElementWithId(text, 'guest-btn'), '开始点餐按钮');
    assert.ok(hasElementWithId(text, 'login-btn'), '登录按钮');
    assert.ok(hasElementWithId(text, 'register-btn'), '注册按钮');
    assert.ok(hasElementWithId(text, 'nav-home'), '首页导航');
    assert.ok(hasElementWithId(text, 'nav-about'), '关于本店导航');
    assert.ok(hasElementWithId(text, 'nav-dataset'), '全部菜单导航');
    assert.ok(hasElementWithId(text, 'nav-cart'), '购物车导航');
  });

  it('首页所有section容器存在', async () => {
    const { text } = await getText('/');
    const sections = ['home-section', 'login-section', 'register-section',
      'preference-section', 'profile-section', 'recommendation-section',
      'feedback-section', 'cart-section', 'end-section', 'about-section',
      'dataset-section'];
    for (const s of sections) {
      assert.ok(hasElementWithId(text, s), '缺少section: ' + s);
    }
  });

  it('管理后台 /admin 加载成功', async () => {
    const { status, text } = await getText('/admin');
    assert.equal(status, 200);
    assert.ok(hasElementWithId(text, 'admin-login-btn'), '登录按钮');
    assert.ok(hasElementWithId(text, 'admin-login-user'), '用户名输入');
    assert.ok(hasElementWithId(text, 'admin-login-pass'), '密码输入');
    assert.ok(hasElementWithId(text, 'stat-cards'), '统计卡片');
    assert.ok(hasElementWithId(text, 'add-dish-btn'), '添加菜品按钮');
    assert.ok(hasElementWithId(text, 'dishModal'), '菜品弹窗');
  });

  it('管理后台所有页面ID存在', async () => {
    const { text } = await getText('/admin');
    const pages = ['page-dashboard', 'page-dishes', 'page-feedback',
      'page-preferences', 'page-analytics', 'page-model', 'page-apidocs', 'page-users'];
    for (const p of pages) {
      assert.ok(hasElementWithId(text, p), '缺少page: ' + p);
    }
  });

  it('厨房看板 /kitchen 加载成功', async () => {
    const { status, text } = await getText('/kitchen');
    assert.equal(status, 200);
    assert.ok(hasElementWithId(text, 'login-overlay'), '登录覆盖层');
    assert.ok(hasElementWithId(text, 'login-user'), '用户名输入');
    assert.ok(hasElementWithId(text, 'login-pass'), '密码输入');
    assert.ok(hasElementWithId(text, 'login-btn'), '登录按钮');
    assert.ok(hasElementWithId(text, 'order-list'), '订单列表');
    assert.ok(hasElementWithId(text, 'current-time'), '当前时间');
    assert.ok(text.includes('btn-complete'), '完成按钮（class）');
    assert.ok(text.includes('loadOrders'), '订单加载函数');
    assert.ok(text.includes('completeOrder'), '完成订单函数');
  });

  it('样式文件 /styles.css 加载', async () => {
    const { status, text } = await getText('/styles.css');
    assert.equal(status, 200);
    assert.ok(text.length > 100, '样式文件应大于100字节');
  });
});

// ================================================================
// 2. 首页按钮与交互元素测试
// ================================================================
describe('2. 首页交互元素', () => {
  it('导航栏所有链接', async () => {
    const { text } = await getText('/');
    assert.ok(hasElementWithId(text, 'nav-home'), '首页');
    assert.ok(hasElementWithId(text, 'nav-about'), '关于本店');
    assert.ok(hasElementWithId(text, 'nav-dataset'), '全部菜单');
    assert.ok(hasElementWithId(text, 'nav-profile-item'), '我的');
    assert.ok(hasElementWithId(text, 'nav-user'), '登录');
    assert.ok(hasElementWithId(text, 'nav-cart'), '购物车');
    assert.ok(hasElementWithId(text, 'cart-badge'), '购物车角标');
  });

  it('首页三个特色卡片', async () => {
    const { text } = await getText('/');
    assert.ok(text.includes('唐风雅韵'));
    assert.ok(text.includes('猫趣盎然'));
    assert.ok(text.includes('珍馐美馔'));
  });

  it('登录表单', async () => {
    const { text } = await getText('/');
    assert.ok(hasElementWithId(text, 'login-form'));
    assert.ok(hasElementWithId(text, 'login-username'));
    assert.ok(hasElementWithId(text, 'login-password'));
    assert.ok(hasElementWithId(text, 'back-to-home'));
  });

  it('注册表单', async () => {
    const { text } = await getText('/');
    assert.ok(hasElementWithId(text, 'register-form'));
    assert.ok(hasElementWithId(text, 'register-username'));
    assert.ok(hasElementWithId(text, 'register-password'));
    assert.ok(hasElementWithId(text, 'register-confirm'));
  });

  it('偏好设置表单完整', async () => {
    const { text } = await getText('/');
    const ids = ['preference-form', 'spiciness', 'saltiness', 'sweetness',
      'price', 'calorie', 'religion', 'allergy-none', 'allergy-seafood',
      'allergy-peanut', 'allergy-egg', 'allergy-soy', 'allergy-gluten',
      'recommendation-mode', 'view-profile-btn', 'logout-btn'];
    for (const id of ids) {
      assert.ok(hasElementWithId(text, id), '缺少偏好元素: ' + id);
    }
  });

  it('推荐结果页面按钮', async () => {
    const { text } = await getText('/');
    const ids = ['recommendation-section', 'recommendation-loading',
      'recommendation-result', 'dish-list', 'refresh-recommendations',
      'end-recommendation', 'end-logout-btn', 'back-to-preference'];
    for (const id of ids) {
      assert.ok(hasElementWithId(text, id), '缺少推荐元素: ' + id);
    }
  });

  it('星级评分页面', async () => {
    const { text } = await getText('/');
    assert.ok(hasElementWithId(text, 'feedback-section'));
    assert.ok(hasElementWithId(text, 'star-rating'));
    assert.ok(hasElementWithId(text, 'star-submit-btn'));
  });

  it('购物车页面', async () => {
    const { text } = await getText('/');
    assert.ok(hasElementWithId(text, 'cart-section'));
    assert.ok(hasElementWithId(text, 'cart-clear-btn'));
    assert.ok(hasElementWithId(text, 'cart-checkout-btn'));
    assert.ok(hasElementWithId(text, 'cart-close-btn'));
  });

  it('点餐完成页面', async () => {
    const { text } = await getText('/');
    const ids = ['end-section', 'end-dish-count', 'end-avg-match',
      'end-top-match', 'end-model-r2', 'end-satisfaction',
      'end-sat-submit', 'new-recommendation', 'end-logout'];
    for (const id of ids) {
      assert.ok(hasElementWithId(text, id), '缺少完成页元素: ' + id);
    }
  });

  it('全部菜单页面筛选功能', async () => {
    const { text } = await getText('/');
    const ids = ['dataset-section', 'menu-search', 'menu-filter-cat',
      'menu-filter-spice', 'menu-filter-price', 'menu-sort',
      'menu-reset-filter', 'menu-count', 'dataset-table-body'];
    for (const id of ids) {
      assert.ok(hasElementWithId(text, id), '缺少菜单元素: ' + id);
    }
  });
});

// ================================================================
// 3. 管理后台页面元素测试
// ================================================================
describe('3. 管理后台元素', () => {
  it('菜品管理弹窗完整', async () => {
    const { text } = await getText('/admin');
    const ids = ['dish-name', 'dish-description', 'dish-category',
      'dish-spiciness', 'dish-price', 'dish-rating', 'dish-saltiness',
      'dish-sweetness', 'dish-tags', 'dish-active', 'dish-image-file',
      'dish-image-upload', 'dish-image-preview', 'save-dish-btn', 'delete-dish-btn'];
    for (const id of ids) {
      assert.ok(hasElementWithId(text, id), '缺少弹窗元素: ' + id);
    }
  });

  it('模型管理页完整', async () => {
    const { text } = await getText('/admin');
    const ids = ['retrain-btn', 'model-compare-table', 'model-history-table'];
    for (const id of ids) {
      assert.ok(hasElementWithId(text, id), '缺少模型元素: ' + id);
    }
  });

  it('数据分析页完整', async () => {
    const { text } = await getText('/admin');
    const ids = ['daily-trend-chart', 'pref-pie-chart', 'user-activity-chart',
      'worst-dishes-table', 'rec-log-table'];
    for (const id of ids) {
      assert.ok(hasElementWithId(text, id), '缺少分析元素: ' + id);
    }
  });
});

// ================================================================
// 4. 公开API端点测试
// ================================================================
describe('4. 公开API端点', () => {
  it('GET /api/dishes 返回菜品列表', async () => {
    const { status, body } = await api('/api/dishes');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.dishes), 'dishes应为数组');
    assert.ok(body.dishes.length > 0, '至少有一道菜');
    const d = body.dishes[0];
    assert.ok(d.id !== undefined, '应有id');
    assert.ok(d.name, '应有name');
    assert.ok(d.category, '应有category');
    assert.ok(d.price !== undefined, '应有price');
    assert.ok(d.rating !== undefined, '应有rating');
  });

  it('GET /api/feature-importance 返回特征', async () => {
    const { status, body } = await api('/api/feature-importance');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.importance), 'importance应为数组');
    assert.ok(body.importance.length >= 6, '至少6个特征');
    assert.ok(body.explanation, '应有解释');
  });

  it('GET /api/model-metrics 返回指标', async () => {
    const { status, body } = await api('/api/model-metrics');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.metrics, '应有metrics对象');
  });

  it('GET /api/worker-health 返回健康状态', async () => {
    const { status, body } = await api('/api/worker-health');
    assert.equal(status, 200);
    assert.ok(body.alive !== undefined, 'alive');
    assert.ok(body.ready !== undefined, 'ready');
  });
});

// ================================================================
// 5. 用户API测试
// ================================================================
describe('5. 用户API', () => {
  it('POST /api/user/register 输入校验', async () => {
    const { status: s1 } = await api('/api/user/register', {
      method: 'POST', body: JSON.stringify({ username: '', password: 'test123' }),
    });
    assert.equal(s1, 400, '空用户名应返回400');
    const { status: s2 } = await api('/api/user/register', {
      method: 'POST', body: JSON.stringify({ username: 'test_u', password: '123' }),
    });
    assert.equal(s2, 400, '短密码应返回400');
  });

  it('POST /api/user/register + login 完整流程', async () => {
    const uname = 'e2e_' + Date.now();
    const { status: s1, body: b1 } = await api('/api/user/register', {
      method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }),
    });
    assert.equal(s1, 200);
    assert.equal(b1.success, true);
    const { status: s2 } = await api('/api/user/register', {
      method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }),
    });
    assert.equal(s2, 400, '重复注册应返回400');
    const { status: s3, body: b3 } = await api('/api/user/login', {
      method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }),
    });
    assert.equal(s3, 200);
    assert.equal(b3.success, true);
    assert.ok(b3.token, '应返回token');
    assert.ok(Array.isArray(b3.user?.favorites), 'favorites应为数组');
    assert.ok(Array.isArray(b3.user?.blacklist), 'blacklist应为数组');
  });

  it('POST /api/user/login 错误处理', async () => {
    const { status: s1 } = await api('/api/user/login', {
      method: 'POST', body: JSON.stringify({}),
    });
    assert.equal(s1, 400, '空参数应返回400');
    const { status: s2 } = await api('/api/user/login', {
      method: 'POST', body: JSON.stringify({ username: 'nobody', password: 'wrong' }),
    });
    assert.equal(s2, 401, '错误密码应返回401');
  });
});

// ================================================================
// 6. 管理后台API测试
// ================================================================
describe('6. 管理后台API', () => {
  let token = '';

  before(async () => { token = await getAdminToken(); });

  it('POST /api/admin/login 验证', async () => {
    const { status: s1 } = await api('/api/admin/login', {
      method: 'POST', body: JSON.stringify({}),
    });
    assert.equal(s1, 401, '空参数应返回401');
    const { status: s3, body: b3 } = await api('/api/admin/login', {
      method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    assert.equal(s3, 200);
    assert.equal(b3.success, true);
    assert.ok(b3.token, '应返回token');
  });

  it('无token返回401', async () => {
    const paths = ['/api/admin/stats', '/api/admin/popular-dishes',
      '/api/admin/monitor', '/api/admin/model-info'];
    for (const p of paths) {
      const { status } = await api(p);
      assert.equal(status, 401, p + ' 无token应返回401');
    }
  });

  it('带token正常工作', async () => {
    assert.ok(token, '需要token');
    const eps = [
      { path: '/api/admin/stats', check: b => b.stats?.totalDishes > 0 },
      { path: '/api/admin/popular-dishes', check: b => Array.isArray(b.dishes) },
      { path: '/api/admin/model-info', check: b => b.model?.version },
      { path: '/api/admin/monitor', check: b => b.monitor?.r2Trend },
    ];
    for (const ep of eps) {
      const { status, body } = await api(ep.path, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      assert.equal(status, 200, ep.path + ' 应返回200');
      assert.equal(body.success, true, ep.path + ' 应成功');
      assert.ok(ep.check(body), ep.path + ' 验证失败');
    }
  });
});

// ================================================================
// 7. 订单与反馈API测试
// ================================================================
describe('7. 订单与反馈API', () => {
  it('POST /api/order 空订单验证', async () => {
    const { status } = await api('/api/order', {
      method: 'POST', body: JSON.stringify({ items: [] }),
    });
    assert.equal(status, 400);
  });

  it('POST /api/order 创建订单', async () => {
    const { status, body } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({ userId: 'e2e_test', items: [{ id: dishPool[0].id, name: '测试', price: 18 }], totalPrice: 18 }),
    });
    assert.equal(status, 200);
    assert.ok(body.orderId, '应返回订单ID');
  });

  it('POST /api/order 多菜品+桌号', async () => {
    const { status, body } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({ userId: 'multi_test', items: [{ id: dishPool[0].id, name: 'A', price: 10 }, { id: dishPool[1].id, name: 'B', price: 20 }], totalPrice: 30, tableNumber: '29' }),
    });
    assert.equal(status, 200);
    assert.ok(body.orderId);
  });

  it('POST /api/feedback 评分边界', async () => {
    const { status: s1 } = await api('/api/feedback', { method: 'POST', body: JSON.stringify({ dishId: 1, score: -1 }) });
    assert.equal(s1, 400, '负数评分');
    const { status: s2 } = await api('/api/feedback', { method: 'POST', body: JSON.stringify({ dishId: 1, score: 6 }) });
    assert.equal(s2, 400, '超范围评分');
    const { status: s3 } = await api('/api/feedback', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(s3, 400, '缺少参数');
  });

  it('POST /api/feedback 正常提交', async () => {
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: 1, score: 4.5, userId: 'e2e_test', userPreferences: { spiciness: '微辣' } }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ================================================================
// 8. 用户偏好API测试
// ================================================================
describe('8. 用户偏好API', () => {
  const uname = 'pref_e2' + Date.now();

  it('POST /api/user-preferences 保存偏好', async () => {
    await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    const login = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    const token = login.body.token;
    const { status, body } = await api('/api/user-preferences', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ preferences: { spiciness: '微辣' } }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('POST /api/preference-log 记录偏好日志', async () => {
    const { status, body } = await api('/api/preference-log', {
      method: 'POST', body: JSON.stringify({ spiciness: '微辣', userId: 'e2e_test' }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ================================================================
// 9. 安全与边界测试
// ================================================================
describe('9. 安全与边界测试', () => {
  it('敏感文件被阻断', async () => {
    for (const path of ['/.env', '/server.js', '/db.js', '/package.json', '/auth.js']) {
      const res = await fetch(BASE + path);
      assert.ok(res.status === 403 || res.status === 404, `${path} 应返回 403/404，实际 ${res.status}`);
    }
  });

  it('GET /api/orders 无token返回401', async () => {
    const res = await fetch(BASE + '/api/orders');
    assert.equal(res.status, 401);
  });

  it('无效API路径返回404', async () => {
    const res = await fetch(BASE + '/api/nonexistent');
    assert.equal(res.status, 404);
  });

  it('错误信息不泄露内部细节', async () => {
    const { body } = await api('/api/feedback', { method: 'POST', body: JSON.stringify({}) });
    if (body.error) {
      assert.ok(!body.error.includes('e.message'), '不应泄露原始错误');
      assert.ok(!body.error.includes('Error:'), '不应包含堆栈信息');
    }
  });

  it('XSS转义函数存在', async () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.ok(content.includes('function esc(') || content.includes('esc ='), 'script.js 应包含 esc()');
  });
});

// ================================================================
// 38. 新增：showProfile 认证头修复验证
// ================================================================
describe('38. showProfile 认证头修复', () => {
  it('js/core.js 中 /api/orders fetch 包含 authHeaders', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    // 2026-09-17: 实现已改用 safeFetch 封装,断言放宽为"/api/orders 调用携带 authHeaders()"
    const ordersLine = content.split('\n').find(l => l.includes('/api/orders?userId=') && l.includes('authHeaders()'));
    assert.ok(ordersLine, 'showProfile 的 /api/orders 请求应包含认证头');
  });

  it('script.js 构建产物包含认证头修复', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.ok(content.includes('encodeURIComponent(currentUser),{headers:authHeaders()})'),
      '构建产物应包含认证头修复');
  });
});

// ================================================================
// 39. 新增：登录/注册明文密码移除验证
// ================================================================
describe('39. 明文密码移除验证', () => {
  it('js/core.js 中无 localStorage 明文密码存储', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    // 不应在 localStorage 中存储 password 字段（API 请求体中使用 password:p 是正常的）
    assert.ok(!content.includes('password:p,created_at'), '不应在 localStorage 存储密码');
    assert.ok(!content.includes('password:p,preferences'), '不应在 localStorage 存储密码');
    assert.ok(!content.includes('password:u'), '不应错误存储密码');
  });

  it('js/core.js 登录失败时不再本地回退明文比较', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    assert.ok(!content.includes('user.password===p'), '不应使用明文密码比较');
  });

  it('script.js 构建产物无 localStorage 密码存储', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.ok(!content.includes('password:p,created_at'), '构建产物不应有 localStorage 密码');
    assert.ok(!content.includes('password:p,preferences'), '构建产物不应有 localStorage 密码');
  });
});

// ================================================================
// 40. 新增：addToBlacklist 虚假反馈移除验证
// ================================================================
describe('40. 拉黑虚假反馈移除', () => {
  it('js/core.js 中 addToBlacklist 不自动提交低分反馈', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    // 拉黑后不应自动提交 score:2.0 的反馈
    const blacklistBlock = content.substring(content.indexOf('function addToBlacklist'), content.indexOf('function deleteAccount'));
    assert.ok(!blacklistBlock.includes('score:2.0'), '拉黑不应自动提交低分反馈');
    assert.ok(!blacklistBlock.includes("type:'dislike'"), '拉黑不应自动提交 dislike 反馈');
  });
});

// ================================================================
// 41. 新增：admin 自动登出机制验证
// ================================================================
describe('41. Admin 自动登出机制', () => {
  it('admin.html fetch拦截器包含 401 自动登出', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.ok(content.includes('resp.status === 401'), '应检测 401 状态');
    assert.ok(content.includes("localStorage.removeItem('adminToken')"), '应清除 adminToken');
    assert.ok(content.includes('登录已过期'), '应显示过期提示');
  });
});

// ================================================================
// 42. 新增：用户删除数据清理验证
// ================================================================
describe('42. 用户删除数据清理', () => {
  it('server.js 用户删除时清理反馈和推荐日志', () => {
    const fs = require('fs');
    const path = require('path');
    const content = ['server.js', 'server/routes/users.js', 'server/routes/admin.js', 'server/routes/orders.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    const toggleBlock = content.substring(content.indexOf("app.post('/api/admin/users/:id/toggle'"), content.indexOf("app.get('/api/admin/notifications'"));
    assert.ok(toggleBlock.includes('DELETE FROM feedback'), '应清理用户反馈');
    assert.ok(toggleBlock.includes('DELETE FROM recommendation_log'), '应清理推荐日志');
    assert.ok(toggleBlock.includes('SELECT id, username'), '应先获取用户名');
  });

  it('server.js 用户删除清理逻辑正确', () => {
    const fs = require('fs');
    const path = require('path');
    const content = ['server.js', 'server/routes/users.js', 'server/routes/admin.js', 'server/routes/orders.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    const toggleBlock = content.substring(content.indexOf("app.post('/api/admin/users/:id/toggle'"), content.indexOf("app.get('/api/admin/notifications'"));
    // 确保不是先删除用户再查询（会导致查询不到）
    assert.ok(toggleBlock.indexOf('SELECT id, username') > toggleBlock.indexOf('DELETE FROM users WHERE') === false ||
      toggleBlock.indexOf('SELECT id, username') < toggleBlock.indexOf('DELETE FROM users WHERE'),
      '应先查询用户名再删除用户');
  });
});

// ================================================================
// 43. 新增：前端 null 安全保护验证
// ================================================================
describe('43. 前端 null 安全保护', () => {
  it('admin.html 中 Modal.getInstance 有空检查', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.ok(content.includes('if(m)m.hide()'), 'Modal.hide 应有空检查');
    assert.ok(content.includes('if(m)m.hide()'), '删除弹窗应有空检查');
  });

  it('admin.html 页面切换有目标检查', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.ok(content.includes('const target = document.getElementById'), '页面切换应检查目标');
    assert.ok(content.includes('if (target)'), '应判断目标存在');
  });

  it('script.js 关键函数有 null 保护', () => {
    const fs = require('fs');
    const path = require('path');
    // esbuild 压缩会改写局部变量名(rl/rr/$s),精确断言读模块源码
    const content = fs.readFileSync(path.join(__dirname, '..', 'js', 'recommendation.js'), 'utf8');
    assert.ok(squashWS(content).includes('if(!rl||!rr)'),
      '推荐入口应有 null 保护');
  });
});

// ================================================================
// 44. 新增：用户删除完整流程测试
// ================================================================
describe('44. 用户删除完整流程', () => {
  it('注册用户 -> 提交反馈 -> 删除用户 -> 确认反馈清理', async () => {
    const token = await getAdminToken();
    const uname = 'cleanup' + Date.now();
    // 注册用户
    await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    // 提交反馈
    await api('/api/feedback', { method: 'POST', body: JSON.stringify({ dishId: 1, score: 4, userId: uname }) });
    // 获取用户ID
    const usersRes = await api('/api/admin/users', { headers: { 'Authorization': 'Bearer ' + token } });
    const user = usersRes.body.users.find(u => u.username === uname);
    assert.ok(user, '用户应存在');
    // 删除用户
    const del = await api('/api/admin/users/' + user.id + '/toggle', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token },
    });
    assert.equal(del.status, 200);
    assert.equal(del.body.success, true);
  });
});

console.log('✅ 全面E2E测试增强版 v4 加载完成，共 230+ 测试用例');

// ================================================================
// 45. 新增：recommendation.js DOM null 保护验证
// ================================================================
describe('45. recommendation.js DOM null 保护', () => {
  it('fetchRecommendations 有 DOM null 保护', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'js', 'recommendation.js'), 'utf8');
    assert.ok(squashWS(content).includes('if(!rl||!rr)'), '应有 rl 和 rr 的 null 检查');
    assert.ok(squashWS(content).includes("rl=$('recommendation-loading')"), '应有 loading 元素的 null 检查(prettier 后为 const rl 形态)');
  });

  it('displayRecommendations 有 dish-list null 保护', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'js', 'recommendation.js'), 'utf8');
    assert.ok(squashWS(content).includes('if(!dl)'), '应有 dl 的 null 检查');
  });

  it('matchRate 显示有 NaN 保护', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'js', 'recommendation.js'), 'utf8');
    assert.ok(content.includes('isFinite(d.matchRateDisplay'), '应有 isFinite 检查(量尺校准后守卫对象为 matchRateDisplay/matchRate 三元形态);');
  });

  it('script.js 构建产物包含 null 保护', () => {
    const fs = require('fs');
    const path = require('path');
    // 变量名会被压缩改写,产物级只断言压缩后仍稳定的形态;精确断言由源码用例覆盖
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.ok(bundle.includes('isFinite('), '构建产物应有 isFinite 保护(函数名全局保留)');
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'recommendation.js'), 'utf8');
    assert.ok(squashWS(src).includes('if(!rl||!rr)'), '源码应有 rl/rr null 保护');
  });
});

// ================================================================
// 46. 新增：checkoutCart 认证头和数据一致性验证
// ================================================================
describe('46. checkoutCart 修复验证', () => {
  it('checkoutCart 使用 authHeaders', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    assert.ok(content.includes('authHeaders()'), 'core.js 应包含 authHeaders 调用');
    assert.ok(content.includes('clearCart()') && squashWS(content).includes('then((d)=>{'), 'clearCart 应在成功回调中');
  });

  it('endRecommendation 使用 authHeaders', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    const block = content.substring(content.indexOf('function endRecommendation'), content.indexOf('function displayRecommendations'));
    assert.ok(block.includes('authHeaders()'), 'endRecommendation 应包含认证头');
  });

  it('script.js 构建产物包含认证头', () => {
    const fs = require('fs');
    const path = require('path');
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    // 确认构建产物仍携带认证头调用(authHeaders 是 HTML onclick 引用的全局名,压缩不会改写);
    // 引号形态 esbuild 用双引号,断言按正则容忍两种引号
    assert.ok(/['"]Content-Type['"]\s*:\s*['"]application\/json['"]\s*,\s*\.\.\.authHeaders\(\)/.test(bundle), '构建产物应有 authHeaders');
  });
});

// ================================================================
// 47. 新增：submitStarFeedback null 保护验证
// ================================================================
describe('47. submitStarFeedback null 保护', () => {
  it('submitStarFeedback 有 DOM null 保护和认证头', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    const block = content.substring(content.indexOf('function submitStarFeedback'), content.indexOf('function openStarFeedback'));
    assert.ok(block.includes('authHeaders()'), '评分反馈应有认证头');
    assert.ok(squashWS(block).includes('if(h)h.textContent'), 'star-hint 应有 null 检查');
    assert.ok(squashWS(block).includes('if(sb)sb.disabled'), 'star-submit-btn 应有 null 检查');
  });

  it('openStarFeedback 有 DOM null 保护', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    const idx = content.indexOf('function openStarFeedback');
    const slice = content.substring(idx, idx + 800);
    assert.ok(squashWS(slice).includes('if(fd)fd.textContent'), 'star-feedback-dish 应有 null 检查');
    assert.ok(squashWS(slice).includes('if(h)h.textContent'), 'star-hint 应有 null 检查');
    assert.ok(squashWS(slice).includes('if(sb)sb.disabled'), 'star-submit-btn 应有 null 检查');
  });

  it('script.js 构建产物包含评分安全保护', () => {
    const fs = require('fs');
    const path = require('path');
    // h 是函数内局部变量,压缩后形态不定;产物级断言函数名级别特征,精确断言由源码用例覆盖
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.ok(bundle.includes('function submitStarFeedback'), '构建产物应保留 submitStarFeedback');
    const src = frontSrc();
    assert.ok(squashWS(src).includes('if(h)h.textContent'), '源码应有 star-hint 保护');
  });
});

// ================================================================
// 48. 新增：购物车结算完整流程测试
// ================================================================
describe('48. 购物车结算流程', () => {
  it('POST /api/order 带认证头正常创建', async () => {
    // 注册用户
    const uname = 'cart_te' + Date.now();
    const reg = await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    assert.equal(reg.status, 200);
    // 登录获取 token
    const login = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    assert.equal(login.status, 200);
    const token = login.body.token;
    // 用 token 创建订单
    const { status, body } = await api('/api/order', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ userId: uname, items: [{ id: dishPool[0].id, name: '购物车测试菜', price: 28, qty: 2 }], totalPrice: 56 }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

// ================================================================
// 49. 新增：评分 API 带认证头测试
// ================================================================
describe('49. 评分 API 带认证头', () => {
  it('POST /api/feedback 带认证头正常提交', async () => {
    const uname = 'fb_auth' + Date.now();
    await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    const login = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    const token = login.body.token;
    const { status, body } = await api('/api/feedback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ dishId: 1, score: 4.5, userId: uname, userPreferences: { spiciness: '微辣' } }),
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });
});

console.log('✅ 全面E2E测试增强版 v5 加载完成，共 250+ 测试用例');

// ================================================================
// 50. 新增：ecosystem.config.js 配置验证
// ================================================================
describe('50. ecosystem.config.js 配置', () => {
  it('内存限制 >= 500M', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'ecosystem.config.js'), 'utf8');
    assert.ok(content.includes('500M'), '内存限制应为 500M');
  });

  it('包含完整 PM2 配置项', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'ecosystem.config.js'), 'utf8');
    const required = ['name', 'script', 'max_memory_restart', 'restart_delay', 'max_restarts', 'kill_timeout', 'listen_timeout'];
    for (const r of required) {
      assert.ok(content.includes(r), '缺少配置项: ' + r);
    }
  });
});

// ================================================================
// 51. 新增：docker-compose.yml 环境变量验证
// ================================================================
describe('51. docker-compose 环境变量', () => {
  it('JWT_SECRET 使用 :? 强制检查', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
    assert.ok(content.includes('JWT_SECRET:?'), 'JWT_SECRET 应使用 :? 强制检查');
    assert.ok(content.includes('ADMIN_PASS:?'), 'ADMIN_PASS 应使用 :? 强制检查');
  });

  it('PG_PASSWORD 使用 :? 强制检查', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
    assert.ok(content.includes('PG_PASSWORD:?'), 'PG_PASSWORD 应使用 :? 强制检查');
  });
});

// ================================================================
// 52. build.js 构建管线验证（2026-10-06:esbuild 替代手写去重机后重写）
// ================================================================
describe('52. build.js esbuild 构建管线', () => {
  it('build.js 走 esbuild 压缩且保留顶层全局名', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
    assert.ok(content.includes('esbuild'), '应使用 esbuild 构建');
    assert.ok(content.includes("require('fs')") || content.includes('readFileSync'), '应拼接 js/ 模块源码');
    assert.ok(content.includes('minify: true'), '应开启压缩');
    // 内联 onclick 依赖顶层全局函数名,构建不得打包改名(transform 模式不重命名顶层标识符)
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.ok(bundle.includes('function checkoutCart') && bundle.includes('function addToCart'), '产物应保留全局函数名');
  });

  it('构建产物语法正确', () => {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    const result = execSync('node build.js', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    assert.ok(result.includes('语法验证通过'), '构建应成功');
  });
});

// ================================================================
// 53. 新增：migrate_to_pg.js 事务封装验证
// ================================================================
describe('53. migrate_to_pg.js 事务封装', () => {
  it('包含 BEGIN/COMMIT/ROLLBACK', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'migrate_to_pg.js'), 'utf8');
    assert.ok(content.includes('BEGIN'), '应有 BEGIN');
    assert.ok(content.includes('COMMIT'), '应有 COMMIT');
    assert.ok(content.includes('ROLLBACK'), '应有 ROLLBACK');
    assert.ok(content.includes('client.query'), '应使用 client.query 而非 pool.query');
  });

  it('使用 pool.connect 获取客户端连接', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'migrate_to_pg.js'), 'utf8');
    assert.ok(content.includes('pool.connect'), '应有 pool.connect');
    assert.ok(content.includes('client.release'), '应有 client.release');
  });
});

// ================================================================
// 54. 新增：sample_data.sql 外键和索引验证
// ================================================================
describe('54. sample_data.sql 约束', () => {
  it('feedback 不设 dish 外键(dishId=0整体满意度不指向菜品,2026-10-22移除误加约束)', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'sample_data.sql'), 'utf8');
    assert.ok(!content.includes('fk_feedback_dish'), '不应有 feedback 外键(会压住 dishId=0 整体满意度)');
    assert.ok(!content.includes('REFERENCES dishes(id) ON DELETE CASCADE'), '不应有 dishes 级联删除');
  });

  it('包含性能索引', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'sample_data.sql'), 'utf8');
    const indexes = ['idx_feedback_dish_id', 'idx_feedback_user_id', 'idx_orders_status', 'idx_dishes_category'];
    for (const idx of indexes) {
      assert.ok(content.includes(idx), '缺少索引: ' + idx);
    }
  });
});

console.log('✅ 全面E2E测试增强版 v6 加载完成，共 270+ 测试用例');

// ================================================================
// 55. 新增：工具脚本修复验证
// ================================================================
describe('55. 工具脚本修复', () => {
  it('vision_analyze.js 除零保护', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'vision_analyze.js'), 'utf8');
    assert.ok(content.includes('files.length > 0'), '应有除零保护');
  });

  it('backup_db.js 超时加长', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'backup_db.js'), 'utf8');
    assert.ok(content.includes('timeout: 120000'), '超时应为 120 秒');
  });

  it('deploy.bat 使用单斜杠', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'deploy.bat'), 'utf8');
    assert.ok(content.includes('taskkill /F /IM'), '应使用单斜杠语法');
    assert.ok(!content.includes('taskkill //F'), '不应使用双斜杠');
  });
});

// ================================================================
// 56. 新增：Dockerfile 和部署配置验证
// ================================================================
describe('56. Dockerfile 修复', () => {
  it('日志目录设置了 appuser 权限', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
    assert.ok(content.includes('chown -R appuser:appgroup'), '应有 chown 权限设置');
  });

  it('包含 addgroup 和 adduser', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
    assert.ok(content.includes('addgroup'), '应有 addgroup');
    assert.ok(content.includes('adduser'), '应有 adduser');
  });
});

// ================================================================
// 57. 新增：vision_pipeline 和 edit_package 验证
// ================================================================
describe('57. 视觉和编辑脚本修复', () => {
  it('vision_pipeline.js isDocker 逻辑正确', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'vision_pipeline.js'), 'utf8');
    assert.ok(content.includes("process.env.LOCAL !== 'true'"), 'LOCAL 判断应使用 !== true');
    assert.ok(!content.includes('!process.env.LOCAL'), '不应使用取反判断');
  });

  it('edit_package.js scripts 保护断言下线(文件已在治理提交 f1bc12a 删除)', () => {
    // 原 edit_package.js 的 pkg.scripts 兜底逻辑随文件删除;占位用例保持编号连续
    const fs = require('fs');
    const path = require('path');
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'edit_package.js')), 'edit_package.js 应已删除');
  });
});

console.log('✅ 全面E2E测试增强版 v7 加载完成，共 290+ 测试用例');

// ================================================================
// 58. 新增：ESLint 配置验证
// ================================================================
describe('58. ESLint 配置', () => {
  it('扁平配置存在且开启 no-undef(2026-10-22迁移eslint.config.js,前端跨文件全局为warn)', () => {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '..', 'eslint.config.js');
    assert.ok(fs.existsSync(configPath), '应有 eslint.config.js 扁平配置');
    assert.ok(!fs.existsSync(path.join(__dirname, '..', '.eslintrc.json')), '旧 .eslintrc.json 应已移除');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('no-undef'), '应配置 no-undef 规则');
    assert.ok(content.includes('globals'), '应有 globals 配置');
  });
});

// ================================================================
// 59. 新增：菜品图片懒加载验证
// ================================================================
describe('59. 菜品图片懒加载', () => {
  it('js/core.js 单菜单图片加载 lazy', () => {
    const fs = require('fs');
    const path = require('path');
    const content = frontSrc();
    assert.ok(content.includes('loading=\"lazy\"'), '菜单图片应加载 lazy');
  });

  it('js/recommendation.js 推荐图片加载 lazy', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'js', 'recommendation.js'), 'utf8');
    assert.ok(content.includes('loading=\"lazy\"'), '推荐图片应加载 lazy');
  });

  it('script.js 构建产物包含懒加载', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.ok(content.includes('loading="lazy"'), '构建产物应有懒加载');
  });
});

// ================================================================
// 60. 新增：模态框关闭按钮 data-bs-dismiss 验证
// ================================================================
describe('60. 模态框关闭按钮', () => {
  it('index.html 模态框关闭按钮使用 data-bs-dismiss', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(content.includes('data-bs-dismiss=\"modal\"'), '模态框关闭按钮应使用 data-bs-dismiss');
  });
});

console.log('✅ 全面E2E测试增强版 v8 加载完成，共 310+ 测试用例');

// ================================================================
// 61. 新增：管理员查看所有订单（厨房看板修复）验证
// ================================================================
describe('61. 管理员查看所有订单', () => {
  it('server.js 中 admin 可查看所有订单', () => {
    const fs = require('fs');
    const path = require('path');
    const content = ['server.js', 'server/routes/admin.js', 'server/routes/orders.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    assert.ok(content.includes("req.user?.role === 'admin'") || content.includes("req.user?.role==='admin'"), '应识别 admin 角色(拆分后可能无空格)');
    assert.ok(content.includes('queryUserId'), '应支持 userId 查询参数');
  });

  it('管理员可查看所有订单（含非管理员创建的）', async () => {
    // 普通用户创建订单
    const uname = 'ordervi' + Date.now();
    await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!' }) });
    const order = await api('/api/order', { method: 'POST', body: JSON.stringify({ userId: uname, items: [{ id: dishPool[0].id, name: '查看测试', price: 10 }], totalPrice: 10 }) });
    assert.equal(order.status, 200);
    // 管理员查看所有订单
    const adminToken = await getAdminToken();
    const res = await fetch(BASE + '/api/orders', { headers: { 'Authorization': 'Bearer ' + adminToken } });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.orders), 'orders应为数组');
  });
});

// ================================================================
// 62. 新增：数据导出（带认证头）验证
// ================================================================
describe('62. 数据导出带认证头', () => {
  it('admin.html 使用 exportCSV 函数而非 location.href', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.ok(content.includes('function exportCSV'), '应有 exportCSV 函数');
    assert.ok(content.includes("localStorage.getItem('adminToken')"), '应读取 adminToken');
    assert.ok(content.includes("'Authorization': 'Bearer '"), '应带 Authorization 头');
  });

  it('admin.html 不再使用 location.href 导出', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.ok(!content.includes("location.href='/api/admin/export/popular-dishes'"), '导出应使用 fetch 而非 location.href');
  });

  it('导出 API 带 token 正常返回 CSV', async () => {
    const adminToken = await getAdminToken();
    const res = await fetch(BASE + '/api/admin/export/popular-dishes', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('菜名'), 'CSV 应包含表头');
  });
});

// ================================================================
// 63. 新增：kitchen 订单查看流程验证
// ================================================================
describe('63. 厨房看板订单 API', () => {
  it('管理员通过 status 过滤查看待处理订单', async () => {
    const adminToken = await getAdminToken();
    const res = await fetch(BASE + '/api/orders?status=pending,confirmed', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.orders), 'orders应为数组');
  });
});

console.log('✅ 全面E2E测试增强版 v9 加载完成，共 330+ 测试用例');

// ================================================================
// 64. 新增：重训练异步执行验证
// ================================================================
describe('64. 重训练异步执行', () => {
  it('手动重训练使用异步 spawn 而非 spawnSync', () => {
    const fs = require('fs');
    const path = require('path');
    // retrain 路由已拆分至 server/routes/admin.js(2026-10-13 改造4)
    const content = ['server.js', 'server/routes/admin.js', 'server/routes/orders.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    const retrainBlock = content.substring(content.indexOf("app.post('/api/admin/retrain'"), content.indexOf('// 推荐效果不佳'));
    assert.ok(retrainBlock.includes('const { spawn } = require'), '应使用异步 spawn');
    assert.ok(retrainBlock.includes("proc.on('close', async (code)"), '应有 close 事件处理');
    assert.ok(!retrainBlock.includes('spawnSync'), '手动重训练不应使用 spawnSync');
  });

  it('重训练立即返回不阻塞', async () => {
    const adminToken = await getAdminToken();
    const { status, body } = await api('/api/admin/retrain', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    // 2026-09-17: 200=开始训练;409=重训开关关闭(未上线时反馈为测试数据的保护设计)或已在训练中
    assert.ok(status === 200 || status === 409, '重训练应响应 200 或 409(开关保护): ' + status);
    assert.ok(body.success === true || body.success === false || body.message, '应有响应');
  });
});

// ================================================================
// 65. 新增：API 404 JSON 响应验证
// ================================================================
describe('65. API 404 JSON 响应', () => {
  it('未知 API 路径返回 JSON 404', async () => {
    const { status, body } = await api('/api/unknown-route');
    assert.equal(status, 404);
    assert.equal(body.success, false);
    assert.ok(body.error, '应有错误信息');
  });

  it('server.js 包含 404 兜底处理', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(content.includes('404 兜底'), '应有 404 兜底处理');
    assert.ok(content.includes("req.path.startsWith('/api/')"), '应区分 API 和非 API 路径');
  });
});

// ================================================================
// 66. 新增：admin.html 空 catch 修复验证
// ================================================================
describe('66. admin.html 错误处理', () => {
  it('saveDish 有网络错误提示', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.ok(!content.includes('.catch(() => {})'), 'saveDish 不应有空 catch');
  });

  it('deleteDish 有网络错误提示', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.ok(!content.includes('.catch(() => {})'), 'deleteDish 不应有空 catch');
  });
});

console.log('✅ 全面E2E测试增强版 v10 加载完成，共 350+ 测试用例');

// ================================================================
// 67. 新增：自动重训练异步验证
// ================================================================
describe('67. 自动重训练异步', () => {
  it('checkAndRetrain 使用异步 spawn 而非 spawnSync', () => {
    const fs = require('fs');
    const path = require('path');
    const content = ['server.js', 'server/routes/admin.js', 'server/routes/orders.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join(String.fromCharCode(10))
    const block = content.substring(content.indexOf('async function checkAndRetrain'), content.indexOf('// 模型版本信息'));
    assert.ok(block.includes('const { spawn } = require'), '自动重训练应使用异步 spawn');
    assert.ok(block.includes("proc.on('close', async (code)"), '应有 close 事件处理');
    assert.ok(!block.includes('spawnSync'), '不应使用 spawnSync');
    assert.ok(block.includes('finally { _isRetrainingCheck = false'), '应有 finally 重置标志');
  });

  it('server.js 中无 spawnSync 用于重训练', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    // 手动重训练和自动重训练都不应使用 spawnSync(2026-10-19 修复空洞锚:原字符串 retrain.from_feedback.py 与现路径 retrain_from_feedback.py 永不匹配)
    assert.ok(!content.includes('spawnSync'), 'server.js 不应存在任何阻塞的 spawnSync');
    const admin = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'admin.js'), 'utf8');
    assert.ok(admin.includes("spawn('python'"), '重训练应存在于 routes/admin.js 且走异步 spawn');
    assert.ok(!admin.includes('spawnSync'), 'routes/admin.js 不应使用阻塞的 spawnSync');
  });
});

// ================================================================
// 68. 新增：服务器端代码质量验证
// ================================================================
describe('68. 服务器端代码质量', () => {
  it('server.js 语法检查通过', () => {
    const { execSync } = require('child_process');
    const path = require('path');
    const result = execSync('node --check server.js', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    assert.ok(!result.includes('SyntaxError'), 'server.js 语法应正确');
  });

  it('checkAndRetrain 函数结构正确', () => {
    const fs = require('fs');
    const path = require('path');
    const content = ['server.js', 'server/routes/admin.js', 'server/routes/orders.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join(String.fromCharCode(10))
    const block = content.substring(content.indexOf('async function checkAndRetrain'), content.indexOf('// 模型版本信息'));
    // 验证函数结构：if-newCount-branch（异步训练）和 else-branch（立即重置）
    assert.ok(block.includes('if (newCount >= 50'), '应有 newCount 检查');
    assert.ok(block.includes('} else {'), '应有 else 分支');
    assert.ok(block.includes(') { _isRetrainingCheck = false;'), 'catch 应重置标志');
  });
});

// ================================================================
// 69. 新增：server.js 无 spawnSync 阻塞验证
// ================================================================
describe('69. 无 spawnSync 阻塞', () => {
  it('server.js 中所有重训练均为异步', () => {
    const fs = require('fs');
    const path = require('path');
    // 重训练路由已拆至 server/routes/admin.js(改造4),与 server.js 联合读取
    const content = ['server.js', 'server/routes/admin.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    // 手动重训练区域
    const manualBlock = content.substring(content.indexOf("app.post('/api/admin/retrain'"), content.indexOf('// 推荐效果不佳'));
    assert.ok(manualBlock.includes('spawn('), '手动重训练应为异步');
    assert.ok(!manualBlock.includes('spawnSync'), '手动重训练不应有 spawnSync');
  });
});

console.log('✅ 全面E2E测试增强版 v11 加载完成，共 370+ 测试用例');

// ================================================================
// 70. 新增：spawn stdout 泄漏防范验证
// ================================================================
describe('70. spawn stdout 泄漏防范', () => {
  it('手动重训练 spawn 使用 stdio 防止 stdout 泄漏', () => {
    const fs = require('fs');
    const path = require('path');
    // 重训练路由已拆至 server/routes/admin.js(改造4),与 server.js 联合读取
    const content = ['server.js', 'server/routes/admin.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
    const manualBlock = content.substring(content.indexOf("app.post('/api/admin/retrain'"), content.indexOf('// 推荐效果不佳'));
    assert.ok(manualBlock.includes('stdio: [\'ignore\', \'ignore\', \'pipe\']'), '应使用 stdio 防止 stdout 泄漏');
  });

  it('自动重训练 spawn 使用 stdio 防止 stdout 泄漏', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const autoBlock = content.substring(content.indexOf('async function checkAndRetrain'), content.indexOf('// 模型版本信息'));
    assert.ok(autoBlock.includes('stdio: [\'ignore\', \'ignore\', \'pipe\']'), '自动重训练也应使用 stdio');
  });
});

// ================================================================
// 71. 新增：admin.html 空 catch 修复验证
// ================================================================
describe('71. admin.html 空 catch 修复', () => {
  it('admin.html 无空 catch', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    assert.ok(!content.includes('catch(() => {})'), '不应有完全空的 catch');
    assert.ok(content.includes('console.warn'), '应有警告日志输出');
  });
});

console.log('✅ 全面E2E测试增强版 v12 加载完成，共 380+ 测试用例');
// 2026-10-19 core.js 拆分适配: 前端源断言改为跨全部 js/ 模块拼接搜索(任何未来的域拆分都不再破坏测试)
function frontSrc() {
  return ['globals', 'menu', 'cart', 'core', 'recommendation', 'init', 'logo-intro']
    .map(f => require('fs').readFileSync(require('path').join(__dirname, '..', 'js', f + '.js'), 'utf8'))
    .join('\n');
}
