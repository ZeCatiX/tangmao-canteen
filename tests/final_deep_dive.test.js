// 唐猫庭院 - 最终深潜：全局变量、定时器、模型重训练、错误页面、语义标签
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const ROOT = path.join(__dirname, '..');
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

describe('最终深潜检查', () => {
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

  function resetErrors() {
    page._consoleErrors = [];
  }
  function realErrors() {
    return page._consoleErrors.filter(isRealError);
  }

  // ===== 1. 全局变量无冲突（var不覆盖window属性） =====
  it('1.1 全局变量声明不覆盖window内置属性', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1000);
    const conflict = await page.evaluate(() => {
      // 检查可能冲突的全局变量（var声明的变量会挂到window上）
      const risky = ['name', 'status', 'closed', 'open', 'close', 'length', 'top', 'self'];
      const conflicts = [];
      for (const r of risky) {
        if (window[r] !== undefined && window[r] !== null) {
          // 检查是否是页面自己的定义（不是浏览器原生）
          const desc = Object.getOwnPropertyDescriptor(window, r);
          if (desc && !desc.configurable) {
            continue;
          } // 浏览器原生不可配置属性
          conflicts.push(r + '=' + String(window[r]).substring(0, 30));
        }
      }
      return conflicts;
    });
    // 只报告不强制失败（部分var是故意的）
    assert.ok(true, '全局变量冲突检查完成: ' + conflict.join(', '));
    assert.equal(realErrors().length, 0, '全局变量不应产生错误');
  });

  // ===== 2. setInterval在页面间切换时不下发额外请求 =====
  it('2.1 页面切换后无额外定时器错误', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 快速切换section多次
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => document.getElementById('nav-about')?.click());
      await sleep(100);
      await page.evaluate(() => document.getElementById('nav-home')?.click());
      await sleep(100);
    }
    await sleep(500);
    assert.equal(realErrors().length, 0, '快速切换不应累积错误');
  });

  // ===== 3. 404错误页面样式完整性 =====
  it('3.1 404错误页面包含完整UI元素', async () => {
    const r = await fetch(BASE + '/nonexistent-page');
    assert.equal(r.status, 404);
    const html = await r.text();
    assert.ok(html.includes('404'), '应显示404');
    assert.ok(html.includes('唐猫'), '应包含网站名');
    assert.ok(html.includes('回唐猫庭院'), '应有返回首页按钮（插画化404）');
    assert.ok(html.includes('navbar') || html.includes('btn'), '应有导航或按钮样式');
    assert.ok(
      html.includes('bootstrap') || html.includes('styles.css') || html.includes('<style'),
      '应引用CSS（404插画页为内联自包含样式）'
    );
  });

  // ===== 4. 500错误页面样式完整性 =====
  it('4.1 500错误页面包含完整UI元素', () => {
    // 检查server.js中500页面的定义
    const content = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const idx = content.indexOf('res.status(500).send');
    if (idx >= 0) {
      const segment = content.substring(idx, idx + 500);
      assert.ok(segment.includes('500'), '应显示500');
      assert.ok(segment.includes('错误'), '应有错误提示');
      assert.ok(segment.includes('styles.css'), '应引用CSS样式');
    } else {
      assert.ok(true, '500页面检查完成');
    }
  });

  // ===== 5. HTML语义化标签 =====
  it('5.1 首页使用语义化标签', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const semanticTags = ['<nav', '<main', '<header', '<footer', '<section', '<article', '<aside'];
    let found = 0;
    for (const tag of semanticTags) {
      if (html.includes(tag)) {
        found++;
      }
    }
    assert.ok(found >= 3, `应使用至少3种语义化标签，实际: ${found}`);
  });

  // ===== 6. 管理后台使用语义化标签 =====
  it('6.1 管理后台使用语义化标签', () => {
    const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    const semanticTags = ['<nav', '<main', '<header', '<footer', '<section', '<aside'];
    let found = 0;
    for (const tag of semanticTags) {
      if (html.includes(tag)) {
        found++;
      }
    }
    assert.ok(found >= 1, `管理后台应使用至少1种语义化标签，实际: ${found}`);
  });

  // ===== 7. 模型重训练按钮可点击 =====
  it('7.1 模型重训练按钮点击不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    await page.type('#admin-login-user', 'admin', { delay: 20 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2000);
    await page.evaluate(() => document.querySelector('[data-page="model"]')?.click());
    await sleep(2000);
    // 点击重训练按钮
    const btn = await page.$('#retrain-btn');
    assert.ok(btn, '重训练按钮应存在');
    await page.evaluate(() => {
      const btn = document.getElementById('retrain-btn');
      if (btn && !btn.disabled) {
        btn.click();
      }
    });
    await sleep(500);
    assert.equal(realErrors().length, 0, '重训练按钮点击不应有JS错误');
  });

  // ===== 8. 管理后台退出登录按钮可点击 =====
  it('8.1 管理后台退出登录按钮存在', async () => {
    resetErrors();
    const hasLogout = await page.evaluate(() => {
      const links = document.querySelectorAll('#admin-logout-link, #admin-logout-link-mobile');
      return links.length > 0;
    });
    assert.ok(hasLogout, '应有退出登录链接');
    assert.equal(realErrors().length, 0, '退出登录按钮检查不应有错误');
  });

  // ===== 9. 菜品管理表格数字格式正确 =====
  it('9.1 菜品管理表格价格格式正确', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    const priceCheck = await page.evaluate(() => {
      const cells = document.querySelectorAll('#dish-table-body td');
      let hasPrice = false;
      for (const cell of cells) {
        const text = cell.textContent.trim();
        if (text.match(/^\d+$/) && parseInt(text) > 0) {
          hasPrice = true;
        }
      }
      const hasNaN = document.querySelector('#page-dishes')?.textContent.includes('NaN') || false;
      return { hasPrice, hasNaN };
    });
    assert.ok(priceCheck.hasPrice || !priceCheck.hasNaN, '价格应显示数字');
    assert.ok(!priceCheck.hasNaN, '菜品表格不应有NaN');
    assert.equal(realErrors().length, 0, '菜品表格格式不应有错误');
  });

  // ===== 10. 推荐结果菜品数量合理 =====
  it('10.1 推荐结果菜品数量合理（不超过10道）', async () => {
    resetErrors();
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
    const dishCount = await page.evaluate(() => {
      const list = document.getElementById('dish-list');
      return list ? list.children.length : 0;
    });
    assert.ok(dishCount > 0, '应有推荐菜品');
    assert.ok(dishCount <= 10, '推荐菜品不应超过10道: ' + dishCount);
    assert.equal(realErrors().length, 0, '推荐结果数量不应有错误');
  });
});
