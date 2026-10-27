// 唐猫庭院 - 错误处理与边界情况彻查
// 检查：空数据响应、网络错误处理、并发请求、表单验证
const { describe, it, before, after } = require('node:test');

// 真实菜品 ID 池(2026-09-17)
const dishPool = [];
const assert = require('node:assert');
const puppeteer = require('puppeteer');

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
  return true;
}

describe('错误处理与边界情况', () => {
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

  // ===== 1. 空表单提交 =====
  it('1.1 空登录表单提交不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(400);
    // 不填写任何内容直接提交
    await page.evaluate(() => {
      const form = document.getElementById('login-form');
      if (form) {
        form.querySelector('button[type="submit"]').click();
      }
    });
    await sleep(500);
    // 不应崩溃，可能有错误提示
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '不应崩溃');
    assert.equal(realErrors().length, 0, '空表单提交不应有控制台错误: ' + realErrors().join('; '));
  });

  // ===== 2. 空注册表单提交 =====
  it('2.1 空注册表单提交不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate(() => {
      const form = document.getElementById('register-form');
      if (form) {
        form.querySelector('button[type="submit"]').click();
      }
    });
    await sleep(500);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '不应崩溃');
    assert.equal(realErrors().length, 0, '空注册表单提交不应有控制台错误');
  });

  // ===== 3. 注册密码不一致 =====
  it('3.1 注册密码不一致不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.type('#register-username', 'mismatch_user', { delay: 30 });
    await page.type('#register-password', 'PassOne123!', { delay: 30 });
    await page.type('#register-confirm', 'PassTwo456!', { delay: 30 });
    const agreeCheckbox = await page.$('#agree-privacy');
    if (agreeCheckbox) {
      const checked = await page.evaluate((el) => el.checked, agreeCheckbox);
      if (!checked) {
        await agreeCheckbox.click();
      }
    }
    await page.evaluate(() => {
      document.getElementById('register-form').querySelector('button[type="submit"]').click();
    });
    await sleep(500);
    // 应显示错误提示而非崩溃
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '不应崩溃');
    assert.equal(realErrors().length, 0, '密码不一致不应有错误');
  });

  // ===== 4. 重复注册同名用户 =====
  it('4.1 重复注册同名用户不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    // 使用admin作为已存在用户名
    await page.type('#register-username', 'admin', { delay: 30 });
    await page.type('#register-password', 'Duplicate123!', { delay: 30 });
    await page.type('#register-confirm', 'Duplicate123!', { delay: 30 });
    const agreeCheckbox = await page.$('#agree-privacy');
    if (agreeCheckbox) {
      const checked = await page.evaluate((el) => el.checked, agreeCheckbox);
      if (!checked) {
        await agreeCheckbox.click();
      }
    }
    await page.evaluate(() => {
      document.getElementById('register-form').querySelector('button[type="submit"]').click();
    });
    await sleep(1500);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '不应崩溃');
    // 重复注册返回409或错误响应是正常业务逻辑，不是bug
    // 只有真正的JS错误才是问题
    const jsErrors = realErrors().filter((e) => !e.includes('Failed to load resource') && !e.includes('409'));
    assert.equal(jsErrors.length, 0, '重复注册不应有JS错误，实际错误: ' + realErrors().join('; '));
  });

  // ===== 5. 错误密码登录 =====
  it('5.1 错误密码登录不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(400);
    await page.type('#login-username', 'admin', { delay: 30 });
    await page.type('#login-password', 'WrongPassword999!', { delay: 30 });
    await page.evaluate(() => {
      document.getElementById('login-form').querySelector('button[type="submit"]').click();
    });
    await sleep(1500);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '不应崩溃');
    assert.equal(realErrors().length, 0, '错误密码登录不应有错误');
  });

  // ===== 6. 偏好表单不选择任何过敏源 =====
  it('6.1 不选过敏源提交偏好不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#table-picker-modal button')].find((x) => x.textContent.trim() === '08');
      if (b) {
        b.click();
      }
    });
    await sleep(400);
    // 不选择任何过敏源，直接提交
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      document.getElementById('preference-form').querySelector('button[type="submit"]').click();
    });
    await sleep(5000);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '不应崩溃');
    const recVisible = await page.evaluate(() => {
      const el = document.getElementById('recommendation-result');
      return el && !el.classList.contains('d-none');
    });
    assert.ok(recVisible, '推荐结果应显示');
    assert.equal(realErrors().length, 0, '不选过敏源不应有错误');
  });

  // ===== 7. 快速连续切换导航不崩溃 =====
  it('7.1 快速连续切换导航不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 快速连续点击不同导航
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => document.getElementById('nav-about')?.click());
      await page.evaluate(() => document.getElementById('nav-privacy')?.click());
      await page.evaluate(() => document.getElementById('nav-dataset')?.click());
      await page.evaluate(() => document.getElementById('nav-home')?.click());
    }
    await sleep(500);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '快速切换不应崩溃');
    assert.equal(realErrors().length, 0, '快速切换不应有错误');
  });

  // ===== 8. 快速连续提交偏好 =====
  it('8.1 快速连续提交偏好不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#table-picker-modal button')].find((x) => x.textContent.trim() === '08');
      if (b) {
        b.click();
      }
    });
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    // 快速连续点击提交
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        document.getElementById('preference-form').querySelector('button[type="submit"]').click();
      });
    }
    await sleep(5000);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '快速提交不应崩溃');
    assert.equal(realErrors().length, 0, '快速提交不应有错误');
  });

  // ===== 9. 浏览器前进后退 =====
  it('9.1 浏览器后退不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('nav-about')?.click());
    await sleep(300);
    // 使用浏览器后退
    await page.goBack();
    await sleep(500);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '浏览器后退不应崩溃');
    assert.equal(realErrors().length, 0, '浏览器后退不应有错误');
  });

  // ===== 10. 页面刷新后状态保持 =====
  it('10.1 推荐结果页刷新不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#table-picker-modal button')].find((x) => x.textContent.trim() === '08');
      if (b) {
        b.click();
      }
    });
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      document.getElementById('preference-form').querySelector('button[type="submit"]').click();
    });
    await sleep(5000);
    // 刷新页面
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(500);
    const content = await page.content();
    assert.ok(!content.includes('Cannot read'), '刷新不应崩溃');
    assert.equal(realErrors().length, 0, '刷新不应有错误');
  });
});
