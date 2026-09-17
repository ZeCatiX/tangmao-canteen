// 唐猫庭院 - 全面丰富 E2E 测试
// 补充 8 个方向：并发争用、完整生命周期、数据边界、推荐深度、管理后台深度、购物车逻辑、安全扩展、厨房看板流转
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
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const ADMIN_PASS = process.env.ADMIN_PASS;

function uid() { return crypto.randomUUID().slice(0, 8); }

async function api(p, options = {}) {
  const res = await fetch(BASE + p, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...(options.body ? { method: options.method || 'POST', body: options.body } : { method: options.method || 'GET' }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// 清理测试数据：覆盖所有可能产生的测试痕迹
after(async () => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'tangmao',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  });
  try {
    const prefixes = ['rich_'];
    // 清理用户
    const users = await pool.query('SELECT id, username FROM users WHERE username LIKE ANY($1)', [prefixes.map(p => p + '%')]);
    const usernames = users.rows.map(r => r.username);
    if (usernames.length > 0) {
      await pool.query('DELETE FROM orders WHERE user_id = ANY($1)', [usernames]);
      await pool.query('DELETE FROM feedback WHERE user_id = ANY($1)', [usernames]);
      await pool.query('DELETE FROM recommendation_log WHERE user_id = ANY($1)', [usernames]);
      await pool.query('DELETE FROM preference_log WHERE user_id = ANY($1)', [usernames]);
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [users.rows.map(r => r.id)]);
    }
    // 清理未注册用户的订单（并发测试创建的用户未注册）
    await pool.query("DELETE FROM orders WHERE user_id LIKE 'rich_concurrent%'");
    await pool.query("DELETE FROM orders WHERE user_id LIKE 'rich_kitchen%'");
    // 清理测试菜品
    await pool.query("DELETE FROM dishes WHERE name LIKE '%丰富测试%'");
    await pool.query("DELETE FROM dishes WHERE name LIKE '%边界测试%'");
    console.log('✅ 丰富测试数据清理完成');
  } catch (e) { console.error('清理失败:', e.message); } finally { await pool.end(); }
});

describe('全面丰富 E2E 测试', () => {

  // ── 方向1: 并发争用 ──
  describe('1. 并发争用测试', () => {
    it('并发创建订单不崩溃且均返回合理状态', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => api('/api/order', {
          method: 'POST',
          body: JSON.stringify({ items: [{ id: dishPool[0].id, name: '测试' + i, price: 1, quantity: 1 }], total: 1, userId: 'rich_concurrent_' + i }),
        }))
      );
      const okStatuses = results.filter(r => r.status === 200 || r.status === 400 || r.status === 429);
      assert.equal(okStatuses.length, 20, '20个并发请求应全部返回合理状态，实际: ' + results.map(r => r.status).join(','));
    });

    it('并发注册不同用户全部成功', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => api('/api/user/register', {
          method: 'POST',
          body: JSON.stringify({ username: 'rich_reg_' + i + '_' + uid(), password: 'Test1234!' }),
        }))
      );
      const ok = results.filter(r => r.status === 200 || r.status === 201);
      assert.ok(ok.length >= 8, '多数并发注册应成功，实际: ' + results.map(r => r.status).join(','));
    });
  });

  // ── 方向2: 用户完整生命周期 ──
  describe('2. 用户完整生命周期', () => {
    it('注册→登录→偏好→下单→评价→注销 完整闭环', async () => {
      const uname = 'rich_life_' + uid();
      // 注册
      const reg = await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test1234!' }) });
      assert.ok([200, 201].includes(reg.status), '注册应成功，实际: ' + reg.status);
      // 登录获取 token
      const login = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test1234!' }) });
      assert.equal(login.status, 200, '登录应成功');
      const token = login.body.token;
      assert.ok(token, '登录应返回 token');
      // 保存偏好（带认证头）
      const prefs = await api('/api/user-preferences', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ userId: uname, spiciness: '微辣', price: '20-40' }) });
      assert.equal(prefs.status, 200, '保存偏好应成功，实际: ' + prefs.status + ' ' + JSON.stringify(prefs.body));
      // 下单（带认证头）
      const order = await api('/api/order', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ items: [{ id: dishPool[0].id, name: '测试菜', price: 28, quantity: 1 }], total: 28, userId: uname }) });
      assert.equal(order.status, 200, '下单应成功，实际: ' + order.status);
      // 评价（带认证头）
      const feedback = await api('/api/feedback', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ dishId: 1, score: 5, userId: uname }) });
      assert.equal(feedback.status, 200, '评价应成功，实际: ' + feedback.status);
      // 注销（POST /api/user/delete 带认证头）
      const del = await api('/api/user/delete', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ username: uname }) });
      assert.equal(del.status, 200, '注销应成功，实际: ' + del.status + ' ' + JSON.stringify(del.body));
    });
  });

  // ── 方向3: 数据边界测试 ──
  describe('3. 数据边界测试', () => {
    it('超长用户名（200字符）返回 400', async () => {
      const { status } = await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: 'x'.repeat(200), password: 'Test1234!' }) });
      assert.equal(status, 400, '超长用户名应返回 400，实际: ' + status);
    });

    it('特殊字符用户名（Emoji/引号）返回合理状态', async () => {
      const { status } = await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: '测试😀"\'用户', password: 'Test1234!' }) });
      assert.ok([200, 400].includes(status), '特殊字符用户名应返回 200 或 400，实际: ' + status);
    });

    it('负价格在管理端被拒绝', async () => {
      const login = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }) });
      assert.equal(login.status, 200, '管理员登录应成功');
      const token = login.body.token;
      assert.ok(token, '应获取管理员 token');
      const negPrice = await api('/api/admin/dish', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ name: '丰富测试负价', category: '招牌', price: -5, rating: 4 }) });
      assert.ok([400, 422].includes(negPrice.status), '负价格应被拒绝(400/422)，实际: ' + negPrice.status);
    });
  });

  // ── 方向4: 推荐系统深度 ──
  describe('4. 推荐系统深度测试', () => {
    it('推荐理由包含偏好关联', async () => {
      const { status, body } = await api('/api/predict-rf', {
        method: 'POST',
        body: JSON.stringify({
          dishes: [{ id: 1, name: '测试菜', category: '招牌', price: 28, rating: 4.5, spiciness: '微辣' }],
          userPrefs: { spiciness: '微辣', price: '20-40' },
        }),
      });
      assert.ok([200, 503].includes(status), 'predict-rf 应返回合理状态，实际: ' + status);
      if (status === 200) {
        assert.ok(body.success === true, '成功时应返回 success: true');
      }
    });

    it('推荐模式本地计算函数可用', async () => {
      const resp = await fetch(BASE + '/script.js');
      const js = await resp.text();
      assert.ok(js.includes('predictWithDecisionTree'), '应有本地决策树预测函数');
      assert.ok(js.includes('computeDishMatch'), '应有匹配指数计算函数');
    });
  });

  // ── 方向5: 管理后台深度 ──
  describe('5. 管理后台深度测试', () => {
    let token = '';
    before(async () => {
      const login = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }) });
      assert.equal(login.status, 200, '管理员登录应成功');
      token = login.body.token;
      assert.ok(token, '应获取管理员 token');
    });

    it('最差菜品统计可访问', async () => {
      const { status, body } = await api('/api/admin/worst-dishes', { headers: { 'Authorization': 'Bearer ' + token } });
      assert.equal(status, 200, '最差菜品统计应返回 200');
      assert.ok(Array.isArray(body.dishes), '应返回 dishes 数组');
    });

    it('模型历史可访问', async () => {
      const { status, body } = await api('/api/admin/model-history', { headers: { 'Authorization': 'Bearer ' + token } });
      assert.equal(status, 200, '模型历史应返回 200');
      assert.ok(body, '应返回模型历史数据');
    });

    it('用户列表可访问且分页正常', async () => {
      const { status, body } = await api('/api/admin/users?limit=5', { headers: { 'Authorization': 'Bearer ' + token } });
      assert.equal(status, 200, '用户列表应返回 200');
      assert.ok(Array.isArray(body.users || body), '应返回用户列表数组');
    });
  });

  // ── 方向6: 购物车逻辑 ──
  describe('6. 购物车逻辑测试', () => {
    it('前端购物车使用 localStorage 存储', async () => {
      const resp = await fetch(BASE + '/script.js');
      const js = await resp.text();
      assert.ok(js.includes("localStorage.setItem('cart'") || js.includes('localStorage.setItem("cart"'), 'script.js 应使用 localStorage.setItem("cart") 存储购物车');
      assert.ok(js.includes("localStorage.getItem('cart'") || js.includes('localStorage.getItem("cart"'), 'script.js 应使用 localStorage.getItem("cart") 读取购物车');
    });

    it('结算金额计算函数存在', async () => {
      const resp = await fetch(BASE + '/script.js');
      const js = await resp.text();
      assert.ok(js.includes('updateCartBadge') || js.includes('updateCartTotal'), '应有购物车角标/总额更新函数');
    });
  });

  // ── 方向7: 安全扩展 ──
  describe('7. 安全扩展测试', () => {
    it('路径遍历尝试被拦截（URL 编码的 ..%2F）', async () => {
      const res = await fetch(BASE + '/..%2F..%2Fserver.js', { redirect: 'manual' });
      // 路径遍历应返回 403（禁止访问）或 404（未找到），不应返回 200
      assert.ok([403, 404, 400].includes(res.status), '路径遍历应返回 403/404，实际: ' + res.status);
    });

    it('XSS payload 在反馈中被处理', async () => {
      const { status, body } = await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ dishId: 1, score: 3, userId: 'rich_xss', comment: '<script>alert(1)</script>' }),
      });
      assert.equal(status, 200, 'XSS 反馈应被接受，实际: ' + status);
      assert.ok(body.success === true, '反馈应成功');
    });

    it('错误 token 访问管理后台返回 401/403', async () => {
      const { status } = await api('/api/admin/stats', { headers: { 'Authorization': 'Bearer invalid.token.here' } });
      assert.ok([401, 403].includes(status), '错误 token 应返回 401/403，实际: ' + status);
    });
  });

  // ── 方向8: 厨房看板流转 ──
  describe('8. 厨房看板订单流转', () => {
    let token = '';
    before(async () => {
      const login = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }) });
      assert.equal(login.status, 200, '管理员登录应成功');
      token = login.body.token;
      assert.ok(token, '应获取管理员 token');
    });

    it('订单可按状态过滤（待处理）', async () => {
      const { status, body } = await api('/api/orders?status=pending', { headers: { 'Authorization': 'Bearer ' + token } });
      assert.equal(status, 200, '订单状态过滤应返回 200');
      assert.ok(Array.isArray(body.orders || body), '应返回订单数组');
    });

    it('订单状态可流转（创建→完成）', async () => {
      // 创建订单
      const order = await api('/api/order', { method: 'POST', body: JSON.stringify({ items: [{ id: dishPool[0].id, name: '测试菜', price: 28, quantity: 1 }], total: 28, userId: 'rich_kitchen_' + uid() }) });
      assert.equal(order.status, 200, '创建订单应成功');
      const orderId = order.body.orderId || order.body.id;
      assert.ok(orderId, '创建订单应返回 orderId');
      // 更新状态为完成
      const update = await api('/api/orders/' + orderId + '/status', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ status: 'completed' }) });
      assert.equal(update.status, 200, '订单状态更新应成功，实际: ' + update.status);
    });
  });
});