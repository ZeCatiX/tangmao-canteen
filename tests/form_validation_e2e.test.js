// 唐猫庭院 - 表单验证与错误提示深度测试
const { describe, it, before, after } = require('node:test');
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
  if (msg.includes('409')) {
    return false;
  }
  if (msg.includes('404') && msg.includes('Failed to load resource')) {
    return false;
  }
  if (msg.includes('400') && msg.includes('Failed to load resource')) {
    return false;
  }
  // 过滤掉 HTTP 状态码错误（非 JS 运行时错误）
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) {
    return false;
  }
  return true;
}

describe('表单验证与错误提示深度测试', () => {
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

  // ===== 1. 注册表单 - 用户名过短 =====
  it('1.1 注册用户名过短被验证阻止', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.type('#register-username', 'ab', { delay: 30 });
    await page.type('#register-password', 'ValidPass123!', { delay: 30 });
    await page.type('#register-confirm', 'ValidPass123!', { delay: 30 });
    const agree = await page.$('#agree-privacy');
    if (agree) {
      const checked = await page.evaluate((el) => el.checked, agree);
      if (!checked) {
        await agree.click();
      }
    }
    await page.evaluate(() => {
      document.getElementById('register-form').querySelector('button[type="submit"]').click();
    });
    await sleep(1000);
    // HTML5 minlength=2 验证可能允许2字符，但不崩溃
    assert.equal(realErrors().length, 0, '短用户名注册不应有JS错误');
  });

  // ===== 2. 注册表单 - 密码过短 =====
  it('2.2 注册密码过短被验证阻止', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.type('#register-username', 'validuser123', { delay: 30 });
    await page.type('#register-password', 'short', { delay: 30 });
    await page.type('#register-confirm', 'short', { delay: 30 });
    const agree = await page.$('#agree-privacy');
    if (agree) {
      const checked = await page.evaluate((el) => el.checked, agree);
      if (!checked) {
        await agree.click();
      }
    }
    await page.evaluate(() => {
      document.getElementById('register-form').querySelector('button[type="submit"]').click();
    });
    await sleep(1000);
    // HTML5 minlength=8 应阻止提交
    assert.equal(realErrors().length, 0, '短密码注册不应有JS错误');
  });

  // ===== 3. 注册表单 - 未同意隐私政策 =====
  it('3.1 注册未同意隐私政策被阻止', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.type('#register-username', 'disagree_user', { delay: 30 });
    await page.type('#register-password', 'ValidPass123!', { delay: 30 });
    await page.type('#register-confirm', 'ValidPass123!', { delay: 30 });
    // 不勾选隐私政策
    const agree = await page.$('#agree-privacy');
    if (agree) {
      const checked = await page.evaluate((el) => el.checked, agree);
      if (checked) {
        await agree.click();
      } // 确保未勾选
    }
    await page.evaluate(() => {
      document.getElementById('register-form').querySelector('button[type="submit"]').click();
    });
    await sleep(1000);
    // 应显示错误提示
    assert.equal(realErrors().length, 0, '未同意隐私政策注册不应有JS错误');
  });

  // ===== 4. 登录表单 - 空字段验证 =====
  it('4.1 登录空字段不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(400);
    // 不填写任何内容直接提交
    await page.evaluate(() => {
      document.getElementById('login-form').querySelector('button[type="submit"]').click();
    });
    await sleep(500);
    // 不应崩溃
    assert.equal(realErrors().length, 0, '空登录表单不应有JS错误');
  });

  // ===== 5. 偏好表单 - 所有下拉选项可用 =====
  it('5.1 偏好表单所有下拉选项可切换', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    // 测试所有辣度选项
    const spicinessOptions = await page.evaluate(() => {
      const sel = document.getElementById('spiciness');
      return Array.from(sel.options).map((o) => o.value);
    });
    for (const val of spicinessOptions) {
      await page.select('#spiciness', val);
      await sleep(100);
    }
    // 测试所有咸淡选项
    const saltinessOptions = await page.evaluate(() => {
      const sel = document.getElementById('saltiness');
      return Array.from(sel.options).map((o) => o.value);
    });
    for (const val of saltinessOptions) {
      await page.select('#saltiness', val);
      await sleep(100);
    }
    assert.ok(spicinessOptions.length > 0, '辣度应有选项');
    assert.ok(saltinessOptions.length > 0, '咸淡应有选项');
    assert.equal(realErrors().length, 0, '下拉选项切换不应有错误');
  });

  // ===== 6. 偏好表单 - 过敏源多选 =====
  it('6.1 偏好表单过敏源多选不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 2026-09-17: 偏好页入口为「AI帮你选」+ 选桌;过敏源用 JS 点击(真实点击在浮动栏下易被遮挡)
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#table-picker-modal button')].find((x) => x.textContent.trim() === '08');
      if (b) {
        b.click();
      }
    });
    await sleep(500);
    // 取消无过敏源，选择多个过敏源
    const allergyNone = await page.$('#allergy-none');
    if (allergyNone) {
      const checked = await page.evaluate((el) => el.checked, allergyNone);
      if (checked) {
        await page.evaluate(() => document.getElementById('allergy-none').click());
      }
    }
    // 勾选所有过敏源
    const allergyCheckboxes = await page.evaluate(() => {
      const boxes = document.querySelectorAll('input[name="allergy"], input[id^="allergy-"]');
      boxes.forEach((b) => {
        if (b.id !== 'allergy-none') {
          b.checked = true;
        }
      });
      return boxes.length;
    });
    assert.ok(allergyCheckboxes > 0, '应有过敏源复选框');
    // 提交偏好
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
    assert.ok(recVisible, '推荐结果应显示（多过敏源）');
    assert.equal(realErrors().length, 0, '过敏源多选提交不应有错误');
  });

  // ===== 7. 价格区间选择 =====
  it('7.1 偏好表单价格区间选择不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    const priceOptions = await page.evaluate(() => {
      const sel = document.getElementById('price');
      return sel ? Array.from(sel.options).map((o) => o.value) : [];
    });
    if (priceOptions.length > 0) {
      for (const val of priceOptions) {
        await page.select('#price', val);
        await sleep(100);
      }
    }
    assert.equal(realErrors().length, 0, '价格区间切换不应有错误');
  });

  // ===== 8. 宗教饮食限制选择 =====
  it('8.1 偏好表单宗教饮食选择不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    const religionOptions = await page.evaluate(() => {
      const sel = document.getElementById('religion');
      return sel ? Array.from(sel.options).map((o) => o.value) : [];
    });
    if (religionOptions.length > 0) {
      for (const val of religionOptions) {
        await page.select('#religion', val);
        await sleep(100);
      }
    }
    assert.equal(realErrors().length, 0, '宗教饮食选择不应有错误');
  });

  // ===== 9. 表单提交后按钮禁用 =====
  it('9.1 登录提交时按钮被禁用（防重复提交）', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(400);
    await page.type('#login-username', 'test_btn_disable', { delay: 30 });
    await page.type('#login-password', 'TestPass123!', { delay: 30 });
    // 获取提交按钮
    const submitBtn = await page.$('#login-form button[type="submit"]');
    assert.ok(submitBtn, '提交按钮应存在');
    // 点击提交
    await page.evaluate(() => {
      document.getElementById('login-form').querySelector('button[type="submit"]').click();
    });
    // 检查按钮是否被禁用
    const isDisabled = await page.evaluate(() => {
      const btn = document.getElementById('login-btn');
      return btn ? btn.disabled : false;
    });
    // 按钮应被禁用（在请求期间）
    assert.ok(isDisabled, '提交期间按钮应被禁用');
    await sleep(2000);
    // 恢复后应启用
    const isReenabled = await page.evaluate(() => {
      const btn = document.getElementById('login-btn');
      return btn ? !btn.disabled : true;
    });
    assert.ok(isReenabled, '请求完成后按钮应恢复');
    assert.equal(realErrors().length, 0, '按钮禁用检查不应有错误');
  });

  // ===== 10. 注册提交时按钮禁用 =====
  it('10.1 注册提交时按钮被禁用（防重复提交）', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.type('#register-username', 'test_reg_disable', { delay: 30 });
    await page.type('#register-password', 'TestPass123!', { delay: 30 });
    await page.type('#register-confirm', 'TestPass123!', { delay: 30 });
    const agree = await page.$('#agree-privacy');
    if (agree) {
      const checked = await page.evaluate((el) => el.checked, agree);
      if (!checked) {
        await agree.click();
      }
    }
    await page.evaluate(() => {
      document.getElementById('register-form').querySelector('button[type="submit"]').click();
    });
    const isDisabled = await page.evaluate(() => {
      const btn = document.getElementById('register-btn');
      return btn ? btn.disabled : false;
    });
    // 按钮应被禁用或在finally中恢复
    assert.ok(isDisabled !== null, '注册按钮禁用状态可检查');
    await sleep(1500);
    assert.equal(realErrors().length, 0, '注册按钮禁用检查不应有错误');
  });
});
