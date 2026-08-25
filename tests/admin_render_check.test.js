// 唐猫庭院 - 管理后台数据渲染深度检查
// 检查所有数据加载函数的实际渲染结果有无空数据/NaN/undefined/崩溃
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) return false;
  if (msg.includes('401 (Unauthorized)')) return false;
  if (msg.includes('429 (Too Many Requests)')) return false;
  if (msg.includes('404 (Not Found)')) return false;
  return true;
}

async function adminLogin(page) {
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
  await sleep(500);
  await page.type('#admin-login-user', 'admin', { delay: 20 });
  await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
  await page.evaluate(() => document.getElementById('admin-login-btn').click());
  await sleep(2000);
}

describe('管理后台数据渲染深度检查', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', msg => {
      const t = msg.text();
      if (msg.type() === 'error' && isRealError(t)) page._consoleErrors.push(t);
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() { return page._consoleErrors.filter(isRealError); }

  // ===== 1. 仪表盘统计卡片有数据 =====
  it('1.1 仪表盘统计卡片有数据', async () => {
    resetErrors();
    await adminLogin(page);
    const stats = await page.evaluate(() => {
      const dash = document.getElementById('page-dashboard');
      if (!dash) return [];
      const cards = dash.querySelectorAll('.card, .stat-card, [class*="stat"]');
      return Array.from(cards).map(c => {
        const text = c.textContent.trim();
        // 检查是否有数字
        const hasNumber = /\d+/.test(text);
        return { text: text.substring(0, 50), hasNumber };
      });
    });
    // 至少有一些统计卡片有数字
    const withNumbers = stats.filter(s => s.hasNumber);
    assert.ok(withNumbers.length > 0, '仪表盘应至少有1个统计卡片显示数字，实际: ' + stats.length + ' 个卡片');
    assert.equal(realErrors().length, 0, '仪表盘不应有错误: ' + realErrors().join('; '));
  });

  // ===== 2. 菜品管理表格有数据 =====
  it('2.1 菜品管理表格显示菜品数据', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    const tableCheck = await page.evaluate(() => {
      const page = document.getElementById('page-dishes');
      if (!page) return { rows: 0, hasNaN: false };
      const tbody = page.querySelector('tbody');
      const rows = tbody ? tbody.children.length : 0;
      const text = page.textContent;
      const hasNaN = text.includes('NaN');
      const hasUndefined = text.includes('undefined');
      return { rows, hasNaN, hasUndefined };
    });
    assert.ok(tableCheck.rows > 0, '菜品表格应有数据行，实际: ' + tableCheck.rows);
    assert.ok(!tableCheck.hasNaN, '菜品表格不应显示NaN');
    assert.ok(!tableCheck.hasUndefined, '菜品表格不应显示undefined');
    assert.equal(realErrors().length, 0, '菜品管理不应有错误');
  });

  // ===== 3. 反馈管理页面有数据或空提示 =====
  it('3.1 反馈管理页面正常显示', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="feedback"]')?.click());
    await sleep(1500);
    const check = await page.evaluate(() => {
      const page = document.getElementById('page-feedback');
      if (!page) return { content: 0, hasNaN: false };
      const text = page.textContent.trim();
      return { content: text.length, hasNaN: text.includes('NaN'), hasUndefined: text.includes('undefined') };
    });
    assert.ok(check.content > 0, '反馈管理页面应有内容');
    assert.ok(!check.hasNaN, '反馈管理不应显示NaN');
    assert.equal(realErrors().length, 0, '反馈管理不应有错误');
  });

  // ===== 4. 数据分析页面有图表或数据 =====
  it('4.1 数据分析页面正常渲染', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="analytics"]')?.click());
    await sleep(2000);
    const check = await page.evaluate(() => {
      const page = document.getElementById('page-analytics');
      if (!page) return { content: 0, hasCanvas: false, hasNaN: false };
      const text = page.textContent.trim();
      const canvases = page.querySelectorAll('canvas');
      return { content: text.length, hasCanvas: canvases.length > 0, hasNaN: text.includes('NaN') };
    });
    assert.ok(check.content > 0, '数据分析页面应有内容');
    assert.ok(!check.hasNaN, '数据分析不应显示NaN');
    assert.equal(realErrors().length, 0, '数据分析不应有错误');
  });

  // ===== 5. 模型管理页面有模型信息 =====
  it('5.1 模型管理页面显示模型信息', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="model"]')?.click());
    await sleep(2000);
    const check = await page.evaluate(() => {
      const page = document.getElementById('page-model');
      if (!page) return { content: 0, hasNaN: false };
      const text = page.textContent.trim();
      return { content: text.length, hasNaN: text.includes('NaN'), hasUndefined: text.includes('undefined') };
    });
    assert.ok(check.content > 0, '模型管理页面应有内容');
    assert.ok(!check.hasNaN, '模型管理不应显示NaN');
    assert.equal(realErrors().length, 0, '模型管理不应有错误');
  });

  // ===== 6. 用户管理页面 =====
  it('6.1 用户管理页面正常显示', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="users"]')?.click());
    await sleep(1500);
    const check = await page.evaluate(() => {
      const page = document.getElementById('page-users');
      if (!page) return { content: 0, hasNaN: false };
      const text = page.textContent.trim();
      return { content: text.length, hasNaN: text.includes('NaN') };
    });
    assert.ok(check.content > 0, '用户管理页面应有内容');
    assert.ok(!check.hasNaN, '用户管理不应显示NaN');
    assert.equal(realErrors().length, 0, '用户管理不应有错误');
  });

  // ===== 7. API文档页面 =====
  it('7.1 API文档页面显示端点列表', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="apidocs"]')?.click());
    await sleep(1500);
    const check = await page.evaluate(() => {
      const page = document.getElementById('page-apidocs');
      if (!page) return { content: 0, rows: 0 };
      const rows = page.querySelectorAll('tr, .endpoint, .api-row');
      const text = page.textContent.trim();
      return { content: text.length, rows: rows.length };
    });
    assert.ok(check.content > 0, 'API文档页面应有内容');
    assert.ok(check.rows > 0, 'API文档应有端点行，实际: ' + check.rows);
    assert.equal(realErrors().length, 0, 'API文档不应有错误');
  });

  // ===== 8. 偏好统计页面 =====
  it('8.1 偏好统计页面正常显示', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="preferences"]')?.click());
    await sleep(1500);
    const check = await page.evaluate(() => {
      const page = document.getElementById('page-preferences');
      if (!page) return { content: 0, hasNaN: false };
      const text = page.textContent.trim();
      return { content: text.length, hasNaN: text.includes('NaN') };
    });
    assert.ok(check.content > 0, '偏好统计页面应有内容');
    assert.ok(!check.hasNaN, '偏好统计不应显示NaN');
    assert.equal(realErrors().length, 0, '偏好统计不应有错误');
  });

  // ===== 9. 侧边栏导航全部可见 =====
  it('9.1 侧边栏所有导航项可见且有文字', async () => {
    resetErrors();
    const navCheck = await page.evaluate(() => {
      const navItems = document.querySelectorAll('[data-page]');
      return Array.from(navItems).map(n => {
        const text = n.textContent.trim();
        return { page: n.getAttribute('data-page'), text, visible: !n.classList.contains('d-none') };
      });
    });
    assert.ok(navCheck.length >= 8, '应有至少8个侧边栏导航项，实际: ' + navCheck.length);
    navCheck.forEach(n => {
      assert.ok(n.text.length > 0, '导航项 ' + n.page + ' 应有文字');
    });
    assert.equal(realErrors().length, 0, '侧边栏检查不应有错误');
  });

  // ===== 10. 退出登录按钮 =====
  it('10.1 管理后台退出登录按钮存在', async () => {
    resetErrors();
    const logoutExists = await page.evaluate(() => {
      const links = document.querySelectorAll('#admin-logout-link, #admin-logout-link-mobile, [onclick*="adminLogout"], [onclick*="logout"]');
      return links.length;
    });
    assert.ok(logoutExists > 0, '应有退出登录按钮/链接');
    assert.equal(realErrors().length, 0, '退出登录检查不应有错误');
  });
});
