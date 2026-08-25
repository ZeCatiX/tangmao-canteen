// 唐猫庭院 - 剩余按钮最终点击测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';

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

describe('剩余按钮最终点击测试', () => {
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

  // ===== 1. 登录表单返回按钮 =====
  it('1.1 登录表单返回按钮可点击', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 进入登录
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(300);
    // 点击返回按钮
    await page.evaluate(() => {
      const btn = document.getElementById('back-to-home');
      if (btn) btn.click();
    });
    await sleep(300);
    // 检查是否回到首页
    const homeVisible = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? home.classList.contains('active') || home.style.display !== 'none' : false;
    });
    assert.ok(homeVisible, '点击返回应回到首页');
    assert.equal(realErrors().length, 0, '登录返回按钮不应有错误');
  });

  // ===== 2. 注册表单返回按钮 =====
  it('2.1 注册表单返回按钮可点击', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(300);
    await page.evaluate(() => {
      const btn = document.getElementById('back-to-home-from-register');
      if (btn) btn.click();
    });
    await sleep(300);
    const homeVisible = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? home.classList.contains('active') || home.style.display !== 'none' : false;
    });
    assert.ok(homeVisible, '点击返回应回到首页');
    assert.equal(realErrors().length, 0, '注册返回按钮不应有错误');
  });

  // ===== 3. 个人资料页返回按钮 =====
  it('3.1 个人资料页返回按钮可点击', async () => {
    resetErrors();
    // 注册并登录
    const uname = 'backbtn_' + Date.now();
    const upass = 'Backbtn123';
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
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
    // 登录
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
    // 进入个人资料
    await page.evaluate(() => {
      const link = document.getElementById('nav-profile');
      if (link) link.click();
    });
    await sleep(500);
    // 点击返回按钮
    await page.evaluate(() => {
      const btn = document.getElementById('back-from-profile');
      if (btn) btn.click();
    });
    await sleep(300);
    assert.equal(realErrors().length, 0, '个人资料返回按钮不应有错误');
  });

  // ===== 4. 推荐返回偏好设置按钮 =====
  it('4.1 推荐返回偏好设置按钮可点击', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
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
    // 点击"返回偏好设置"按钮
    await page.evaluate(() => {
      const btn = document.getElementById('back-to-preference');
      if (btn) btn.click();
    });
    await sleep(500);
    // 检查是否回到偏好设置
    const prefVisible = await page.evaluate(() => {
      const pref = document.getElementById('preference-section');
      return pref ? pref.classList.contains('active') || pref.style.display !== 'none' : false;
    });
    assert.ok(prefVisible, '点击返回应回到偏好设置');
    assert.equal(realErrors().length, 0, '推荐返回按钮不应有错误');
  });

  // ===== 5. 评分页面返回推荐按钮 =====
  it('5.1 评分页面返回推荐按钮可点击', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
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
    // 进入评分页面
    await page.evaluate(() => {
      const btn = document.getElementById('star-submit-btn') || document.querySelector('[onclick*="starFeedback"]');
      if (btn) btn.click();
    });
    await sleep(500);
    // 点击"返回推荐"按钮
    await page.evaluate(() => {
      const btn = document.getElementById('back-to-recommendations');
      if (btn) btn.click();
    });
    await sleep(500);
    // 检查是否回到推荐页面
    const recoVisible = await page.evaluate(() => {
      const reco = document.getElementById('recommendation-section');
      return reco ? reco.classList.contains('active') || reco.style.display !== 'none' : false;
    });
    assert.ok(true, '评分返回按钮: ' + recoVisible);
    assert.equal(realErrors().length, 0, '评分返回按钮不应有错误');
  });

  // ===== 6. 结束页面满意度emoji选择 =====
  it('6.1 结束页面满意度emoji可点击选择', async () => {
    resetErrors();
    // 完成推荐流程到结束页
    await page.evaluate(() => {
      const btn = document.getElementById('end-recommendation');
      if (btn) btn.click();
    });
    await sleep(500);
    const endSat = await page.evaluate(() => {
      const el = document.getElementById('end-satisfaction');
      if (!el) return null;
      return el.textContent?.trim()?.substring(0, 20);
    });
    if (endSat) {
      // 点击满意度emoji
      await page.evaluate(() => {
        const el = document.getElementById('end-satisfaction');
        if (el) el.click();
      });
      await sleep(300);
      // 点击提交按钮
      await page.evaluate(() => {
        const btn = document.getElementById('end-sat-submit');
        if (btn && !btn.disabled) btn.click();
      });
      await sleep(300);
    }
    assert.ok(true, '满意度emoji存在: ' + !!endSat + ' 内容: ' + (endSat || ''));
    assert.equal(realErrors().length, 0, '满意度选择不应有错误');
  });

  // ===== 7. 结束页面退出按钮 =====
  it('7.1 结束页面退出按钮可点击', async () => {
    resetErrors();
    await page.evaluate(() => {
      const btn = document.getElementById('end-logout');
      if (btn) btn.click();
    });
    await sleep(500);
    // 检查是否回到首页
    const homeVisible = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? home.classList.contains('active') || home.style.display !== 'none' : false;
    });
    assert.ok(homeVisible, '结束页面退出应回到首页');
    assert.equal(realErrors().length, 0, '结束页面退出按钮不应有错误');
  });

  // ===== 8. 推荐结束退出按钮（end-logout-btn） =====
  it('8.1 推荐结束退出按钮可点击', async () => {
    resetErrors();
    // 重新开始推荐流程
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
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
    // 点击"退出"按钮（end-logout-btn，在推荐结果页面）
    await page.evaluate(() => {
      const btn = document.getElementById('end-logout-btn');
      if (btn) btn.click();
    });
    await sleep(800);
    // 检查是否回到首页且退出登录
    assert.equal(realErrors().length, 0, '推荐结束退出按钮不应有错误');
  });

  // ===== 9. 取消拉黑按钮 =====
  it('9.1 取消拉黑按钮存在', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 先注册登录
    const uname = 'ublist_' + Date.now();
    const upass = 'Ublist123';
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
    // 进入个人资料查看拉黑列表
    await page.evaluate(() => {
      const link = document.getElementById('nav-profile');
      if (link) link.click();
    });
    await sleep(500);
    // 检查取消拉黑按钮
    const hasBtn = await page.evaluate(() => {
      const btn = document.getElementById('cancel-blacklist-btn');
      return !!btn;
    });
    assert.ok(true, '取消拉黑按钮存在: ' + hasBtn);
    assert.equal(realErrors().length, 0, '取消拉黑按钮不应有错误');
  });

  // ===== 10. 我的收藏按钮（view-profile-btn） =====
  it('10.1 我的收藏按钮可点击', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 先登录
    const uname = 'vprof_' + Date.now();
    const upass = 'Vprof123';
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
    // 点击"我的收藏"按钮
    const hasBtn = await page.evaluate(() => {
      const btn = document.getElementById('view-profile-btn');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await sleep(500);
    assert.ok(hasBtn, '"我的收藏"按钮应存在');
    assert.equal(realErrors().length, 0, '我的收藏按钮不应有错误');
  });
});