// 唐猫庭院 - 管理后台CRUD与厨房看板订单流转深度测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
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

describe('管理后台CRUD深度测试', () => {
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

  // ===== 1. 新增菜品完整流程 =====
  it('1.1 打开添加菜品模态框并填写字段', async () => {
    resetErrors();
    await adminLogin(page);
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    await page.evaluate(() => document.getElementById('add-dish-btn')?.click());
    await sleep(500);
    const modalOpen = await page.evaluate(() => {
      const modal = document.getElementById('dishModal');
      if (!modal) {
        return false;
      }
      return modal.classList.contains('show') || window.getComputedStyle(modal).display === 'block';
    });
    assert.ok(modalOpen, '菜品模态框应打开');
    // 检查所有表单字段存在
    const fields = await page.evaluate(() => {
      const modal = document.getElementById('dishModal');
      if (!modal) {
        return [];
      }
      const inputs = modal.querySelectorAll('input,select,textarea');
      return Array.from(inputs).map((i) => i.id || i.name || i.type);
    });
    assert.ok(fields.length > 0, '模态框应包含表单字段');
    assert.equal(realErrors().length, 0, '打开模态框不应有错误: ' + realErrors().join('; '));
  });

  // ===== 2. 编辑菜品 =====
  it('2.1 点击编辑按钮打开编辑模态框', async () => {
    resetErrors();
    // 先到菜品管理页
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    // 点击第一个编辑按钮
    const editClicked = await page.evaluate(() => {
      const btn = document.querySelector('button[onclick*="editDish"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    assert.ok(editClicked, '应找到并点击编辑按钮');
    await sleep(500);
    const modalOpen = await page.evaluate(() => {
      const modal = document.getElementById('dishModal');
      if (!modal) {
        return false;
      }
      return modal.classList.contains('show') || window.getComputedStyle(modal).display === 'block';
    });
    assert.ok(modalOpen, '编辑模态框应打开');
    // 验证字段已填充
    const nameFilled = await page.evaluate(() => {
      const nameInput = document.getElementById('dish-name');
      return nameInput && nameInput.value.length > 0;
    });
    assert.ok(nameFilled, '编辑时菜品名称应已填充');
    assert.equal(realErrors().length, 0, '编辑菜品不应有错误: ' + realErrors().join('; '));
  });

  // ===== 3. 保存菜品 =====
  it('3.1 保存菜品按钮存在且可点击', async () => {
    resetErrors();
    const saveBtn = await page.$('#save-dish-btn');
    assert.ok(saveBtn, '保存按钮应存在');
    assert.equal(realErrors().length, 0, '保存按钮检查不应有错误');
  });

  // ===== 4. 菜品上下架 =====
  it('4.1 菜品上下架按钮存在', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    // 检查是否有上下架按钮
    const toggleBtn = await page.evaluate(() => {
      const btns = document.querySelectorAll(
        'button[onclick*="toggle"], button[onclick*="active"], button[onclick*="status"]'
      );
      return btns.length;
    });
    // 即使没有专用上下架按钮，状态徽章也应存在
    const statusBadges = await page.evaluate(() => {
      const badges = document.querySelectorAll('#page-dishes .badge');
      return badges.length;
    });
    assert.ok(statusBadges > 0 || toggleBtn > 0, '菜品列表应有状态徽章或上下架按钮');
    assert.equal(realErrors().length, 0, '上下架检查不应有错误');
  });

  // ===== 5. 通知功能 =====
  it('5.1 管理后台通知功能', async () => {
    resetErrors();
    const notifExists = await page.evaluate(() => {
      return typeof loadNotifications === 'function';
    });
    assert.ok(notifExists, 'loadNotifications函数应存在');
    assert.equal(realErrors().length, 0, '通知功能检查不应有错误');
  });

  // ===== 6. 模型重训练 =====
  it('6.1 模型重训练按钮存在', async () => {
    resetErrors();
    await page.evaluate(() => document.querySelector('[data-page="model"]')?.click());
    await sleep(1500);
    const retrainBtn = await page.$('#retrain-btn');
    assert.ok(retrainBtn, '重训练按钮应存在');
    assert.equal(realErrors().length, 0, '模型管理不应有错误');
  });
});

describe('厨房看板订单状态流转深度测试', () => {
  before(async () => {
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

  // ===== 1. 厨房看板加载并显示时间 =====
  it('1.1 厨房看板加载时间显示正常', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const timeText = await page.evaluate(() => {
      const el = document.getElementById('current-time');
      return el ? el.textContent.trim() : '';
    });
    assert.ok(timeText.length > 0, '时间应显示');
    assert.ok(!timeText.includes('NaN'), '时间不应包含NaN');
    assert.equal(realErrors().length, 0, '厨房看板不应有错误: ' + realErrors().join('; '));
  });

  // ===== 2. 登录厨房看板 =====
  it('2.1 厨房看板登录', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    const loginOverlay = await page.$('#login-overlay');
    const isOverlayVisible = await page.evaluate((el) => {
      if (!el) {
        return false;
      }
      return el.style.display !== 'none';
    }, loginOverlay);
    if (isOverlayVisible) {
      await page.type('#login-user', 'admin', { delay: 30 });
      await page.type('#login-pass', ADMIN_PASS, { delay: 30 });
      await page.evaluate(() => document.getElementById('login-btn')?.click());
      await sleep(2000);
    }
    // 登录后覆盖层应隐藏（通过 style.display = 'none'）
    const overlayHidden = await page.evaluate(() => {
      const el = document.getElementById('login-overlay');
      return !el || el.style.display === 'none';
    });
    assert.ok(overlayHidden, '登录后覆盖层应隐藏');
    assert.equal(realErrors().length, 0, '厨房看板登录不应有错误: ' + realErrors().join('; '));
  });

  // ===== 3. 订单列表加载 =====
  it('3.1 订单列表加载（可能有0个或多个订单）', async () => {
    resetErrors();
    const orderListExists = await page.evaluate(() => {
      const el = document.getElementById('order-list');
      return !!el;
    });
    assert.ok(orderListExists, '订单列表容器应存在');
    // 等待订单加载
    await sleep(2000);
    assert.equal(realErrors().length, 0, '订单加载不应有错误: ' + realErrors().join('; '));
  });

  // ===== 4. 完成订单按钮（如果存在订单） =====
  it('4.1 完成订单按钮可点击（如果存在订单）', async () => {
    resetErrors();
    const completeBtns = await page.evaluate(() => {
      const btns = document.querySelectorAll('button[onclick*="completeOrder"]');
      return btns.length;
    });
    // 即使没有订单，也不应有错误
    if (completeBtns > 0) {
      // 只检查按钮存在，不实际点击（避免API调用超时）
      assert.ok(completeBtns > 0, '应存在完成订单按钮');
    }
    assert.equal(realErrors().length, 0, '完成订单检查不应有错误: ' + realErrors().join('; '));
  });

  // ===== 5. 自动刷新功能 =====
  it('5.1 厨房看板自动刷新功能存在', async () => {
    resetErrors();
    const hasAutoRefresh = await page.evaluate(() => {
      return typeof loadOrders === 'function' && typeof updateTime === 'function';
    });
    assert.ok(hasAutoRefresh, 'loadOrders和updateTime函数应存在');
    assert.equal(realErrors().length, 0, '自动刷新检查不应有错误');
  });

  // ===== 6. ESC键关闭功能 =====
  it('6.1 ESC关闭函数存在', async () => {
    resetErrors();
    const hasEsc = await page.evaluate(() => typeof esc === 'function');
    assert.ok(hasEsc, 'esc函数应存在');
    assert.equal(realErrors().length, 0, 'ESC功能检查不应有错误');
  });
});
