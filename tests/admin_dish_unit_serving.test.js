// 回归: 后台新增/编辑菜品支持 计价单位(price_unit) 与 起售/规格备注(serving)
// 背景: 单位/起售体系上线后, 后台表单与接口不收这两个字段, 新建菜只能落库为 null(前端兜底 /份、无起售)
// 本文件走真实后台接口: 建菜 → 公开菜单可见 → 编辑生效 → 非法单位 400 → 永久删除清理
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

const NAMES = ['测试单位菜', '测试无单位菜'];
var adminToken = '';

const auth = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken });

async function findDish(name) {
  const r = await fetch(BASE + '/api/dishes');
  const d = await r.json();
  const list = Array.isArray(d) ? d : (d.dishes || d.data || []);
  return list.find(x => x.name === name) || null;
}

// 后台写接口是"先响应、后异步刷 dishData 缓存"的模式, 读侧用轮询对齐真实时序
async function pollDish(name, exist, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const dish = await findDish(name);
    if (exist === !!dish) return dish || null;
    if (Date.now() > deadline) return dish || null;
    await new Promise(res => setTimeout(res, 200));
  }
}

async function deletePermanent(name) {
  const x = await pollDish(name, true, 1000);
  if (!x) return;
  await fetch(BASE + '/api/admin/dish/' + x.id + '/permanent', { method: 'DELETE', headers: auth() });
  await pollDish(name, false);
}

before(async () => {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS }),
  });
  const d = await r.json();
  adminToken = d.token || '';
  assert.ok(adminToken, 'admin 登录应成功');
  // 清理上次运行可能的残留
  for (const n of NAMES) await deletePermanent(n);
});

test('后台建菜带 计价单位+起售备注 → 公开菜单可见', async () => {
  const r = await fetch(BASE + '/api/admin/dish', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ name: '测试单位菜', category: '特色凉菜', price: 12, rating: 3.5, price_unit: '/2杯', serving: '2杯起', description: '' }),
  });
  const d = await r.json();
  assert.equal(d.success, true, '建菜应成功: ' + JSON.stringify(d).slice(0, 120));
  const dish = await pollDish('测试单位菜', true);
  assert.ok(dish, '公开菜单应可见');
  assert.equal(dish.price_unit, '/2杯');
  assert.equal(dish.serving, '2杯起');
});

test('后台编辑可改 单位/起售备注; 非法单位(缺/)被拒', async () => {
  const dish = await pollDish('测试单位菜', true);
  assert.ok(dish, '前置: 测试菜存在');
  let r = await fetch(BASE + '/api/admin/dish/' + dish.id, {
    method: 'PUT', headers: auth(),
    body: JSON.stringify({ price_unit: '/3杯', serving: '3杯起' }),
  });
  assert.equal((await r.json()).success, true);
  const after = await pollDish('测试单位菜', true);
  assert.equal(after.price_unit, '/3杯');
  assert.equal(after.serving, '3杯起');

  r = await fetch(BASE + '/api/admin/dish/' + dish.id, {
    method: 'PUT', headers: auth(),
    body: JSON.stringify({ price_unit: '3杯' }),
  });
  assert.equal(r.status, 400, '单位缺 / 应 400');
});

test('建菜不传单位 → 落库为空(前端兜底/份); 永久删除清理测试菜', async () => {
  const r = await fetch(BASE + '/api/admin/dish', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ name: '测试无单位菜', category: '特色凉菜', price: 8, rating: 3.5 }),
  });
  const d = await r.json();
  assert.equal(d.success, true);
  const dish = await pollDish('测试无单位菜', true);
  assert.ok(dish);
  assert.ok(!dish.price_unit, '不传单位应落库为空');
  // 清理两个测试菜
  for (const name of NAMES) {
    await deletePermanent(name);
    assert.equal(await pollDish(name, false, 1000), null, name + ' 删除后公开菜单不可见');
  }
});
