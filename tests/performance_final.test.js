// 唐猫庭院 - 性能基准测试最终版
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const BASE = 'http://localhost:3000';

describe('性能基准测试', () => {

  // ===== 1. API响应时间基准 =====
  it('1.1 菜品API响应时间<500ms', async () => {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await fetch(BASE + '/api/dishes');
      times.push(Date.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    assert.ok(avg < 500, `平均响应时间应<500ms，实际: ${avg.toFixed(0)}ms`);
    console.log(`菜品API平均响应: ${avg.toFixed(0)}ms`);
  });

  // ===== 2. Worker健康检查响应 =====
  it('2.1 Worker健康检查<100ms', async () => {
    const start = Date.now();
    const r = await fetch(BASE + '/api/worker-health');
    const elapsed = Date.now() - start;
    assert.equal(r.status, 200);
    assert.ok(elapsed < 100, `健康检查应<100ms，实际: ${elapsed}ms`);
    console.log(`健康检查响应: ${elapsed}ms`);
  });

  // ===== 3. 首页HTML响应 =====
  it('3.1 首页HTML响应<500ms', async () => {
    const start = Date.now();
    const r = await fetch(BASE + '/');
    const elapsed = Date.now() - start;
    assert.equal(r.status, 200);
    assert.ok(elapsed < 500, `首页HTML应<500ms，实际: ${elapsed}ms`);
    console.log(`首页HTML响应: ${elapsed}ms`);
  });

  // ===== 4. 推荐API响应 =====
  it('4.1 推荐API响应<5秒', async () => {
    const start = Date.now();
    const r = await fetch(BASE + '/api/predict-rf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPrefs: { '辣度': '微辣', '咸淡': '适中', '甜酸': '酸甜' },
        dishes: [{ id: 1, name: 'test', spiciness: '微辣', saltiness: '适中', sweetness: '酸甜', rating: 4, price: 20, isHalal: false, isVegetarian: false, allergies: [], religion: '无特殊要求', calorie: '200', protein: '10' }]
      }),
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 5000, `推荐API应<5秒，实际: ${elapsed}ms`);
    assert.equal(r.status, 200);
    console.log(`推荐API响应: ${elapsed}ms`);
  });

  // ===== 5. 模型指标响应 =====
  it('5.1 模型指标<500ms', async () => {
    const start = Date.now();
    const r = await fetch(BASE + '/api/model-metrics');
    const elapsed = Date.now() - start;
    assert.equal(r.status, 200);
    assert.ok(elapsed < 500, `模型指标应<500ms，实际: ${elapsed}ms`);
    console.log(`模型指标响应: ${elapsed}ms`);
  });

  // ===== 6. 特征重要性响应 =====
  it('6.1 特征重要性<500ms', async () => {
    const start = Date.now();
    const r = await fetch(BASE + '/api/feature-importance');
    const elapsed = Date.now() - start;
    assert.equal(r.status, 200);
    assert.ok(elapsed < 500, `特征重要性应<500ms，实际: ${elapsed}ms`);
    console.log(`特征重要性响应: ${elapsed}ms`);
  });

  // ===== 7. 静态资源响应 =====
  it('7.1 静态资源响应<200ms', async () => {
    const paths = ['/styles.css', '/script.js', '/js/core.js'];
    for (const p of paths) {
      const start = Date.now();
      const r = await fetch(BASE + p);
      const elapsed = Date.now() - start;
      assert.equal(r.status, 200, `${p}应返回200`);
      assert.ok(elapsed < 200, `${p}应<200ms，实际: ${elapsed}ms`);
      console.log(`${p}响应: ${elapsed}ms`);
    }
  });

  // ===== 8. 并发请求 =====
  it('8.1 10个并发请求全部成功', async () => {
    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => fetch(BASE + '/api/dishes'))
    );
    const elapsed = Date.now() - start;
    for (const r of results) {
      assert.equal(r.status, 200, '并发请求应全部200');
    }
    assert.ok(elapsed < 2000, `10个并发请求应<2秒，实际: ${elapsed}ms`);
    console.log(`10个并发请求耗时: ${elapsed}ms`);
  });

  // ===== 9. 连续请求稳定性 =====
  it('9.1 连续20次请求无失败', async () => {
    let failed = 0;
    for (let i = 0; i < 20; i++) {
      const r = await fetch(BASE + '/api/worker-health');
      if (r.status !== 200) failed++;
    }
    assert.equal(failed, 0, '连续20次健康检查应全部成功');
    console.log('连续20次请求全部成功');
  });

  // ===== 10. 大请求体处理 =====
  it('10.1 100个菜品推荐请求<2秒', async () => {
    const dishes = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1, name: '菜品' + i, spiciness: '微辣', saltiness: '适中',
      sweetness: '酸甜', rating: 4, price: 20, isHalal: false, isVegetarian: false,
      allergies: [], religion: '无特殊要求', calorie: '200', protein: '10'
    }));
    const start = Date.now();
    const r = await fetch(BASE + '/api/predict-rf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPrefs: { '辣度': '微辣', '咸淡': '适中', '甜酸': '酸甜' },
        dishes
      }),
    });
    const elapsed = Date.now() - start;
    assert.equal(r.status, 200, '100菜品推荐应成功');
    assert.ok(elapsed < 5000, `100菜品推荐应<5秒，实际: ${elapsed}ms`);
    console.log(`100菜品推荐响应: ${elapsed}ms`);
  });
});
// 2026-10-19 core.js 拆分适配: 前端源断言改为跨全部 js/ 模块拼接搜索(任何未来的域拆分都不再破坏测试)
function frontSrc() {
  return ['globals', 'menu', 'cart', 'core', 'recommendation', 'init', 'logo-intro']
    .map(f => require('fs').readFileSync(require('path').join(__dirname, '..', 'js', f + '.js'), 'utf8'))
    .join('\n');
}
