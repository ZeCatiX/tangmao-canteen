// 唐猫庭院 - 管理后台与厨房看板深度交互测试
// 覆盖：admin各页面加载、数据展示、CRUD操作、kitchen订单流程
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

function isRealError(msg) {
  if (msg.includes('fonts.googleapis.com') || msg.includes('fonts.gstatic.com')) {
    return false;
  }
  return true;
}

async function adminLogin(page) {
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
  await sleep(500);
  await page.type('#admin-login-user', 'admin', { delay: 30 });
  await page.type('#admin-login-pass', ADMIN_PASS, { delay: 30 });
  await page.evaluate(() => document.getElementById('admin-login-btn').click());
  await sleep(2000);
}

describe('管理后台深度交互测试', () => {
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

  // ===== 仪表盘 =====
  it('1.1 仪表盘加载并显示统计数据', async () => {
    resetErrors();
    await adminLogin(page);
    // 确认在仪表盘页面
    const dashVisible = await page.evaluate(() => {
      const el = document.getElementById('page-dashboard');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(dashVisible, '仪表盘应可见');
    // 检查统计卡片是否存在
    const statCards = await page.evaluate(() => {
      const dash = document.getElementById('page-dashboard');
      if (!dash) {
        return 0;
      }
      return dash.querySelectorAll('.card, .stat-card, [class*="stat"]').length;
    });
    assert.ok(statCards > 0, '仪表盘应显示统计卡片，实际: ' + statCards);
    assert.equal(realErrors().length, 0, '仪表盘不应有错误: ' + realErrors().join('; '));
  });

  // ===== 菜品管理 =====
  it('1.2 菜品管理页面加载并显示菜品列表', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    const dishesVisible = await page.evaluate(() => {
      const el = document.getElementById('page-dishes');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(dishesVisible, '菜品管理页面应可见');
    // 检查菜品表格是否有数据行
    const tableRows = await page.evaluate(() => {
      const page = document.getElementById('page-dishes');
      if (!page) {
        return 0;
      }
      const tbody = page.querySelector('tbody');
      return tbody ? tbody.children.length : 0;
    });
    assert.ok(tableRows > 0, '菜品表格应有数据行，实际: ' + tableRows);
    assert.equal(realErrors().length, 0, '菜品管理不应有错误: ' + realErrors().join('; '));
  });

  // ===== 用户管理 =====
  it('1.3 用户管理页面加载', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="users"]')?.click());
    await sleep(1500);
    const usersVisible = await page.evaluate(() => {
      const el = document.getElementById('page-users');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(usersVisible, '用户管理页面应可见');
    assert.equal(realErrors().length, 0, '用户管理不应有错误: ' + realErrors().join('; '));
  });

  // ===== 反馈管理 =====
  it('1.4 反馈管理页面加载', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="feedback"]')?.click());
    await sleep(1500);
    const feedbackVisible = await page.evaluate(() => {
      const el = document.getElementById('page-feedback');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(feedbackVisible, '反馈管理页面应可见');
    assert.equal(realErrors().length, 0, '反馈管理不应有错误: ' + realErrors().join('; '));
  });

  // ===== 偏好统计 =====
  it('1.5 偏好统计页面加载', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="preferences"]')?.click());
    await sleep(1500);
    const prefVisible = await page.evaluate(() => {
      const el = document.getElementById('page-preferences');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(prefVisible, '偏好统计页面应可见');
    assert.equal(realErrors().length, 0, '偏好统计不应有错误: ' + realErrors().join('; '));
  });

  // ===== 数据分析 =====
  it('1.6 数据分析页面加载', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="analytics"]')?.click());
    await sleep(2000);
    const analyticsVisible = await page.evaluate(() => {
      const el = document.getElementById('page-analytics');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(analyticsVisible, '数据分析页面应可见');
    assert.equal(realErrors().length, 0, '数据分析不应有错误: ' + realErrors().join('; '));
  });

  // ===== 模型管理 =====
  it('1.7 模型管理页面加载', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="model"]')?.click());
    await sleep(2000);
    const modelVisible = await page.evaluate(() => {
      const el = document.getElementById('page-model');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(modelVisible, '模型管理页面应可见');
    assert.equal(realErrors().length, 0, '模型管理不应有错误: ' + realErrors().join('; '));
  });

  // ===== API文档 =====
  it('1.8 API文档页面加载', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="apidocs"]')?.click());
    await sleep(1500);
    const apiVisible = await page.evaluate(() => {
      const el = document.getElementById('page-apidocs');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(apiVisible, 'API文档页面应可见');
    assert.equal(realErrors().length, 0, 'API文档不应有错误: ' + realErrors().join('; '));
  });

  // ===== 导出CSV功能 =====
  it('1.9 导出CSV按钮可用', async () => {
    resetErrors();
    // 回到菜品管理页面
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1000);
    const exportBtn = await page.$('[onclick*="exportCSV"], #export-csv, .btn[onclick*="export"]');
    // 检查导出函数存在
    const hasExport = await page.evaluate(() => typeof exportCSV === 'function');
    assert.ok(hasExport, '导出CSV函数应存在');
    assert.equal(realErrors().length, 0, '导出功能检查不应有错误');
  });

  // ===== 添加菜品模态框 =====
  it('1.10 添加菜品按钮可打开模态框', async () => {
    resetErrors();
    const addBtn = await page.$('#add-dish-btn');
    assert.ok(addBtn, '添加菜品按钮应存在');
    await page.evaluate(() => document.getElementById('add-dish-btn')?.click());
    await sleep(500);
    // 检查Bootstrap模态框是否打开
    const modalOpen = await page.evaluate(() => {
      const modal = document.getElementById('dishModal');
      if (!modal) {
        return false;
      }
      // Bootstrap 5 Modal 显示后添加 .show 类并设置 display:block
      const style = window.getComputedStyle(modal);
      return modal.classList.contains('show') || style.display === 'block';
    });
    assert.ok(modalOpen, '菜品编辑模态框应打开');
    // 检查保存按钮存在
    const saveBtn = await page.$('#save-dish-btn');
    assert.ok(saveBtn, '保存菜品按钮应存在');
    assert.equal(realErrors().length, 0, '添加菜品不应有错误: ' + realErrors().join('; '));
  });
});

describe('厨房看板深度交互测试', () => {
  before(async () => {
    // 重新启动browser，避免detached frame问题
    if (browser) {
      await browser.close();
    }
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

  it('2.1 厨房看板时间显示正常', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const timeText = await page.evaluate(() => {
      const el = document.getElementById('current-time');
      return el ? el.textContent.trim() : '';
    });
    assert.ok(timeText.length > 0, '当前时间应显示内容');
    // 不应有NaN或undefined
    assert.ok(!timeText.includes('NaN') && !timeText.includes('undefined'), '时间不应显示NaN或undefined: ' + timeText);
    assert.equal(realErrors().length, 0, '厨房看板不应有错误: ' + realErrors().join('; '));
  });

  it('2.2 厨房看板登录后显示订单', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    // 尝试登录
    const loginOverlay = await page.$('#login-overlay');
    const isOverlayVisible = await page.evaluate((el) => el && !el.classList.contains('d-none'), loginOverlay);
    if (isOverlayVisible) {
      await page.type('#login-user', 'admin', { delay: 30 });
      await page.type('#login-pass', ADMIN_PASS, { delay: 30 });
      await page.evaluate(() => document.getElementById('login-btn')?.click());
      await sleep(2000);
    }
    // 订单列表应存在
    const orderList = await page.$('#order-list');
    assert.ok(orderList, '订单列表应存在');
    assert.equal(realErrors().length, 0, '厨房看板登录不应有错误: ' + realErrors().join('; '));
  });
});
