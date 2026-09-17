// 唐猫庭院 - 文件上传安全性和暗黑模式检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;
const ROOT = path.join(__dirname, '..');

async function api(p, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(BASE + p, {
    headers: { ...optHeaders },
    ...rest,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function getAdminToken() {
  const r = await api('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  return r.body.token || '';
}

describe('文件上传安全性检查', () => {
  let adminToken;
  before(async () => { adminToken = await getAdminToken(); });

  // ===== 1. 无文件上传返回400 =====
  it('1.1 无文件上传返回400', async () => {
    const r = await fetch(BASE + '/api/admin/dish/upload-image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    const body = await r.json().catch(() => ({}));
    assert.equal(r.status, 400);
    assert.ok(body.error.includes('图片') || body.error.includes('file'), '应提示需要文件');
  });

  // ===== 2. 无token上传被拒绝 =====
  it('2.1 无token上传返回401', async () => {
    const r = await fetch(BASE + '/api/admin/dish/upload-image', { method: 'POST' });
    assert.equal(r.status, 401);
  });

  // ===== 3. 无效dishId被拒绝 =====
  it('3.1 无效dishId被拒绝', async () => {
    // 创建一个简单的测试文件
    const formData = new FormData();
    const blob = new Blob(['fake image data'], { type: 'image/jpeg' });
    formData.append('image', blob, 'test.jpg');
    formData.append('dishId', 'invalid');

    const r = await fetch(BASE + '/api/admin/dish/upload-image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: formData,
    });
    const body = await r.json().catch(() => ({}));
    assert.equal(r.status, 400);
    assert.ok(body.error.includes('ID') || body.error.includes('无效'), '应提示无效ID');
  });

  // ===== 4. 非图片文件被拒绝 =====
  it('4.1 非图片文件被multer拒绝', async () => {
    const formData = new FormData();
    const blob = new Blob(['not an image'], { type: 'text/plain' });
    formData.append('image', blob, 'malicious.txt');
    formData.append('dishId', '1');

    const r = await fetch(BASE + '/api/admin/dish/upload-image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: formData,
    });
    // 应被multer fileFilter拒绝
    assert.ok(r.status === 400 || r.status === 500, '非图片文件应被拒绝');
  });

  // ===== 5. 上传目录存在 =====
  it('5.1 uploads目录存在且可写', () => {
    const dir = path.join(ROOT, 'uploads');
    assert.ok(fs.existsSync(dir), 'uploads目录应存在');
    const testFile = path.join(dir, '_test_write.tmp');
    fs.writeFileSync(testFile, 'test');
    assert.ok(fs.existsSync(testFile), 'uploads目录应可写');
    fs.unlinkSync(testFile);
  });

  // ===== 6. 上传的文件路径安全 =====
  it('6.1 上传文件名不包含路径遍历', async () => {
    // 检查上传文件名是否经过清理
    const formData = new FormData();
    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    formData.append('image', blob, '../../../malicious.jpg');
    formData.append('dishId', '1');

    const r = await fetch(BASE + '/api/admin/dish/upload-image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: formData,
    });
    // 即使上传成功，文件名也应在uploads目录内
    const body = await r.json().catch(() => ({}));
    if (body.imageUrl) {
      assert.ok(!body.imageUrl.includes('..'), '文件名不应包含路径遍历');
      assert.ok(body.imageUrl.startsWith('/uploads/'), '文件URL应以/uploads/开头');
    }
  });
});

describe('暗黑模式CSS检查', () => {
  // ===== 7. 暗黑模式CSS变量定义 =====
  it('7.1 styles.css有暗黑模式规则', () => {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    // 2026-09-17: 深色模式为 class 架构(html.dark-mode),系统偏好由 index.html 内联脚本检测并切换 class
    assert.ok(css.includes('html.dark-mode'), '应有暗黑模式规则(html.dark-mode)');
  });

  // ===== 8. 暗黑模式变量覆盖 =====
  it('8.1 暗黑模式覆盖CSS变量', () => {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    const darkSection = css.substring(css.indexOf('html.dark-mode'));
    assert.ok(darkSection.includes('--cream'), '暗黑模式应覆盖--cream');
    assert.ok(darkSection.includes('--brown'), '暗黑模式应覆盖--brown');
    assert.ok(darkSection.includes('--primary'), '暗黑模式应覆盖--primary');
  });

  // ===== 9. 页面在暗黑模式下不崩溃 =====
  let browser, page;
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox', '--force-dark-mode']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') page._consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });
  after(async () => { if (browser) await browser.close(); });

  it('9.1 暗黑模式首页不崩溃且显示正常', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const guestBtn = await page.$('#guest-btn');
    assert.ok(guestBtn, '暗黑模式下首页按钮应存在');
    const bg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    assert.ok(bg, '暗黑模式下body应有背景色: ' + bg);
    // 不应有JS错误
    const jsErrors = page._consoleErrors.filter(e =>
      !e.includes('fonts.') && !e.includes('Failed to load resource') &&
      !e.includes('ERR_') && !e.includes('favicon')
    );
    assert.equal(jsErrors.length, 0, '暗黑模式不应有JS错误: ' + jsErrors.join('; '));
  });

  it('9.2 暗黑模式管理后台不崩溃', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const loginBtn = await page.$('#admin-login-btn');
    assert.ok(loginBtn, '暗黑模式下管理后台登录按钮应存在');
    const jsErrors = page._consoleErrors.filter(e =>
      !e.includes('fonts.') && !e.includes('Failed to load resource') &&
      !e.includes('ERR_') && !e.includes('favicon')
    );
    assert.equal(jsErrors.length, 0, '暗黑模式管理后台不应有JS错误');
  });

  it('9.3 暗黑模式厨房看板不崩溃', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const orderList = await page.$('#order-list');
    assert.ok(orderList, '暗黑模式下厨房看板订单列表应存在');
    const jsErrors = page._consoleErrors.filter(e =>
      !e.includes('fonts.') && !e.includes('Failed to load resource') &&
      !e.includes('ERR_') && !e.includes('favicon')
    );
    assert.equal(jsErrors.length, 0, '暗黑模式厨房看板不应有JS错误');
  });

  it('9.4 暗黑模式推荐结果页不崩溃', async () => {
    page._consoleErrors = [];
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      document.getElementById('preference-form').querySelector('button[type="submit"]').click();
    });
    await sleep(5000);
    const recVisible = await page.evaluate(() => {
      const el = document.getElementById('recommendation-result');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(recVisible, '暗黑模式下推荐结果应显示');
    const jsErrors = page._consoleErrors.filter(e =>
      !e.includes('fonts.') && !e.includes('Failed to load resource') &&
      !e.includes('ERR_') && !e.includes('favicon')
    );
    assert.equal(jsErrors.length, 0, '暗黑模式推荐页不应有JS错误');
  });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
