// posttest 清理钩子: 测试套件会在厨房看板留下几十张 pending/preparing 测试单,
// 污染看板渲染与自动化点击竞态。本脚本以管理员身份把所有未完成订单批量取消。
// 项目未上线,数据库订单全部来自测试,不存在误伤真实订单的可能(上线前需移除本钩子)。
// 尽力而为: 任何失败只告警并退出 0,不污染测试管道的退出码。
require('dotenv').config();
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing'];

async function main() {
  if (!process.env.ADMIN_PASS) {
    console.log('cleanup_test_orders: 缺 ADMIN_PASS,跳过清理(不影响测试结果)');
    return;
  }
  let token = '';
  try {
    const login = await fetch(BASE + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: process.env.ADMIN_PASS }),
    }).then(r => r.json());
    if (!login.success || !login.token) throw new Error(login.error || '登录失败');
    token = login.token;
  } catch (e) {
    console.log('cleanup_test_orders: 管理员登录失败(' + e.message + '),服务可能未启动,跳过清理');
    return;
  }
  const auth = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
  let cancelled = 0, failed = 0;
  for (const status of ACTIVE_STATUSES) {
    let orders = [];
    try {
      const res = await fetch(BASE + '/api/orders?status=' + status, { headers: auth });
      const body = await res.json();
      if (!body.success) throw new Error('HTTP ' + res.status);
      orders = body.orders || [];
    } catch (e) {
      console.log('cleanup_test_orders: 拉取 ' + status + ' 订单失败(' + e.message + '),跳过该状态');
      continue;
    }
    for (const o of orders) {
      try {
        const r = await fetch(BASE + '/api/orders/' + o.id + '/status', {
          method: 'PUT', headers: auth, body: JSON.stringify({ status: 'cancelled' }),
        }).then(r => r.json());
        if (r.success) cancelled++; else failed++;
      } catch (e) { failed++; }
    }
  }
  console.log('cleanup_test_orders: 取消 ' + cancelled + ' 张测试单' + (failed ? ',失败 ' + failed + ' 张' : '') + (cancelled + failed === 0 ? '(看板本来干净)' : ''));
}

main().catch(e => { console.log('cleanup_test_orders: 异常 ' + e.message + ',跳过'); });
