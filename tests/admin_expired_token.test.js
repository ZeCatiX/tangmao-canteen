// 管理后台过期token登录死锁 E2E(2026-11-05)
// 背景: 过期token加载admin.html会触发401拦截器弹回登录页;此场景曾被观察到
// "正确凭据点击登录无反应"(需清localStorage才能登录)。本回归在真实Chrome里
// 钉死: 种过期token→加载→填正确凭据→点击登录→必须进入管理面板。
// 浏览器级(真实Chrome), puppeteer基建复用 intro_e2e 模式; 找不到Chrome或缺凭据则整组skip。
require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const CAN_RUN = Boolean(CHROME_PATH && ADMIN_PASS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 过期token: role=admin 但 exp 已过期(maxAge 12h 会拒,黑名单链不涉及)
const EXPIRED_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWRtaW4iLCJqdGkiOiJlMmUtdGVzdC1leHBpcmVkIiwiZXhwIjoxMDB9.GENERATED_AT_RUNTIME';

let browser, page;

describe('管理后台过期token登录死锁回归', () => {
  before(async function () {
    if (!CAN_RUN) {
      console.log('  skip: 缺Chrome(' + Boolean(CHROME_PATH) + ')或缺ADMIN_PASS(' + Boolean(ADMIN_PASS) + ')');
      return;
    }
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
  });

  after(async function () {
    if (browser) await browser.close();
  });

  it('种过期token加载后, 正确凭据点击登录必须进入管理面板(不得死锁)', async function () {
    if (!CAN_RUN) { this.skip(); return; }
    // ① 首次加载(建立origin)并种过期token
    await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => { localStorage.setItem('adminToken', t); }, EXPIRED_TOKEN);
    // ② 重载 → 401拦截器弹回登录页(死锁场景入口)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const onLogin = await page.evaluate(() => {
      const lp = document.getElementById('admin-login-page');
      return !!lp && lp.style.display !== 'none';
    });
    assert.ok(onLogin, '过期token加载后应处于登录页');

    // ③ 填正确凭据并真实点击登录按钮
    await page.evaluate((u) => { document.getElementById('admin-login-user').value = u; }, ADMIN_USER);
    await page.evaluate((p) => { document.getElementById('admin-login-pass').value = p; }, ADMIN_PASS);
    await page.click('#admin-login-btn');
    await sleep(3000);

    // ④ 断言: 进入管理面板(登录页隐藏, 面板可见)
    const inPanel = await page.evaluate(() => {
      const lp = document.getElementById('admin-login-page');
      const app = document.querySelector('.app-wrap');
      return (
        lp && lp.style.display === 'none' &&
        app && app.style.display !== 'none'
      );
    });
    assert.ok(inPanel, '正确凭据点击登录后必须进入管理面板(过期token场景不得死锁)');
  });

  it('登录后面板可正常发起API请求(token有效, 不再弹回登录页)', async function () {
    if (!CAN_RUN) { this.skip(); return; }
    await sleep(1200); // 等面板加载函数跑完
    const stillPanel = await page.evaluate(() => {
      const lp = document.getElementById('admin-login-page');
      const app = document.querySelector('.app-wrap');
      return (
        lp && lp.style.display === 'none' &&
        app && app.style.display !== 'none'
      );
    });
    assert.ok(stillPanel, '登录成功后应稳定停留在面板(不弹回登录页)');
  });
});
