// 唐猫庭院 - 修复回归测试 v1
// 防止本轮修复的安全/崩溃/显示问题被回退
const assert = require('node:assert/strict');
const { describe, it, before } = require('node:test');

// 真实菜品 ID 池(2026-09-17:订单载荷不能用重播种前的幻影 ID)
var dishPool = [{ id: 2069, name: '测试菜品', price: 18 }];
before(async () => {
  try {
    var r = await fetch('http://localhost:3000/api/dishes').then(function(x) { return x.json(); });
    var list = (r && (r.dishes || r)) || [];
    if (list.length) dishPool = list.slice(0, 5).map(function(d) { return { id: d.id, name: d.name, price: parseFloat(d.price) || 18 }; });
  } catch (e) {}
});
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

async function api(p, opts = {}) {
  const { headers = {}, ...rest } = opts;
  const res = await fetch(BASE + p, { headers: { 'Content-Type': 'application/json', ...headers }, ...rest });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
async function adminToken() {
  const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
  return r.body.token || '';
}

// ================================================================
// 安全修复 - IDOR / 路径遍历
// ================================================================
describe('安全修复回归', () => {
  it('server.js 不使用客户端 userId 冒充（IDOR）', () => {
    const s = read('server.js');
    assert.ok(s.includes("const effectiveUserId = req.user?.username || 'guest';"), 'order/feedback 应使用 guest 而非客户端 userId');
    assert.ok(!s.includes("req.user?.username || userId || 'guest';"), '不应残留 userId 冒充逻辑');
  });
  it('server.js 图片删除路径校验 /uploads/ 前缀（防路径遍历删除）', () => {
    const s = read('server.js');
    assert.ok(s.includes("image_url.startsWith('/uploads/')"), '应校验 image_url 以 /uploads/ 开头');
  });
  it('IDOR 实测：未认证 POST /api/order 带 userId 不冒充', async () => {
    const r = await api('/api/order', { method: 'POST', body: JSON.stringify({ userId: 'alice_impostor_e2e', items: [{ id: dishPool[0].id, name: '测试', price: 1, type: 'x', matchRate: 0.5, qty: 1 }], totalPrice: 1 }) });
    if (r.body.success) {
      const tok = await adminToken();
      const ord = await api('/api/orders?userId=alice_impostor_e2e', { headers: { Authorization: 'Bearer ' + tok } });
      const impostorOrders = (ord.body.orders || []).filter(o => o.user_id === 'alice_impostor_e2e');
      assert.equal(impostorOrders.length, 0, 'alice_impostor_e2e 名下不应有订单（实际存为 guest）');
    }
  }, { timeout: 15000 });
});

// ================================================================
// 崩溃修复 - spawn 进程管理
// ================================================================
describe('崩溃修复回归', () => {
  it('checkAndRetrain spawn 有 stderr 消费者和 error handler', () => {
    const s = read('server.js');
    assert.ok(s.includes("proc.stderr?.on('data'"), '应有 stderr 消费者防止管道死锁');
    assert.ok(s.includes("proc.on('error', (e) =>"), '应有 error handler 防止进程崩溃');
  });
  it('server.js model-metrics 移除 spawnSync 阻塞', () => {
    const s = read('server.js');
    assert.ok(!/spawnSync\('python'/.test(s), '不应在 model-metrics 使用 spawnSync 阻塞事件循环');
  });
  it('server.js checkAndRetrain 有超时保护', () => {
    const s = read('server.js');
    assert.ok(s.includes('retrainTimeout'), '应有超时保护防止标志永久锁定');
  });
});

// ================================================================
// 显示修复 - admin stat-cards 图标
// ================================================================
describe('显示修复回归', () => {
  it('admin.html 统计卡片图标为 emoji 非占位符', () => {
    const s = read('admin.html');
    assert.ok(s.includes("icon: '📈'"), '今日推荐应有 📈 图标');
    assert.ok(s.includes("icon: '👥'"), '游客推荐应有 👥 图标');
    assert.ok(s.includes("icon: '👤'"), '用户推荐应有 👤 图标');
    assert.ok(s.includes("icon: '💬'"), '总反馈应有 💬 图标');
    assert.ok(s.includes("icon: '🍽️'"), '总菜品应有 🍽️ 图标');
    assert.ok(!s.includes("icon: '??'"), '不应残留 ?? 占位符');
    assert.ok(!s.includes("icon: '?'"), '不应残留 ? 占位符');
  });
});

// ================================================================
// 前端修复 - js/ 模块源码（2026-10-06:esbuild 压缩产物变量名会被改写,
// 源码模式断言一律读 js/ 模块;script.js 产物仅做整体冒烟）
// ================================================================
describe('前端修复回归', () => {
  it('register 使用正斜杠路径（非反斜杠）', () => {
    const s = read('js/core.js');
    assert.ok(s.includes("'/api/user/register'"), 'register 应用正斜杠路径');
    assert.ok(!s.includes("'\\api\\user\\register'"), '不应有反斜杠路径');
  });
  it('renderMenuTable 动态标签安全（白名单+转义）防存储型 XSS', () => {
    const s = read('js/core.js');
    // 模块化重构后 tags 不再整体拼接:只渲染 SUBS 白名单二级分隔(且 esc)与固定文案角标
    assert.ok(s.includes('const SUBS=['), '二级分隔应走 SUBS 白名单');
    assert.ok(s.includes('esc(sub)'), '白名单标签仍应 esc 转义');
  });
  it('checkoutCart 发送原始 name 非双重转义', () => {
    const s = read('js/core.js');
    assert.ok(s.includes('name:x.name'), '应发送原始 name');
    assert.ok(!s.includes('name:esc(x.name)'), '不应双重转义');
  });
  it('fetchRecommendations userProfile 空值保护', () => {
    const s = read('js/recommendation.js');
    assert.ok(s.includes('const up=userProfile||{}'), '应有 userProfile 空值保护');
  });
  it('localStorage setItem 有 try-catch', () => {
    const s = read('js/core.js');
    assert.ok(s.includes("try{localStorage.setItem('orderedDishes'"), 'setItem 应有 try-catch 防隐私模式崩溃');
  });
  it('fetchRecommendations 推荐池排除售罄菜（2026-10-06 回归）', () => {
    const s = read('js/recommendation.js');
    // 售罄菜不进偏好推荐池:与菜单灰化/冷启动过滤/结算拦截构成完整售罄链路
    assert.ok(s.includes('is_sold_out===true'), '推荐池应过滤 is_sold_out');
  });
  it('桌号状态卡暗色模式覆盖（2026-10-07 回归）', () => {
    const s = read('styles.css');
    // 内联浅米底 #f7efdf 在暗色下与 var(--text) 浅色文字对比不足,必须有 dark-mode 深底覆盖
    assert.ok(/html\.dark-mode #table-status-card\s*{[^}]*background:\s*#1a1a1a\s*!important/.test(s), '暗色模式应有 #table-status-card 深底覆盖');
  });
});

// ================================================================
// 后端修复 - 日志路径
// ================================================================
describe('日志路径修复回归', () => {
  it('监控 API combined 日志使用日期文件名', () => {
    const s = read('server.js');
    assert.ok(s.includes("combined-'+today+'.log"), '应使用 combined-{today}.log 而非 combined.log');
    assert.ok(!s.includes("'logs', 'combined.log'"), '不应残留无日期的 combined.log');
  });
});

// ================================================================
// API 只读回归
// ================================================================
describe('API 只读回归', () => {
  it('GET /api/dishes 返回菜品数据', async () => {
    const r = await api('/api/dishes');
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(Array.isArray(r.body.dishes));
    assert.ok(r.body.dishes.length > 0, '应有菜品数据');
    assert.ok(r.body.dishes[0].name, '菜品应有名称');
  });
  it('GET /api/model-metrics 不返回误导性假指标', async () => {
    const r = await api('/api/model-metrics');
    if (r.body.metrics && r.body.metrics.note === '基于模型实时计算') {
      assert.fail('不应返回假指标 r2:0.9713');
    }
  }, { timeout: 10000 });
  it('GET /api/worker-health 返回健康状态', async () => {
    const r = await api('/api/worker-health');
    assert.equal(r.status, 200);
  });
});
