// 唐猫庭院 - serverError 辅助函数回归测试（2026-10-19）
// 背景：orders.js 提取共享辅助函数时 serverError 被误写成自我递归，
// 任何异常路径都会栈溢出（被 express 兜底吞成意外 500）而非返回规整 JSON。
// 本测试用会抛错的 db 桩强制走异常路径，验证响应是干净的 500 JSON 且进程不崩。
const test = require('node:test');
const assert = require('assert/strict');
const express = require('express');

function buildApp(dbStub) {
  const app = express();
  app.use(express.json());
  const ordersRoute = require('../server/routes/orders.js');
  ordersRoute.register(app, {
    db: dbStub,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    softAuth: (req, res, next) => next(),
    authMiddleware: (req, res, next) => next(),
  });
  return app;
}

test('serverError: 异常路径返回规整500 JSON而非栈溢出', async () => {
  const boom = new Error('db down (测试桩)');
  const dbStub = {
    query: async () => { throw boom; },
  };
  const app = buildApp(dbStub);
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const r = await fetch(`http://localhost:${port}/api/order/999999999/status-check?tableNumber=01`);
    assert.equal(r.status, 500, '异常路径应返回 500');
    const body = await r.json();
    assert.equal(body.success, false, '应返回规整 JSON 的 success:false');
    assert.ok(body.error && typeof body.error === 'string', '应携带 error 文案');
  } finally {
    server.close();
  }
});
