// 唐猫庭院 - trust proxy 与限流代理头 E2E 测试
// 背景: 走 cloudflared 隧道/HTTPS 反代时请求带 X-Forwarded-For,此前未设 trust proxy,
//       express-rate-limit 抛 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR(2026-10-11 隧道实测)。
// 回归: 带 X-Forwarded-For 的请求必须被限流中间件正常处理(不得 500)。
require('dotenv').config();
const { describe, it } = require('node:test');
const assert = require('node:assert');

const BASE = 'http://localhost:3000';

describe('trust proxy 与代理头限流', () => {
  it('首页带 X-Forwarded-For 正常响应(<500)', async () => {
    const res = await fetch(BASE + '/', { headers: { 'X-Forwarded-For': '203.0.113.7' } });
    assert.ok(res.status < 500, `带代理头访问首页不应 5xx,实际 ${res.status}`);
  });

  it('登录接口带 X-Forwarded-For 走限流而非 500(回归 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)', async () => {
    const res = await fetch(BASE + '/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.23' },
      body: JSON.stringify({ username: 'trustproxy_probe', password: 'WrongPass1!' }),
    });
    // 限流/参数校验/凭据错误均为 <500;若 trust proxy 配置退化,express-rate-limit 校验会抛 5xx
    assert.ok(res.status < 500, `带代理头登录不应 5xx,实际 ${res.status}`);
  });

  it('不同 X-Forwarded-For IP 各自计数,连续错误登录仍是 4xx 而非触发全局限流 5xx', async () => {
    for (const ip of ['198.51.100.31', '198.51.100.32']) {
      const res = await fetch(BASE + '/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ username: 'trustproxy_probe_' + ip.slice(-2), password: 'WrongPass1!' }),
      });
      assert.ok(res.status >= 400 && res.status < 500, `IP ${ip} 错误登录应为 4xx,实际 ${res.status}`);
    }
  });
});
