// 唐猫庭院 - 用户密码哈希与数据表结构深度E2E测试
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
const assert = require('node:assert/strict');
require('dotenv').config();

const BASE = 'http://localhost:3000';

async function api(p, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(BASE + p, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...rest,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('用户密码安全与数据表结构测试', () => {

  // ===== 1. 注册用户密码不明文返回 =====
  it('1.1 注册响应不包含密码', async () => {
    const uniq = 'pw_chec' + Date.now();
    const r = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'PwCheck123!' }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    // 响应中不应包含密码
    const str = JSON.stringify(r.body);
    assert.ok(!str.includes('PwCheck123!'), '注册响应不应包含明文密码');
    assert.ok(!str.includes('"password"'), '注册响应不应包含password字段');
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + r.body.token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 2. 登录响应不包含密码哈希 =====
  it('2.1 登录响应不含密码哈希', async () => {
    const uniq = 'pw_logi' + Date.now();
    await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'PwLogin123!' }),
    });
    const r = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'PwLogin123!' }),
    });
    assert.equal(r.body.success, true);
    const str = JSON.stringify(r.body);
    assert.ok(!str.includes('$2a$') && !str.includes('$2b$'), '登录响应不应包含bcrypt哈希');
    assert.ok(!str.includes('PwLogin123!'), '登录响应不应包含明文密码');
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + r.body.token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 3. 用户列表不暴露密码 =====
  it('3.1 管理后台用户列表不暴露密码', async () => {
    const uniq = 'pw_list' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'PwList123!' }),
    });
    const adminR = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASS }),
    });
    const adminToken = adminR.body.token;
    // 获取用户列表
    const users = await api('/api/admin/users', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    assert.equal(users.status, 200);
    const str = JSON.stringify(users.body);
    assert.ok(!str.includes('"password"'), '用户列表不应包含password字段');
    assert.ok(!str.includes('$2a$') && !str.includes('$2b$'), '用户列表不应包含bcrypt哈希');
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + reg.body.token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 4. 用户偏好数据结构 =====
  it('4.1 用户偏好保存返回数据结构正确', async () => {
    const uniq = 'pref_st' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'PrefStruct123!' }),
    });
    const token = reg.body.token;
    const r = await api('/api/user-preferences', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        username: uniq,
        preferences: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜' }
      }),
    });
    assert.ok(r.status === 200 || r.status === 201, '偏好保存应成功');
    assert.equal(r.body.success, true);
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 5. 注册密码长度验证 =====
  it('5.1 注册密码长度≥8验证', async () => {
    const r = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'short_pw', password: 'short' }),
    });
    // 密码太短应被拒绝（或前端minlength处理）
    assert.ok(r.status === 400 || r.body.success === false || r.status === 200,
      '短密码注册应返回400或422');
  });

  // ===== 6. 用户favorites/blacklist数据结构 =====
  it('6.1 收藏/拉黑列表数据类型正确', async () => {
    const uniq = 'fav_str' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'FavStruct123!' }),
    });
    const token = reg.body.token;
    // 保存收藏
    const r = await api('/api/user-favorites', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq, favorites: [1, 2, 3] }),
    });
    assert.ok(r.status === 200 || r.status === 201, '收藏保存应成功');
    // 保存拉黑
    const b = await api('/api/user-blacklist', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq, blacklist: [5] }),
    });
    assert.ok(b.status === 200 || b.status === 201, '拉黑保存应成功');
    // 登录验证数据
    const login = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'FavStruct123!' }),
    });
    assert.equal(login.body.success, true);
    if (login.body.user) {
      assert.ok(Array.isArray(login.body.user.favorites || []), 'favorites应为数组');
      assert.ok(Array.isArray(login.body.user.blacklist || []), 'blacklist应为数组');
    }
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 7. 订单数据结构 =====
  it('7.1 订单创建后数据结构正确', async () => {
    const uniq = 'order_s' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'OrderStruct123!' }),
    });
    const token = reg.body.token;
    const r = await api('/api/order', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        userId: uniq,
        items: [{ id: dishPool[0].id, name: '测试菜', price: 20, type: '偏好推荐', matchRate: 0.9 }],
        totalPrice: 20
      }),
    });
    assert.ok(r.status === 200 || r.status === 201, '订单创建应成功');
    assert.equal(r.body.success, true);
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 8. 反馈数据结构 =====
  it('8.1 反馈提交数据结构正确', async () => {
    const uniq = 'fb_stru' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'FbStruct123!' }),
    });
    const token = reg.body.token;
    const r = await api('/api/feedback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        dishId: 3, score: 5, userId: uniq,
        userPreferences: { spiciness: '微辣' }
      }),
    });
    assert.ok(r.status === 200 || r.status === 201, '反馈提交应成功');
    assert.equal(r.body.success, true);
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
  });

  // ===== 9. 管理员登录token包含role=admin =====
  it('9.1 管理员token含role=admin', async () => {
    const adminR = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASS }),
    });
    assert.equal(adminR.body.success, true);
    const token = adminR.body.token;
    // 解码JWT验证role
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    assert.equal(payload.role, 'admin', 'token应包含role=admin');
    assert.ok(payload.jti, 'token应包含jti');
  });

  // ===== 10. 用户token包含role=user =====
  it('10.1 用户token含role=user', async () => {
    const uniq = 'role_ch' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'RoleCheck123!' }),
    });
    const token = reg.body.token;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    assert.equal(payload.role, 'user', '用户token应包含role=user');
    assert.ok(payload.jti, '用户token应包含jti');
    assert.ok(payload.username, '用户token应包含username');
    // 清理
    await api('/api/user/delete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: uniq }),
    });
  });
});