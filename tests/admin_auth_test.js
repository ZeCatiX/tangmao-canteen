// 验证 adminAuth 角色校验修复
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
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

describe('adminAuth 角色校验', () => {
  let userToken = '';
  let adminToken = '';

  before(async () => {
    // 注册普通用户
    const uname = 'auth_te' + Date.now();
    await api('/api/user/register', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!9' }) });
    const login = await api('/api/user/login', { method: 'POST', body: JSON.stringify({ username: uname, password: 'Test123!9' }) });
    userToken = login.body.token || '';

    // 管理员登录
    const adminLogin = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
    adminToken = adminLogin.body.token || '';
  });

  it('普通用户访问管理后台 API 返回 403', async () => {
    assert.ok(userToken, '应获取到普通用户 token');
    const paths = ['/api/admin/stats', '/api/admin/popular-dishes', '/api/admin/monitor', '/api/admin/model-info'];
    for (const p of paths) {
      const { status, body } = await api(p, { headers: { 'Authorization': 'Bearer ' + userToken } });
      assert.equal(status, 403, `${p} 应返回 403`);
      assert.ok(body.error, '应返回错误信息');
    }
  });

  it('管理员访问管理后台 API 返回 200', async () => {
    assert.ok(adminToken, '应获取到管理员 token');
    const { status, body } = await api('/api/admin/stats', { headers: { 'Authorization': 'Bearer ' + adminToken } });
    assert.equal(status, 200, '管理员应正常访问');
    assert.equal(body.success, true);
  });

  it('无 token 访问管理后台 API 返回 401', async () => {
    const { status } = await api('/api/admin/stats');
    assert.equal(status, 401, '无 token 应返回 401');
  });
});

console.log('✅ adminAuth 角色校验测试加载完成');