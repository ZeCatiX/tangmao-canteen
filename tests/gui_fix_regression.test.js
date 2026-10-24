// 唐猫庭院 - GUI 全量测试日 4 项缺陷修复回归（2026-10-14）
// ①退出/注销后直接回首页（不再仅依赖弹窗关闭回调，曾出现主区空白）
// ②厨房"完成"二次确认失败可见化（业务失败/登录过期曾有静默无反馈）
// ③管理端 token 12h 短会话（签发 expiresIn + 校验 maxAge；历史无 exp 长令牌一并拒绝）
// ④EN 模式菜单筛选控件显式翻译（动态重渲染的 option 曾残留中文混排）
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

require('dotenv').config();
const BASE = 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

describe('①退出/注销后回首页（回归）', () => {
  it('logout() 成功路径直接调用 showSection(home-section)', () => {
    const core = frontSrc();
    const body = core.slice(core.indexOf('function logout()'), core.indexOf('function showProfile'));
    const hits = (body.match(/showSection\('home-section'\)/g) || []).length;
    assert.ok(hits >= 2, 'logout 应含直接回首页调用 + 弹窗回调双保险，实际 ' + hits + ' 处');
  });

  it('deleteAccount 成功分支直接调用 showSection(home-section)', () => {
    const core = frontSrc();
    const body = core.slice(core.indexOf('function deleteAccount()'), core.indexOf('function deleteAccount()') + 3600);
    assert.ok(body.includes("showSection('home-section');"), '注销成功分支应有直接回首页调用');
  });
});

describe('②厨房完成按钮失败可见化（回归）', () => {
  const kitchen = read('kitchen.html');
  it('登录过期时给出提示而非静默返回', () => {
    const block = kitchen.slice(
      kitchen.indexOf('function completeOrder'),
      kitchen.indexOf('function completeOrder') + 1600
    );
    assert.ok(block.includes('登录已过期'), 'token 缺失应提示登录过期');
    assert.ok(!/\n\s*if \(!token\) return;/.test(block), '不应有无提示的静默 return');
  });

  it('业务失败（success=false）也有 toast 并复位按钮', () => {
    const block = kitchen.slice(
      kitchen.indexOf('function completeOrder'),
      kitchen.indexOf('function completeOrder') + 1800
    );
    assert.ok(block.includes('d.success) loadOrders();'), '成功分支刷新');
    assert.ok(block.includes("(d.error || '完成失败，请重试')"), '业务失败应展示服务端错误');
    assert.ok(block.includes('btn.disabled = false'), '失败后按钮应恢复可用');
  });
});

describe('③管理端 token 12h 短会话（回归）', () => {
  it('auth.js generateToken 支持 opts.expiresIn 覆盖', () => {
    const auth = read('auth.js');
    assert.ok(auth.includes('function generateToken(user, opts)'), 'generateToken 应接受 opts');
    assert.ok(auth.includes('(opts && opts.expiresIn) || JWT_EXPIRES_IN'), '应优先使用传入时长');
  });

  it('server.js 管理登录按 12h 签发，adminAuth 以 maxAge 校验', () => {
    const server = read('server.js');
    assert.ok(
      server.includes(
        "generateToken({ id: 0, username: ADMIN_USER, role: 'admin' }, { expiresIn: process.env.ADMIN_TOKEN_EXPIRES_IN || '12h' })"
      ),
      '管理登录应签 12h'
    );
    const authBlock = server.slice(
      server.indexOf('async function adminAuth'),
      server.indexOf('async function adminAuth') + 1200
    );
    assert.ok(
      authBlock.includes("maxAge: process.env.ADMIN_TOKEN_EXPIRES_IN || '12h'"),
      'adminAuth 应带 maxAge 校验（拒绝历史无 exp 长令牌）'
    );
  });

  it('功能回归：管理 token 的 exp-iat 应为 43200 秒（12h）', async () => {
    const login = await fetch(BASE + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    assert.equal(login.status, 200, '管理员登录应成功');
    const decoded = jwt.decode((await login.json()).token);
    assert.equal(decoded.exp - decoded.iat, 43200, '管理 token 有效期应为 12 小时');
  });

  it('功能回归：无 exp 的历史管理 token 被 maxAge 拒绝（401）', async () => {
    // 模拟历史缺陷产物：手工构造 iat 回溯 13 小时、无 exp 的管理 token（jsonwebtoken 不允许 options.iat）
    const crypto = require('node:crypto');
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const header = b64u({ alg: 'HS256', typ: 'JWT' });
    const payload = b64u({
      id: 0,
      username: ADMIN_USER,
      role: 'admin',
      jti: 'stale-regression',
      iat: Math.floor(Date.now() / 1000) - 13 * 3600,
    });
    const sig = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(header + '.' + payload)
      .digest('base64url');
    const stale = header + '.' + payload + '.' + sig;
    const res = await fetch(BASE + '/api/admin/stats', { headers: { Authorization: 'Bearer ' + stale } });
    assert.equal(res.status, 401, '超龄历史 token 应被 401 拒绝，实际 ' + res.status);
  });
});

describe('④EN 模式菜单筛选控件翻译兜底（回归）', () => {
  const globals = read('js/globals.js');
  it('applyUiLang 含菜单筛选控件显式翻译与还原清单', () => {
    assert.ok(globals.includes('__zhElTranslated'), '应有元素级翻译还原清单');
    assert.ok(
      globals.includes("'menu-filter-spice', 'menu-filter-price', 'menu-sort', 'menu-reset-filter'"),
      '应显式覆盖辣度/价格/排序/重置控件'
    );
  });
  it('词典含筛选控件词条', () => {
    assert.ok(globals.includes('全部辣度:'), '全部辣度词条');
    assert.ok(globals.includes('全部价格:'), '全部价格词条');
    assert.ok(globals.includes('默认排序:'), '默认排序词条');
  });
});

// 2026-10-19 core.js 拆分适配: 前端源断言改为跨全部 js/ 模块拼接搜索(任何未来的域拆分都不再破坏测试)
function frontSrc() {
  return ['globals', 'menu', 'cart', 'core', 'recommendation', 'init', 'logo-intro']
    .map((f) => require('fs').readFileSync(require('path').join(__dirname, '..', 'js', f + '.js'), 'utf8'))
    .join('\n');
}
