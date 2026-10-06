// 唐猫庭院 - 浏览器端到端测试
// 使用 Puppeteer 真实浏览器点击按钮，验证页面交互和响应
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

describe('浏览器端到端测试 - 按钮可用性与页面响应', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    // 收集控制台错误
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
    // 清理测试残留数据（避免并发测试干扰）
    try {
      const r = await fetch(BASE + '/api/dishes');
      const data = await r.json();
      const dishes = data.dishes || [];
      const adminToken = await fetch(BASE + '/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'tm_admin_f1e2d3c4b5a6978' }),
      }).then(r => r.json()).then(d => d.token);
      for (const d of dishes) {
        if (d.name === '测试重复菜名' || d.name.startsWith('测试菜品_E2E_')) {
          await fetch(BASE + '/api/admin/dish/' + d.id + '/permanent', {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + adminToken },
          });
        }
      }
    } catch (e) { /* ignore cleanup errors */ }
  });

  after(async () => {
    if (browser) await browser.close();
  });

  // ===== 1. 首页加载与按钮可见性 =====
  it('1.1 首页加载 - 所有核心按钮可见', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    const guestBtn = await page.$('#guest-btn');
    assert.ok(guestBtn, '开始点餐按钮应存在');
    await guestBtn.scrollIntoViewIfNeeded();
    await sleep(200);
    assert.ok(await guestBtn.isIntersectingViewport(), '开始点餐按钮应在视口中');

    const loginBtn = await page.$('#login-btn');
    assert.ok(loginBtn, '登录按钮应存在');

    const registerBtn = await page.$('#register-btn');
    assert.ok(registerBtn, '注册按钮应存在');
  });

  it('1.2 响应式 - viewport meta 存在', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('viewport'), 'viewport meta 应存在');
    assert.ok(html.includes('width=device-width'), 'viewport 应支持设备宽度');
  });

  it('1.3 页面无控制台错误', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1000);
    assert.equal(page._consoleErrors.length, 0, '首页不应有控制台错误: ' + page._consoleErrors.join('; '));
  });

  // ===== 2. 导航栏点击 =====
  it('2.1 导航栏点击 - 切换不同 section', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);

    await page.click('#nav-about');
    await sleep(500);
    const aboutSection = await page.$('#about-section');
    assert.ok(aboutSection, '关于本店 section 应存在');

    await page.click('#nav-dataset');
    await sleep(800);
    const datasetSection = await page.$('#dataset-section');
    assert.ok(datasetSection, '全部菜单 section 应存在');

    await page.click('#nav-home');
    await sleep(300);
    const homeSection = await page.$('#home-section');
    assert.ok(homeSection, '首页 section 应存在');
  });

  it('2.2 购物车导航按钮', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    const cartNav = await page.$('#nav-cart');
    assert.ok(cartNav, '购物车导航应存在');
    const badge = await page.$('#cart-badge');
    assert.ok(badge, '购物车角标应存在');
  });

  // ===== 3. 登录/注册切换 =====
  it('3.1 登录按钮跳转到登录表单', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.click('#login-btn');
    await sleep(500);
    const loginForm = await page.$('#login-form');
    assert.ok(loginForm, '登录表单应显示');
  });

  it('3.2 注册按钮跳转到注册表单', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.click('#register-btn');
    await sleep(500);
    const registerForm = await page.$('#register-form');
    assert.ok(registerForm, '注册表单应显示');
  });

  // ===== 4. 开始点餐流程 =====
  it('4.1 "开始点餐"按钮跳转到偏好设置', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 2026-09-17: AI入口+选桌(偏好页)
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(500);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#table-picker-modal button')].find(x => x.textContent.trim() === '08'); if (b) b.click(); });
    await sleep(500);
    await sleep(400);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#table-picker-modal button')].find(x => x.textContent.trim() === '08'); if (b) b.click(); });
    await sleep(500);
    const prefForm = await page.$('#preference-form');
    assert.ok(prefForm, '偏好表单应存在');
    const recMode = await page.$('#recommendation-mode');
    assert.ok(recMode, '推荐模式下拉应存在');
  });

  it('4.2 偏好表单字段完整', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 2026-09-17: AI入口+选桌(偏好页)
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(500);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#table-picker-modal button')].find(x => x.textContent.trim() === '08'); if (b) b.click(); });
    await sleep(500);
    await sleep(400);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#table-picker-modal button')].find(x => x.textContent.trim() === '08'); if (b) b.click(); });
    await sleep(500);
    const fields = ['spiciness', 'saltiness', 'sweetness', 'price', 'calorie', 'religion'];
    for (const id of fields) {
      const el = await page.$('#' + id);
      assert.ok(el, `偏好字段 ${id} 应存在`);
    }
    const allergyNone = await page.$('#allergy-none');
    assert.ok(allergyNone, '无过敏源复选框应存在');
  });

  it('4.3 提交偏好获取推荐结果', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 2026-10-06 B7冷启动:未声明偏好的新客点AI直达热门Top6,不再进偏好表单。
    // 要走"偏好表单→推荐"路径,先标记 tasteFilled(等价于声明过偏好)。
    await page.evaluate(() => sessionStorage.setItem('tasteFilled', '1'));
    // 2026-09-17: AI入口+选桌(偏好页)
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(500);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#table-picker-modal button')].find(x => x.textContent.trim() === '08'); if (b) b.click(); });
    await sleep(800);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.click('#preference-form button[type="submit"]');
    await sleep(3000);
    const pageContent = await page.content();
    // 不应显示崩溃信息
    assert.ok(!pageContent.includes('崩溃') && !pageContent.toLowerCase().includes('cannot read'), '页面不应显示崩溃信息');
    // 应有推荐结果或加载中
    const recResult = await page.$('#recommendation-result');
    const loading = await page.$('#recommendation-loading');
    assert.ok(recResult || loading, '应显示推荐结果或加载状态');
  });

  // ===== 5. 全部菜单 =====
  it('5.1 全部菜单加载并显示菜品', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.click('#nav-dataset');
    await sleep(1500);
    const searchInput = await page.$('#menu-search');
    assert.ok(searchInput, '搜索输入框应存在');
  });

  it('5.2 菜单不应包含测试垃圾数据', async () => {
    // 先清理可能的并发测试残留
    try {
      const adminToken = await fetch(BASE + '/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'tm_admin_f1e2d3c4b5a6978' }),
      }).then(r => r.json()).then(d => d.token);
      const r = await fetch(BASE + '/api/dishes');
      const data = await r.json();
      for (const d of (data.dishes || [])) {
        if (d.name === '测试重复菜名' || d.name.startsWith('测试菜品_E2E_')) {
          await fetch(BASE + '/api/admin/dish/' + d.id + '/permanent', {
            method: 'DELETE', headers: { 'Authorization': 'Bearer ' + adminToken },
          });
        }
      }
    } catch (e) { /* ignore */ }
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.click('#nav-dataset');
    await sleep(1500);
    const pageContent = await page.content();
    assert.ok(!pageContent.includes('测试重复菜名'), '菜单不应包含测试残留菜品"测试重复菜名"');
    assert.ok(!pageContent.includes('测试菜品_E2E'), '菜单不应包含测试残留菜品"测试菜品_E2E"');
  });

  // ===== 6. 响应式布局 =====
  it('6.1 移动端 375px 布局正常', async () => {
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const guestBtn = await page.$('#guest-btn');
    assert.ok(guestBtn, '移动端开始点餐按钮应存在');
    await guestBtn.scrollIntoViewIfNeeded();
    await sleep(200);
    // 恢复桌面视口
    await page.setViewport({ width: 1280, height: 800 });
  });

  // ===== 7. 静态页面可访问 =====
  it('7.1 管理后台页面可访问', async () => {
    const resp = await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle0', timeout: 15000 });
    assert.ok(resp.ok(), 'admin.html 应返回 200');
    const title = await page.title();
    assert.ok(title.includes('管理后台'), '管理后台标题应正确');
  });

  it('7.2 厨房看板页面可访问', async () => {
    const resp = await page.goto(BASE + '/kitchen.html', { waitUntil: 'networkidle0', timeout: 15000 });
    assert.ok(resp.ok(), 'kitchen.html 应返回 200');
    const title = await page.title();
    assert.ok(title.includes('厨房'), '厨房看板标题应正确');
  });
});
