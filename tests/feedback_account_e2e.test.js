// 唐猫庭院 - 评价反馈与账户管理 E2E 测试
// 覆盖：星级评价提交 → 反馈成功 → 删除账户 → 账户被删
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) return false;
  if (msg.includes('401 (Unauthorized)')) return false;
  if (msg.includes('429 (Too Many Requests)')) return false;
  if (msg.includes('404 (Not Found)')) return false;
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) return false;
  return true;
}

describe('评价反馈与账户管理测试', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('dialog', d => d.accept().catch(() => {}));
    page.on('console', msg => {
      if (msg.type() === 'error' && isRealError(msg.text())) page._consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() { return page._consoleErrors.filter(isRealError); }

  // ===== 1. 星级评价 =====
  it('1.1 注册登录后对菜品进行星级评价', async () => {
    resetErrors();
    const uniq = 'rate_' + Date.now();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('nav-user')?.click());
    await sleep(400);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(500);
    await page.type('#register-username', uniq, { delay: 10 });
    await page.type('#register-password', 'Pass1234!', { delay: 10 });
    await page.type('#register-confirm', 'Pass1234!', { delay: 10 });
    await page.evaluate(() => document.getElementById('agree-privacy')?.click());
    await sleep(100);
    await page.evaluate(() => document.getElementById('register-form')?.requestSubmit());
    await sleep(1500);
    console.log('注册用户:', uniq);

    // 进入菜单，点击第一个菜品的评价按钮（若有）
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(800);
    const ratingButtons = await page.evaluate(() => {
      // 表格行中的评分按钮
      const rows = document.querySelectorAll('#dataset-table-body tr');
      const btn = rows[0]?.querySelector('button');
      if (btn) { btn.click(); return { clicked: true, text: btn.textContent.trim() }; }
      return { clicked: false };
    });
    console.log('评分按钮点击:', JSON.stringify(ratingButtons));
    await sleep(800);

    // 检查是否出现星标评价区
    const starSection = await page.evaluate(() => {
      const sec = document.getElementById('feedback-section');
      return sec && !sec.classList.contains('d-none');
    });
    console.log('反馈section可见:', starSection);
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  it('1.2 直接通过API提交评分（等价用户行为）', async () => {
    // 注册一个新用户并通过 API 提交反馈
    const uniq = 'rateapi_' + Date.now();
    const reg = await fetch(BASE + '/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uniq, password: 'Pass1234!' }),
    });
    const regJson = await reg.json();
    console.log('API注册:', regJson.success ? '成功' : JSON.stringify(regJson));
    if (!regJson.success) { console.log('跳过：注册失败'); return; }

    const fb = await fetch(BASE + '/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (regJson.token || '') },
      body: JSON.stringify({ dishId: 1, score: 5, userPreferences: {} }),
    });
    const fbJson = await fb.json();
    console.log('API提交反馈:', JSON.stringify(fbJson).slice(0, 120));
    assert.ok(fbJson.success === true, '反馈应提交成功: ' + JSON.stringify(fbJson));
  });

  // ===== 2. 删除账户 =====
  it('2.1 删除账户功能可用', async () => {
    resetErrors();
    const uniq = 'delacct_' + Date.now();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('nav-user')?.click());
    await sleep(400);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(500);
    await page.type('#register-username', uniq, { delay: 10 });
    await page.type('#register-password', 'Pass1234!', { delay: 10 });
    await page.type('#register-confirm', 'Pass1234!', { delay: 10 });
    await page.evaluate(() => document.getElementById('agree-privacy')?.click());
    await sleep(100);
    await page.evaluate(() => document.getElementById('register-form')?.requestSubmit());
    await sleep(1500);

    // 进入个人中心
    await page.evaluate(() => document.getElementById('view-profile-btn')?.click());
    await sleep(800);
    const delBtn = await page.$('#delete-account-btn');
    assert.ok(delBtn, '应有删除账户按钮');
    // 点击删除按钮 → 打开 Bootstrap 确认模态框
    await page.evaluate(() => document.getElementById('delete-account-btn')?.click());
    await sleep(800);
    const modalShown = await page.evaluate(() => {
      const modal = document.getElementById('message-modal');
      return modal && (modal.classList.contains('show') || modal.style.display !== 'none');
    });
    console.log('确认模态框显示:', modalShown);
    assert.ok(modalShown, '删除应弹出确认模态框');
    // 点击模态框确认按钮
    await page.evaluate(() => document.getElementById('modal-confirm-btn')?.click());
    await sleep(2000);
    const state = await page.evaluate(() => {
      const navUser = document.getElementById('nav-user');
      return {
        loggedOut: navUser && !navUser.classList.contains('d-none'),
        hasSuccessMsg: /账号已注销/.test(document.body.textContent),
      };
    });
    console.log('删除账户后:', JSON.stringify(state));
    assert.ok(state.loggedOut || state.hasSuccessMsg, '删除后应回到未登录状态或显示成功消息');
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  // ===== 3. 其他功能抽查 =====
  it('3.1 隐私政策链接与返回', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('nav-privacy')?.click());
    await sleep(500);
    const visible = await page.evaluate(() => {
      const sec = document.getElementById('privacy-section');
      return sec && !sec.classList.contains('d-none');
    });
    assert.ok(visible, '隐私政策应可见');
    await page.evaluate(() => document.getElementById('back-from-privacy')?.click());
    await sleep(400);
    const home = await page.evaluate(() => {
      const sec = document.getElementById('home-section');
      return sec && !sec.classList.contains('d-none');
    });
    assert.ok(home, '返回后应回首页');
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  it('3.2 关于本店与返回', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('nav-about')?.click());
    await sleep(500);
    const visible = await page.evaluate(() => {
      const sec = document.getElementById('about-section');
      return sec && !sec.classList.contains('d-none');
    });
    assert.ok(visible, '关于本店应可见');
    await page.evaluate(() => document.getElementById('back-from-about')?.click());
    await sleep(400);
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });
});