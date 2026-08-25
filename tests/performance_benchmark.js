// API 性能基准测试
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const BASE = 'http://localhost:3000';

async function api(path) {
  const start = Date.now();
  const res = await fetch(BASE + path);
  const ms = Date.now() - start;
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ms, body };
}

describe('API 性能基准', () => {
  it('GET /api/dishes 应在 500ms 内响应', async () => {
    const { status, ms, body } = await api('/api/dishes');
    assert.equal(status, 200);
    assert.ok(ms < 500, `响应时间 ${ms}ms 超过 500ms 阈值`);
    assert.ok(Array.isArray(body.dishes));
  });

  it('GET /api/model-metrics 应在 500ms 内响应', async () => {
    const { status, ms } = await api('/api/model-metrics');
    assert.equal(status, 200);
    assert.ok(ms < 500, `响应时间 ${ms}ms 超过 500ms 阈值`);
  });

  it('GET /api/feature-importance 应在 500ms 内响应', async () => {
    const { status, ms } = await api('/api/feature-importance');
    assert.equal(status, 200);
    assert.ok(ms < 500, `响应时间 ${ms}ms 超过 500ms 阈值`);
  });

  it('GET /api/worker-health 应在 200ms 内响应', async () => {
    const { status, ms } = await api('/api/worker-health');
    assert.equal(status, 200);
    assert.ok(ms < 200, `响应时间 ${ms}ms 超过 200ms 阈值`);
  });
});

console.log('✅ API 性能基准测试加载完成');