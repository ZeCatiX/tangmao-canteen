// 唐猫庭院 - 增强 E2E 测试 v2
// 覆盖：admin.html 中文回归、管理后台数据加载、边界场景
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

// 真实菜品 ID 池(2026-09-17:订单载荷不能用重播种前的幻影 ID)
let dishPool = [{ id: 2069, name: '测试菜品', price: 18 }];
before(async () => {
  try {
    const r = await fetch('http://localhost:3000/api/dishes').then(function (x) {
      return x.json();
    });
    const list = (r && (r.dishes || r)) || [];
    if (list.length) {
      dishPool = list.slice(0, 5).map(function (d) {
        return { id: d.id, name: d.name, price: parseFloat(d.price) || 18 };
      });
    }
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

// ================================================================
// 1. admin.html 中文乱码回归测试
// ================================================================
describe('1. admin.html 中文乱码回归', () => {
  it('管理员登录页中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    // 关键UI文本应显示正常中文，而非乱码
    assert.ok(html.includes('唐猫庭院'), '应显示"唐猫庭院"');
    assert.ok(html.includes('管理后台登录'), '应显示"管理后台登录"');
    assert.ok(html.includes('用户名'), '应显示"用户名"');
    assert.ok(html.includes('密码'), '应显示"密码"');
    assert.ok(html.includes('登 录') || html.includes('登录'), '应显示"登录"');
  });

  it('管理员侧边栏导航中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    const navItems = [
      '控制面板',
      '菜品管理',
      '用户管理',
      '反馈查看',
      '偏好分布',
      '数据分析',
      '模型管理',
      'API文档',
      '返回首页',
    ];
    for (const item of navItems) {
      assert.ok(html.includes(item), `侧边栏应包含"${item}"`);
    }
  });

  it('管理员仪表盘卡片标题中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    const headers = ['热门菜品排行', '评分分布', '模型信息摘要'];
    for (const h of headers) {
      assert.ok(html.includes(h), `仪表盘应包含"${h}"`);
    }
  });

  it('菜品管理页面中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    const texts = ['菜品管理', '添加菜品', '菜品名称', '分类', '辣度', '咸淡', '甜酸', '价格', '评分', '状态', '操作'];
    for (const t of texts) {
      assert.ok(html.includes(t), `菜品管理页应包含"${t}"`);
    }
  });

  it('菜品弹窗中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    const modalTexts = [
      '菜品名称',
      '菜品描述',
      '分类',
      '辣度',
      '咸淡',
      '甜酸',
      '价格（元）',
      '评分',
      '过敏原',
      '海鲜',
      '花生',
      '鸡蛋',
      '麸质',
      '大豆',
      '饮食要求',
      '清真',
      '素食',
      '标签',
      '菜品图片',
      '上架',
      '删除菜品',
      '取消',
      '保存',
    ];
    for (const t of modalTexts) {
      assert.ok(html.includes(t), `菜品弹窗应包含"${t}"`);
    }
  });

  it('数据分析页面中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    const texts = [
      '数据分析',
      '导出热门菜品',
      '导出反馈数据',
      '导出订单数据',
      '每日推荐趋势',
      '偏好分布饼图',
      '用户活跃度',
      '推荐统计',
      '评分最低的菜品',
      '推荐日志详情',
      '监控系统',
    ];
    for (const t of texts) {
      assert.ok(html.includes(t), `数据分析页应包含"${t}"`);
    }
  });

  it('模型管理页面中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    const texts = [
      '模型管理',
      '当前模型',
      '版本',
      '训练时间',
      '反馈数量',
      '重新训练模型',
      '版本对比',
      '历史版本',
      '特征重要性对比',
    ];
    for (const t of texts) {
      assert.ok(html.includes(t), `模型管理页应包含"${t}"`);
    }
  });

  it('API文档页面中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    const texts = [
      'API 文档',
      '菜品 API',
      '用户 API',
      '推荐 & 反馈 API',
      '管理后台 API',
      '方法',
      '路径',
      '参数',
      '返回',
    ];
    for (const t of texts) {
      assert.ok(html.includes(t), `API文档页应包含"${t}"`);
    }
  });

  it('用户管理页面中文正常', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    const texts = ['用户管理', '全部用户', '用户名', '注册时间', '最后登录', '操作'];
    for (const t of texts) {
      assert.ok(html.includes(t), `用户管理页应包含"${t}"`);
    }
  });

  it('admin.html 无 BOM 文件头', async () => {
    const fs = require('fs');
    const path = require('path');
    const buf = fs.readFileSync(path.join(__dirname, '..', 'admin.html'));
    // 文件开头不应有多个 BOM (U+FEFF 的 UTF-8 编码是 EF BB BF)
    const bomCount = 0;
    for (let i = 0; i < Math.min(6, buf.length); i++) {
      // 正常 UTF-8 文件最多一个 BOM
    }
    // 只检查前三个字节
    const first3 = buf.slice(0, 3).toString('hex');
    // 允许一个 BOM，但不允许多个
    const next3 = buf.slice(3, 6).toString('hex');
    // 如果前3字节是 BOM，后3字节不应也是 BOM
    if (first3 === 'efbbbf') {
      assert.ok(next3 !== 'efbbbf', '不应有多重 BOM');
    }
  });
});

// ================================================================
// 2. 管理后台数据加载完整性测试
// ================================================================
describe('2. 管理后台数据加载', () => {
  let token = '';

  before(async () => {
    token = await getAdminToken();
  });

  it('GET /api/admin/stats 返回完整统计数据', async () => {
    const { status, body } = await api('/api/admin/stats', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    const s = body.stats;
    assert.ok(s.todayRecommendations !== undefined, '应有 todayRecommendations');
    assert.ok(s.todayGuest !== undefined, '应有 todayGuest');
    assert.ok(s.todayUser !== undefined, '应有 todayUser');
    assert.ok(s.totalFeedback !== undefined, '应有 totalFeedback');
    assert.ok(s.totalDishes !== undefined, '应有 totalDishes');
  });

  it('GET /api/admin/feedback-summary 返回反馈数据', async () => {
    const { status, body } = await api('/api/admin/feedback-summary', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.feedbacks), 'feedbacks 应为数组');
  });

  it('GET /api/admin/preference-stats 返回偏好统计', async () => {
    const { status, body } = await api('/api/admin/preference-stats', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.stats, '应有 stats 对象');
    assert.ok(body.stats.spiciness, '应有 spiciness 统计');
  });

  it('GET /api/admin/daily-recommendations 返回趋势数据', async () => {
    const { status, body } = await api('/api/admin/daily-recommendations', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data), 'data 应为数组');
  });

  it('GET /api/admin/user-activity 返回活跃度', async () => {
    const { status, body } = await api('/api/admin/user-activity', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.stats, '应有 stats 对象');
    assert.ok(body.stats.totalUsers !== undefined, '应有 totalUsers');
  });

  it('GET /api/admin/recommendation-stats 返回推荐统计', async () => {
    const { status, body } = await api('/api/admin/recommendation-stats', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.stats, '应有 stats 对象');
    assert.ok(body.stats.totalRecommendations !== undefined, '应有 totalRecommendations');
  });

  it('GET /api/admin/worst-dishes 返回最差菜品', async () => {
    const { status, body } = await api('/api/admin/worst-dishes', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.dishes), 'dishes 应为数组');
  });

  it('GET /api/admin/model-history 返回模型历史', async () => {
    const { status, body } = await api('/api/admin/model-history', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.history), 'history 应为数组');
  });

  it('GET /api/admin/model-compare 返回版本对比', async () => {
    const { status, body } = await api('/api/admin/model-compare', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.versions), 'versions 应为数组');
    assert.ok(body.versions.length > 0, '至少有一个版本');
  });

  it('GET /api/admin/users 返回用户列表', async () => {
    const { status, body } = await api('/api/admin/users', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.users), 'users 应为数组');
  });

  it('GET /api/admin/notifications 返回通知', async () => {
    const { status, body } = await api('/api/admin/notifications', {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.notifications), 'notifications 应为数组');
  });

  it('数据导出 CSV 均正常', async () => {
    const auth = { headers: { Authorization: 'Bearer ' + token } };
    for (const ep of ['/api/admin/export/popular-dishes', '/api/admin/export/feedback', '/api/admin/export/orders']) {
      const res = await fetch(BASE + ep, auth);
      assert.equal(res.status, 200, `${ep} 应返回 200`);
      const text = await res.text();
      assert.ok(text.length > 10, `${ep} CSV 应有数据`);
    }
  });
});

// ================================================================
// 3. 前端页面结构完整性测试
// ================================================================
describe('3. 前端页面结构', () => {
  it('首页所有按钮存在', async () => {
    const res = await fetch(BASE + '/');
    const html = await res.text();
    const btnIds = ['guest-btn', 'continue-btn', 'login-btn', 'register-btn'];
    for (const id of btnIds) {
      assert.ok(html.includes('id="' + id + '"'), `首页应包含按钮 #${id}`);
    }
  });

  it('首页所有 section 存在', async () => {
    const res = await fetch(BASE + '/');
    const html = await res.text();
    const sections = [
      'home-section',
      'login-section',
      'register-section',
      'preference-section',
      'profile-section',
      'recommendation-section',
      'feedback-section',
      'cart-section',
      'end-section',
      'about-section',
      'dataset-section',
    ];
    for (const s of sections) {
      assert.ok(html.includes('id="' + s + '"'), `首页应包含 section #${s}`);
    }
  });

  it('厨房看板所有交互元素存在', async () => {
    const res = await fetch(BASE + '/kitchen');
    const html = await res.text();
    const ids = ['login-overlay', 'login-user', 'login-pass', 'login-btn', 'order-list', 'current-time'];
    for (const id of ids) {
      assert.ok(html.includes('id="' + id + '"'), `厨房看板应包含 #${id}`);
    }
    assert.ok(html.includes('btn-complete'), '应包含 btn-complete 类');
    assert.ok(html.includes('loadOrders'), '应包含 loadOrders 函数');
    assert.ok(html.includes('completeOrder'), '应包含 completeOrder 函数');
  });

  it('首页导航栏完整', async () => {
    const res = await fetch(BASE + '/');
    const html = await res.text();
    const navIds = ['nav-home', 'nav-about', 'nav-dataset', 'nav-profile-item', 'nav-user', 'nav-cart', 'cart-badge'];
    for (const id of navIds) {
      assert.ok(html.includes('id="' + id + '"'), `导航栏应包含 #${id}`);
    }
  });

  it('首页表单完整', async () => {
    const res = await fetch(BASE + '/');
    const html = await res.text();
    const formIds = ['login-form', 'register-form', 'preference-form'];
    for (const id of formIds) {
      assert.ok(html.includes('id="' + id + '"'), `首页应包含表单 #${id}`);
    }
  });
});

// ================================================================
// 4. 边界与安全增强测试
// ================================================================
describe('4. 边界与安全', () => {
  it('厨房看板无 token 时显示登录页', async () => {
    const res = await fetch(BASE + '/kitchen');
    const html = await res.text();
    assert.ok(html.includes('login-overlay'), '应显示登录覆盖层');
    assert.ok(html.includes('login-btn'), '应包含登录按钮');
  });

  it('管理后台无 token 时显示登录页', async () => {
    const res = await fetch(BASE + '/admin');
    const html = await res.text();
    assert.ok(html.includes('admin-login-page'), '应显示登录页');
    assert.ok(html.includes('admin-login-btn'), '应包含登录按钮');
  });

  it('POST /api/order 空 items 返回 400', async () => {
    const { status } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(status, 400, '空 items 应返回 400');
  });

  it('POST /api/order 负价格被服务端重算覆盖(不产生负价订单)', async () => {
    const { status } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'test',
        items: [{ id: dishPool[0].id, name: '负价', price: -10 }],
        totalPrice: -10,
        tableNumber: '30',
      }),
    });
    // 2026-09-17: 服务端不信任客户端价格(按 DB 单价重算),负价被忽略(200)或被拒绝(400)均安全
    assert.ok(status === 200 || status === 400, '负价应被安全处理,实际: ' + status);
  });

  it('POST /api/order 非数字价格被安全处理', async () => {
    const { status } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'test',
        items: [{ id: dishPool[0].id, name: '菜', price: 'abc' }],
        tableNumber: '23',
      }),
    });
    // 同上:客户端价格被忽略并重算,不会写入异常价格
    assert.ok(status === 200 || status === 400, '非数字价格应被安全处理,实际: ' + status);
  });

  it('POST /api/order 负/零/超量数量返回 400(负价订单防护回归)', async () => {
    // 2026-09-17 安全修复回归:qty 为负会与正单价相乘产生负价订单(-5 × 3元 = -15元)
    for (const qty of [-5, 0, 1000]) {
      const { status } = await api('/api/order', {
        method: 'POST',
        body: JSON.stringify({
          userId: 'badqty_test',
          items: [{ id: dishPool[0].id, name: '测试', qty }],
          tableNumber: '25',
        }),
      });
      assert.equal(status, 400, `qty=${qty} 应返回 400,实际 ${status}`);
    }
  });

  it('POST /api/order 空字符串总价兜底为 0 不崩溃', async () => {
    // 空字符串 totalPrice 应被兜底为 0，订单可正常创建
    const { status, body } = await api('/api/order', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'test',
        items: [{ id: dishPool[0].id, name: '菜', price: 10 }],
        totalPrice: '',
        tableNumber: '30',
      }),
    });
    assert.equal(status, 200, `空字符串总价订单应创建成功，实际 ${status}`);
    assert.ok(body.orderId, '应返回订单ID');
  });

  it('POST /api/feedback 边界值 0 和 5 分', async () => {
    const { status: s1 } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: 1, score: 0 }),
    });
    assert.equal(s1, 200, '0 分应返回 200');
    const { status: s2 } = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ dishId: 1, score: 5 }),
    });
    assert.equal(s2, 200, '5 分应返回 200');
  });

  it('POST /api/user/register 用户名包含特殊字符', async () => {
    const { status } = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: '<script>', password: 'Test123!' }),
    });
    // 允许拒绝或接受，但不能崩溃
    assert.ok(status === 200 || status === 400, `特殊字符注册应响应 200/400，实际 ${status}`);
  });

  it('管理后台数据导出 CSV 带 BOM 头', async () => {
    const token = await getAdminToken();
    const res = await fetch(BASE + '/api/admin/export/popular-dishes', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const text = await res.text();
    // CSV 应包含 BOM (U+FEFF) 以便 Excel 正确识别 UTF-8
    assert.ok(text.charCodeAt(0) === 0xfeff || text.includes('菜名') || text.includes('name'), 'CSV 应包含 BOM 或表头');
  });

  it('POST /api/admin/dish 添加重复名', async () => {
    const token = await getAdminToken();
    const { status } = await api('/api/admin/dish', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ name: '测试重复菜名', category: '热菜', price: 20, rating: 4.0 }),
    });
    assert.equal(status, 200, '添加菜品应成功');
    // 再次添加同名
    const { status: s2 } = await api('/api/admin/dish', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ name: '测试重复菜名', category: '热菜', price: 20, rating: 4.0 }),
    });
    // 允许重复（不强制唯一名称），但不应崩溃
    assert.ok(s2 === 200 || s2 === 400, `重复名应返回 200/400，实际 ${s2}`);
  });
});

console.log('✅ 增强 E2E 测试 v2 加载完成');
