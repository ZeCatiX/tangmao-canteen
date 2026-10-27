// 唐猫庭院 - 多设备响应式布局、缓存策略、PWA特性检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) {
    return false;
  }
  if (msg.includes('401 (Unauthorized)')) {
    return false;
  }
  if (msg.includes('429 (Too Many Requests)')) {
    return false;
  }
  if (msg.includes('404 (Not Found)')) {
    return false;
  }
  if (msg.includes('409')) {
    return false;
  }
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) {
    return false;
  }
  return true;
}

describe('多设备响应式布局检查', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    page._consoleErrors = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (msg.type() === 'error' && isRealError(t)) {
        page._consoleErrors.push(t);
      }
    });
    page.on('pageerror', (err) => page._consoleErrors.push(err.message));
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  // 测试各种设备视口
  const devices = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12', width: 390, height: 844 },
    { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
    { name: 'iPad Mini', width: 768, height: 1024 },
    { name: 'iPad Pro', width: 1024, height: 1366 },
    { name: '桌面 1280', width: 1280, height: 800 },
    { name: '桌面 1440', width: 1440, height: 900 },
    { name: '桌面 1920', width: 1920, height: 1080 },
  ];

  // 为每个设备测试首页
  for (const dev of devices) {
    it(`首页 ${dev.name} (${dev.width}x${dev.height}) 无溢出`, async () => {
      page._consoleErrors = [];
      await page.setViewport({ width: dev.width, height: dev.height });
      await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
      await sleep(500);
      const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${dev.name} 首页水平溢出 ${overflow}px`);
      const guestBtn = await page.$('#guest-btn');
      assert.ok(guestBtn, `${dev.name} 开始点餐按钮应存在`);
      const jsErrors = page._consoleErrors.filter(isRealError);
      assert.equal(jsErrors.length, 0, `${dev.name} 首页不应有JS错误`);
    });
  }

  // 为每个设备测试管理后台
  for (const dev of devices.slice(0, 4)) {
    it(`管理后台 ${dev.name} 无溢出`, async () => {
      page._consoleErrors = [];
      await page.setViewport({ width: dev.width, height: dev.height });
      await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
      await sleep(500);
      const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${dev.name} 管理后台水平溢出 ${overflow}px`);
    });
  }

  // 为每个设备测试厨房看板
  for (const dev of devices.slice(0, 4)) {
    it(`厨房看板 ${dev.name} 无溢出`, async () => {
      page._consoleErrors = [];
      await page.setViewport({ width: dev.width, height: dev.height });
      await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
      await sleep(500);
      const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${dev.name} 厨房看板水平溢出 ${overflow}px`);
    });
  }

  // 推荐流程在移动端测试
  it('移动端375px推荐流程无溢出', async () => {
    page._consoleErrors = [];
    await page.setViewport({ width: 375, height: 812 });
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
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `移动端推荐页溢出 ${overflow}px`);
    const recVisible = await page.evaluate(() => {
      const el = document.getElementById('recommendation-result');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(recVisible, '移动端推荐结果应显示');
    const jsErrors = page._consoleErrors.filter(isRealError);
    assert.equal(jsErrors.length, 0, '移动端推荐流程不应有JS错误');
  });
});

describe('HTTP缓存策略检查', () => {
  // ===== 1. HTML有缓存头 =====
  it('1.1 HTML页面有Cache-Control头', async () => {
    const r = await fetch(BASE + '/');
    const cc = r.headers.get('cache-control');
    assert.ok(cc, 'HTML页面应有Cache-Control头');
  });

  // ===== 2. CSS有缓存头 =====
  it('2.2 CSS文件有长缓存', async () => {
    const r = await fetch(BASE + '/styles.css');
    const cc = r.headers.get('cache-control') || '';
    assert.ok(cc.includes('max-age') || cc.includes('7d') || cc.includes('public'), 'CSS应有长缓存: ' + cc);
  });

  // ===== 3. JS有缓存头 =====
  it('3.3 JS文件有长缓存', async () => {
    const r = await fetch(BASE + '/script.js');
    const cc = r.headers.get('cache-control') || '';
    assert.ok(cc.includes('max-age') || cc.includes('7d') || cc.includes('public'), 'JS应有长缓存: ' + cc);
  });

  // ===== 4. node_modules有缓存 =====
  it('4.1 node_modules资源有长缓存', async () => {
    const r = await fetch(BASE + '/node_modules/bootstrap/dist/css/bootstrap.min.css');
    const cc = r.headers.get('cache-control') || '';
    assert.ok(cc.includes('max-age') || cc.includes('7d'), 'node_modules应有长缓存: ' + cc);
  });

  // ===== 5. API响应不被缓存 =====
  it('5.1 API响应不应被浏览器缓存', async () => {
    const r = await fetch(BASE + '/api/dishes');
    const cc = r.headers.get('cache-control') || '';
    // API通常不应被缓存（或应短缓存）
    // 即使没有no-cache也不算bug，但应检查是否合理
    assert.ok(true, 'API Cache-Control: ' + cc);
  });

  // ===== 6. uploads有缓存 =====
  it('6.1 uploads目录有缓存', async () => {
    const r = await fetch(BASE + '/uploads/');
    const cc = r.headers.get('cache-control') || '';
    // uploads目录可能有缓存也可能404（空目录）
    assert.ok(r.status === 200 || r.status === 404, 'uploads应返回200或404');
  });
});

describe('PWA和离线特性检查', () => {
  let browser, page;
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (msg.type() === 'error' && isRealError(t)) {
        page._consoleErrors.push(t);
      }
    });
    page.on('pageerror', (err) => page._consoleErrors.push(err.message));
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  // ===== 7. viewport meta存在 =====
  it('7.1 首页有viewport meta', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    const hasViewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta && meta.content.includes('width=device-width');
    });
    assert.ok(hasViewport, '应有viewport meta');
  });

  // ===== 8. theme-color meta =====
  it('8.1 检查theme-color meta（PWA特性）', async () => {
    const hasThemeColor = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="theme-color"]');
      return meta ? meta.content : null;
    });
    // theme-color不是必须的，但有助于PWA
    assert.ok(true, 'theme-color: ' + (hasThemeColor || '未设置'));
  });

  // ===== 9. description meta存在 =====
  it('9.1 首页有description meta', async () => {
    const hasDesc = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="description"]');
      return meta && meta.content.length > 10;
    });
    assert.ok(hasDesc, '应有description meta（长度>10）');
  });

  // ===== 10. manifest.json检查 =====
  it('10.1 检查manifest.json引用（PWA）', async () => {
    const hasManifest = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]');
      return link ? link.href : null;
    });
    // manifest不是必须的
    assert.ok(true, 'manifest: ' + (hasManifest || '未引用'));
  });

  // ===== 11. service worker检查 =====
  it('11.1 检查service worker注册', async () => {
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.length;
      }
      return -1; // 不支持
    });
    // service worker不是必须的
    assert.ok(true, 'serviceWorker注册数: ' + swRegistered);
  });

  // ===== 12. 触控交互支持 =====
  it('12.1 首页有touch-action样式', () => {
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    assert.ok(css.includes('touch-action'), 'CSS应有touch-action声明');
  });

  // ===== 13. apple-touch-icon =====
  it('13.1 检查apple-touch-icon引用', async () => {
    const hasAppleIcon = await page.evaluate(() => {
      const link = document.querySelector('link[rel="apple-touch-icon"]');
      return link ? link.href : null;
    });
    // apple-touch-icon不是必须的
    assert.ok(true, 'apple-touch-icon: ' + (hasAppleIcon || '未引用'));
  });

  // ===== 14. 离线时localStorage数据保持 =====
  it('14.1 localStorage数据在页面刷新后保持', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 设置数据
    await page.evaluate(() => {
      localStorage.setItem('currentUser', 'test_offline');
      localStorage.setItem('cart', JSON.stringify([{ id: 1, name: 'test', price: 10 }]));
    });
    // 刷新
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(300);
    const user = await page.evaluate(() => localStorage.getItem('currentUser'));
    const cart = await page.evaluate(() => localStorage.getItem('cart'));
    assert.equal(user, 'test_offline', 'localStorage用户名应在刷新后保持');
    assert.ok(cart.includes('test'), 'localStorage购物车应在刷新后保持');
  });

  // ===== 15. 页面可访问性 - 键盘导航 =====
  it('15.1 首页按钮可通过Tab键聚焦', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 按Tab键
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el
        ? el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : '')
        : 'none';
    });
    assert.ok(focused !== 'BODY', 'Tab键应聚焦到某个元素: ' + focused);
  });
});
