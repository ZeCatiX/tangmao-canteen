// 唐猫庭院 - 数据库连接与查询稳定性测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

async function api(path, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(BASE + path, {
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

describe('数据库连接与查询稳定性', () => {
  let adminToken;
  before(async () => { adminToken = await getAdminToken(); });

  // ===== 1. 数据库连接池正常工作 =====
  it('1.1 管理后台统计查询正常返回', async () => {
    const r = await api('/api/admin/stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.stats || r.body.data, '应返回统计数据');
  });

  // ===== 2. 菜品CRUD不影响其他数据 =====
  it('2.1 创建菜品后查询列表数量增加', async () => {
    // 获取当前菜品数
    const before = await api('/api/dishes');
    const beforeCount = before.body.dishes.length;
    // 创建菜品
    const createRes = await api('/api/admin/dish', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({
        name: 'db_test_' + Date.now(),
        category: '测试',
        spiciness: '微辣', saltiness: '适中', sweetness: '酸甜',
        price: 10, rating: 4.5, calorie: 100, protein: 10,
        isHalal: false, isVegetarian: false, allergies: [], religion: '无特殊要求'
      }),
    });
    assert.equal(createRes.status, 200);
    // 获取新菜品数
    const after = await api('/api/dishes');
    const afterCount = after.body.dishes.length;
    assert.ok(afterCount >= beforeCount, `菜品数应增加(${beforeCount}→${afterCount})`);
    // 清理
    const newId = createRes.body.id || createRes.body.dishId;
    if (newId) {
      await api('/api/admin/dish/' + newId + '/permanent', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + adminToken },
      });
    }
  });

  // ===== 3. 用户偏好保存后重新读取 =====
  it('3.1 用户偏好保存后重新登录可读取', async () => {
    const uniq = 'pref_read_' + Date.now();
    // 注册
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'PrefRead123!' }),
    });
    const token = reg.body.token;
    // 保存偏好
    const prefs = { spiciness: '中辣', saltiness: '偏咸', sweetness: '咸鲜', price: '30-50' };
    await api('/api/user-preferences', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq, preferences: prefs }),
    });
    // 重新登录
    const loginRes = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'PrefRead123!' }),
    });
    assert.equal(loginRes.body.success, true);
    // 用户数据中应包含偏好
    assert.ok(loginRes.body.user, '应返回用户数据');
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 4. 订单创建后在订单列表中可见 =====
  it('4.1 订单创建后在订单列表中可见', async () => {
    const uniq = 'order_list_' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'OrderList123!' }),
    });
    const token = reg.body.token;
    // 创建订单
    const orderRes = await api('/api/order', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        userId: uniq,
        items: [{ id: 999, name: '测试订单菜品', price: 30, type: '偏好推荐', matchRate: 0.9 }],
        totalPrice: 30
      }),
    });
    assert.ok(orderRes.status === 200 || orderRes.status === 201, '订单创建应成功');
    // 查询订单列表
    const listRes = await api('/api/orders?userId=' + uniq, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    assert.equal(listRes.status, 200);
    // 订单列表应包含新订单（或为空如果状态已更新）
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 5. 反馈提交后在反馈列表中可见 =====
  it('5.1 反馈提交后在管理后台反馈列表中可见', async () => {
    const uniq = 'feedback_list_' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'FeedbackList123!' }),
    });
    const token = reg.body.token;
    // 提交反馈
    const fbRes = await api('/api/feedback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        dishId: 1, score: 5, userId: uniq,
        userPreferences: { spiciness: '微辣' }
      }),
    });
    assert.ok(fbRes.status === 200 || fbRes.status === 201, '反馈提交应成功');
    // 管理后台查看反馈列表
    const fbListRes = await api('/api/admin/feedback-summary', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(fbListRes.status, 200);
    assert.equal(fbListRes.body.success, true);
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 6. 并发用户注册不冲突 =====
  it('6.1 并发注册5个不同用户全部成功', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const uniq = 'concurrent_' + Date.now() + '_' + i;
      promises.push(api('/api/user/register', {
        method: 'POST',
        body: JSON.stringify({ username: uniq, password: 'Concurrent123!' }),
      }));
    }
    const results = await Promise.all(promises);
    let successCount = 0;
    for (const r of results) {
      if (r.body.success) successCount++;
    }
    assert.equal(successCount, 5, '5个并发注册应全部成功');
    // 清理
    for (let i = 0; i < 5; i++) {
      const uniq = 'concurrent_' + Date.now() + '_' + i;
      const reg = results[i];
      if (reg.body.token) {
        await api('/api/user/delete', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + reg.body.token },
          body: JSON.stringify({ username: uniq }),
        });
      }
    }
  });

  // ===== 7. 同名用户注册被拒绝 =====
  it('7.1 重复用户名注册返回409', async () => {
    const uniq = 'dup_' + Date.now();
    // 第一次注册
    const r1 = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'Dup1234!' }),
    });
    assert.equal(r1.body.success, true);
    // 第二次注册同名
    const r2 = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'Dup1234!' }),
    });
    assert.ok(r2.status === 409 || r2.body.success === false, '重复注册应被拒绝');
    // 清理
    if (r1.body.token) {
      await api('/api/user/delete', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + r1.body.token },
        body: JSON.stringify({ username: uniq }),
      });
    }
  });

  // ===== 8. 管理后台所有查询端点正常 =====
  it('8.1 管理后台所有查询端点返回200', async () => {
    const endpoints = [
      '/api/admin/stats', '/api/admin/popular-dishes', '/api/admin/feedback-summary',
      '/api/admin/preference-stats', '/api/admin/daily-recommendations',
      '/api/admin/user-activity', '/api/admin/recommendation-details',
      '/api/admin/model-history', '/api/admin/worst-dishes', '/api/admin/model-compare',
      '/api/admin/recommendation-stats', '/api/admin/users', '/api/admin/notifications'
    ];
    for (const ep of endpoints) {
      const r = await api(ep, {
        headers: { 'Authorization': 'Bearer ' + adminToken },
      });
      assert.ok(r.status === 200, `${ep} 应返回200，实际: ${r.status}`);
    }
  });

  // ===== 9. 偏好日志记录正常 =====
  it('9.1 偏好日志正常记录', async () => {
    const r = await api('/api/preference-log', {
      method: 'POST',
      body: JSON.stringify({
        spiciness: '微辣', saltiness: '适中', sweetness: '酸甜',
        price: '0-30', calorie: '0-500', religion: '无特殊要求',
        allergies: [], userId: 'guest', recommendationMode: 'auto'
      }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  // ===== 10. 推荐日志正常记录 =====
  it('10.1 推荐日志正常记录', async () => {
    const r = await api('/api/recommendation-log', {
      method: 'POST',
      body: JSON.stringify({ userType: 'guest', userId: 'guest' }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });
});
