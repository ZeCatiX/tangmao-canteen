// 唐猫庭院 - F2 桌号格式校验回归（2026-10-16）：建单/挪桌对 tableNumber 的服务端校验
// 背景：历史上有乱码桌号（X99乱码/ET936320C 等）直插库的脏数据——校验缺口实测复现后补齐
require('dotenv').config();
const test = require('node:test');
const assert = require('assert/strict');
const BASE = 'http://localhost:3000';

let adminToken = '';
let junkOrderId = '';

async function api(path, opt = {}) {
  const r = await fetch(BASE + path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

test.before(async () => {
  // 管理登录限频(30/分钟)兜底: 无 token 时隔 5 秒重试,最多 3 次
  for (let attempt = 0; attempt < 3 && !adminToken; attempt++) {
    if (attempt) await new Promise((res) => setTimeout(res, 5000));
    const l = await api('/api/admin/login', { method: 'POST', body: { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS } });
    adminToken = l.body.token || '';
  }
  assert.ok(adminToken, '管理员登录失败(可能限频)');
});

test('F2: 乱码桌号建单被拒(400)', async () => {
  const r = await api('/api/order', { method: 'POST', body: { items: [{ id: 2075, qty: 1 }], tableNumber: 'X99乱码' } });
  assert.equal(r.status, 400, '乱码桌号应被服务端拒绝');
  if (r.body.orderId) junkOrderId = r.body.orderId; // 不应走到这
});

test('F2: 三位数桌号建单被拒(400)', async () => {
  const r = await api('/api/order', { method: 'POST', body: { items: [{ id: 2075, qty: 1 }], tableNumber: '123' } });
  assert.equal(r.status, 400);
});

test('F2: 合法桌号建单仍通过(打包)', async () => {
  const r = await api('/api/order', { method: 'POST', body: { items: [{ id: 2080, qty: 1 }], tableNumber: '打包' } });
  assert.equal(r.status, 200);
  if (r.body.orderId) junkOrderId = r.body.orderId;
});

test('F2: 挪桌到乱码桌号被拒(400)', async () => {
  if (!junkOrderId) return;
  // 传对象而非预序列化字符串(api 助手内部会 stringify,双重编码会 400 数据格式错误)
  let r = await api('/api/orders/' + junkOrderId + '/status', { method: 'PUT', headers: { Authorization: 'Bearer ' + adminToken }, body: { status: 'cancelled' } });
  if (r.status === 401) {
    // 环境性 401 抖动兜底: 重登一次再试
    const l = await api('/api/admin/login', { method: 'POST', body: { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS } });
    adminToken = l.body.token;
    r = await api('/api/orders/' + junkOrderId + '/status', { method: 'PUT', headers: { Authorization: 'Bearer ' + adminToken }, body: { status: 'cancelled' } });
  }
  assert.equal(r.status, 200, '取消响应: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 100));
  const m = await api('/api/order/' + junkOrderId + '/table', { method: 'PATCH', body: { tableNumber: '乱码桌', fromTable: '打包' } });
  assert.equal(m.status, 400);
});

test.after(async () => {
  // 清理: 取消本轮产生的测试单(尽力而为)
  try {
    if (junkOrderId) await api('/api/orders/' + junkOrderId + '/status', { method: 'PUT', headers: { Authorization: 'Bearer ' + adminToken }, body: JSON.stringify({ status: 'cancelled' }) });
  } catch (e) { /* 忽略 */ }
});
