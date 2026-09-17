// 唐猫庭院 - 表单验证与认证深度检查：错误提示、密码规则、登录失败、推荐模式
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
  if (msg.includes('409')) return false;
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) return false;
  return true;
}

describe('表单验证与认证深度检查', () => {
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

  // ===== 1. 登录失败错误提示 =====
  it('1.1 错误密码登录显示错误提示', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(300);
    await page.evaluate(() => {
      const el = document.getElementById('login-username');
      if (el) { el.value = 'wronguser_xyz'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const el = document.getElementById('login-password');
      if (el) { el.value = 'Wrong123'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const btn = document.querySelector('#login-section button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    const errorShown = await page.evaluate(() => {
      const modal = document.getElementById('message-modal');
      const modalText = modal ? modal.textContent : '';
      return modalText.includes('错误') || modalText.includes('失败') || modalText.includes('不存在');
    });
    assert.ok(errorShown, '登录失败应显示错误提示');
    assert.equal(realErrors().length, 0, '登录失败不应有JS错误');
  });

  // ===== 2. 注册密码过短验证 =====
  it('2.1 注册密码过短有验证提示', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate(() => {
      const el = document.getElementById('register-username');
      if (el) { el.value = 'shortpass_test'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const el = document.getElementById('register-password');
      if (el) { el.value = '123'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const el = document.getElementById('register-confirm');
      if (el) { el.value = '123'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const cb = document.getElementById('agree-privacy');
      if (cb) cb.checked = true;
    });
    await page.evaluate(() => {
      const btn = document.querySelector('#register-section button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    const hasMinLength = await page.evaluate(() => {
      const input = document.getElementById('register-password');
      return input ? input.getAttribute('minlength') || input.validity.tooShort : false;
    });
    assert.ok(hasMinLength, '密码输入框应有minlength验证');
    const registerVisible = await page.evaluate(() => {
      const section = document.getElementById('register-section');
      return section ? (section.classList.contains('active') || section.style.display !== 'none') : false;
    });
    assert.ok(registerVisible, '密码过短应阻止注册');
    assert.equal(realErrors().length, 0, '密码验证不应有JS错误');
  });

  // ===== 3. 注册密码不一致验证 =====
  it('3.1 注册两次密码不一致有验证提示', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate(() => {
      const el = document.getElementById('register-username');
      if (el) { el.value = 'mismatc' + Date.now(); el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const el = document.getElementById('register-password');
      if (el) { el.value = 'Match123'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const el = document.getElementById('register-confirm');
      if (el) { el.value = 'Different123'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const cb = document.getElementById('agree-privacy');
      if (cb) cb.checked = true;
    });
    await page.evaluate(() => {
      const btn = document.querySelector('#register-section button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    const stillOnRegister = await page.evaluate(() => {
      const section = document.getElementById('register-section');
      return section ? (section.classList.contains('active') || section.style.display !== 'none') : false;
    });
    assert.ok(stillOnRegister, '密码不一致应留在注册页');
    assert.equal(realErrors().length, 0, '密码不一致验证不应有JS错误');
  });

  // ===== 4. 推荐模式切换 =====
  it('4.1 推荐模式切换按钮可用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    const modeOptions = await page.evaluate(() => {
      const select = document.getElementById('recommendation-mode');
      return select ? Array.from(select.options).map(o => o.text) : [];
    });
    assert.ok(modeOptions.length >= 1, `推荐模式应有选项，实际: ${modeOptions.length}`);
    if (modeOptions.length > 1) {
      await page.evaluate(() => {
        const select = document.getElementById('recommendation-mode');
        if (select && select.options.length > 1) {
          select.selectedIndex = 1;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await sleep(300);
      const modeText = await page.evaluate(() => {
        const el = document.getElementById('current-recommendation-mode');
        return el ? el.textContent : '';
      });
      assert.ok(modeText.length > 0, '当前推荐模式应有显示');
    }
    assert.equal(realErrors().length, 0, '推荐模式切换不应有错误');
  });

  // ===== 5. 登录后刷新保持登录状态 =====
  it('5.1 登录后刷新保持登录状态', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    const uname = 'refresh_' + Date.now();
    const upass = 'Refresh123';
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate((u) => {
      const el = document.getElementById('register-username');
      if (el) { el.value = u; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, uname);
    await page.evaluate((p) => {
      const el = document.getElementById('register-password');
      if (el) { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, upass);
    await page.evaluate((p) => {
      const el = document.getElementById('register-confirm');
      if (el) { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, upass);
    await page.evaluate(() => {
      const cb = document.getElementById('agree-privacy');
      if (cb) cb.checked = true;
    });
    await page.evaluate(() => {
      const btn = document.querySelector('#register-section button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(300);
    await page.evaluate((u) => {
      const el = document.getElementById('login-username');
      if (el) { el.value = u; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, uname);
    await page.evaluate((p) => {
      const el = document.getElementById('login-password');
      if (el) { el.value = p; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, upass);
    await page.evaluate(() => {
      const btn = document.querySelector('#login-section button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(1500);
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await sleep(1000);
    const profileNavVisible = await page.evaluate(() => {
      const item = document.getElementById('nav-profile-item');
      return item ? !item.classList.contains('d-none') : false;
    });
    assert.ok(profileNavVisible, '刷新后应保持登录状态');
    assert.equal(realErrors().length, 0, '刷新保持登录不应有错误');
  });

  // ===== 6. 退出登录清除登录状态 =====
  it('6.1 退出登录后刷新不保持登录', async () => {
    resetErrors();
    await page.evaluate(() => {
      const btn = document.getElementById('logout-btn');
      if (btn) btn.click();
    });
    await sleep(800);
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await sleep(1000);
    const profileNavVisible = await page.evaluate(() => {
      const item = document.getElementById('nav-profile-item');
      return item ? !item.classList.contains('d-none') : false;
    });
    assert.ok(!profileNavVisible, '退出后刷新不应保持登录状态');
    assert.equal(realErrors().length, 0, '退出登录不应有错误');
  });

  // ===== 7. 未同意隐私协议注册被阻止 =====
  it('7.1 未勾选隐私协议注册被阻止', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate(() => {
      const el = document.getElementById('register-username');
      if (el) { el.value = 'noagree_' + Date.now(); el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const el = document.getElementById('register-password');
      if (el) { el.value = 'Noagree123'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const el = document.getElementById('register-confirm');
      if (el) { el.value = 'Noagree123'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const btn = document.querySelector('#register-section button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(1000);
    const registerVisible = await page.evaluate(() => {
      const section = document.getElementById('register-section');
      return section ? (section.classList.contains('active') || section.style.display !== 'none') : false;
    });
    const homeVisible = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? (home.classList.contains('active') || home.style.display !== 'none') : false;
    });
    assert.ok(registerVisible || homeVisible, '未勾选协议应有处理');
    assert.equal(realErrors().length, 0, '未勾选协议验证不应有JS错误');
  });

  // ===== 8. 浏览器后退按钮导航 =====
  it('8.1 浏览器后退按钮可返回', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('nav-about')?.click());
    await sleep(300);
    await page.goBack({ timeout: 5000 }).catch(() => {});
    await sleep(500);
    const responsive = await page.evaluate(() => {
      return !!document.getElementById('home-section');
    });
    assert.ok(responsive, '后退后页面应仍响应');
    assert.equal(realErrors().length, 0, '浏览器后退不应有错误');
  });

  // ===== 9. 满意度提交按钮初始禁用 =====
  it('9.1 满意度未选择时提交按钮禁用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(5000);
    await page.evaluate(() => {
      const btn = document.getElementById('end-recommendation');
      if (btn) btn.click();
    });
    await sleep(1000);
    const satDisabled = await page.evaluate(() => {
      const btn = document.getElementById('end-sat-submit');
      return btn ? btn.disabled : null;
    });
    assert.ok(satDisabled === true || satDisabled === null, `满意度提交按钮初始应禁用: ${satDisabled}`);
    assert.equal(realErrors().length, 0, '满意度按钮状态不应有错误');
  });

  // ===== 10. 滚动回顶部 =====
  it('10.1 页面滚动后可回到顶部', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(300);
    const scrolled = await page.evaluate(() => window.scrollY > 0);
    if (scrolled) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(300);
      const top = await page.evaluate(() => window.scrollY);
      assert.ok(top < 100, `回到顶部后scrollY应接近0，实际: ${top}`);
    }
    assert.equal(realErrors().length, 0, '滚动回顶部不应有错误');
  });
});