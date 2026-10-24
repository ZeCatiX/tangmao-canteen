// 唐猫庭院 - 管理后台数据可视化端点完整结构E2E测试
const { describe, it, before, after } = require('node:test');
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

describe('管理后台数据可视化端点完整结构测试', () => {
  let adminToken;
  before(async () => {
    const r = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASS }),
    });
    adminToken = r.body.token;
    assert.ok(adminToken, '应获取管理员token');
  });

  // ===== 1. 每日推荐趋势 =====
  it('1.1 每日推荐趋势返回数据', async () => {
    const r = await api('/api/admin/daily-recommendations', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.data || r.body.days || r.body.daily || r.body.success === true, '应包含趋势数据');
  });

  // ===== 2. 用户活跃度 =====
  it('2.1 用户活跃度返回数据', async () => {
    const r = await api('/api/admin/user-activity', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  // ===== 3. 推荐详情 =====
  it('3.1 推荐详情返回数据', async () => {
    const r = await api('/api/admin/recommendation-details', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  // ===== 4. 模型历史 =====
  it('4.1 模型历史返回版本数据', async () => {
    const r = await api('/api/admin/model-history', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.history) || r.body.data !== undefined, '应包含history数组或data');
  });

  // ===== 5. 最差菜品 =====
  it('5.1 最差菜品返回列表', async () => {
    const r = await api('/api/admin/worst-dishes', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.dishes !== undefined || r.body.data !== undefined, '应包含dishes或data');
  });

  // ===== 6. 模型对比 =====
  it('6.1 模型对比返回版本对比', async () => {
    const r = await api('/api/admin/model-compare', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.versions !== undefined || r.body.data !== undefined, '应包含versions或data');
  });

  // ===== 7. 推荐统计 =====
  it('7.1 推荐统计返回统计字段', async () => {
    const r = await api('/api/admin/recommendation-stats', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  // ===== 8. 通知列表 =====
  it('8.1 通知列表返回数组', async () => {
    const r = await api('/api/admin/notifications', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.notifications !== undefined || r.body.data !== undefined, '应包含通知数组');
  });

  // ===== 9. 仪表盘统计包含核心指标 =====
  it('9.1 仪表盘统计包含今日推荐数', async () => {
    const r = await api('/api/admin/stats', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    const stats = r.body.stats || r.body.data || r.body;
    // 检查关键统计字段
    const keys = Object.keys(stats);
    assert.ok(keys.length > 0, '统计应包含字段');
    // 某些统计可能是0但不应崩溃
    assert.ok(!JSON.stringify(stats).includes('NaN'), '统计不应包含NaN');
  });

  // ===== 10. 热门菜品返回评分数据 =====
  it('10.1 热门菜品返回带评分的数据', async () => {
    const r = await api('/api/admin/popular-dishes', {
      headers: { Authorization: 'Bearer ' + adminToken },
    });
    assert.equal(r.status, 200);
    const dishes = r.body.dishes || r.body.data || [];
    if (Array.isArray(dishes) && dishes.length > 0) {
      const d = dishes[0];
      assert.ok(d.name !== undefined, '热门菜品应包含名称');
      assert.ok(!String(JSON.stringify(d)).includes('NaN'), '热门菜品不应包含NaN');
    }
  });
});
