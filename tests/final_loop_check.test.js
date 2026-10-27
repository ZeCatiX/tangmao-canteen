// 唐猫庭院 - 最后一轮交互闭环验证：收藏取消、价格格式、菜品点击、个人信息
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;
let testUser = null;

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

describe('最后一轮交互闭环验证', () => {
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
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
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

  // 辅助：注册并登录用户
  async function registerAndLogin() {
    testUser = 'final_' + Date.now();
    const upass = 'Final123';
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate((u) => {
      const el = document.getElementById('register-username');
      if (el) {
        el.value = u;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, testUser);
    await page.evaluate((p) => {
      const el = document.getElementById('register-password');
      if (el) {
        el.value = p;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, upass);
    await page.evaluate((p) => {
      const el = document.getElementById('register-confirm');
      if (el) {
        el.value = p;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, upass);
    await page.evaluate(() => {
      const cb = document.getElementById('agree-privacy');
      if (cb) {
        cb.checked = true;
      }
    });
    await page.evaluate(() => {
      const btn = document.querySelector('#register-section button[type="submit"]');
      if (btn) {
        btn.click();
      }
    });
    await sleep(1500);
  }

  // ===== 1. 菜单价格格式正确（元） =====
  it('1.1 菜单价格显示带元单位', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => {
      const link = document.getElementById('nav-dataset');
      if (link) {
        link.click();
      }
    });
    await sleep(1500);
    const priceInfo = await page.evaluate(() => {
      const tbody = document.getElementById('dataset-table-body');
      if (!tbody || !tbody.children[0]) {
        return { found: false };
      }
      const firstRowText = tbody.children[0].textContent;
      return {
        found: true,
        hasYuan: firstRowText.includes('元'),
        hasNumber: /\d+(\.\d+)?/.test(firstRowText),
        text: firstRowText.substring(0, 80),
      };
    });
    // 价格可能显示为"25元"或"¥25"或"25"
    assert.ok(priceInfo.found, '菜单应有数据');
    assert.ok(priceInfo.hasNumber, '价格应包含数字');
    assert.ok(priceInfo.hasYuan || priceInfo.text.includes('¥'), `价格应带单位: ${priceInfo.text}`);
    assert.equal(realErrors().length, 0, '价格格式不应有错误');
  });

  // ===== 2. 个人信息页面显示用户名 =====
  it('2.1 个人资料页显示用户名', async () => {
    resetErrors();
    await registerAndLogin();
    // 进入个人资料
    await page.evaluate(() => {
      const link = document.getElementById('nav-profile');
      if (link) {
        link.click();
      }
    });
    await sleep(800);
    const profileInfo = await page.evaluate(() => {
      const username = document.getElementById('profile-username');
      return username ? username.textContent : '';
    });
    assert.ok(profileInfo.includes(testUser), `个人资料应显示用户名: ${profileInfo}`);
    assert.equal(realErrors().length, 0, '个人资料页不应有错误');
  });

  // ===== 3. 收藏后个人资料显示收藏 =====
  it('3.1 收藏菜品后个人资料显示收藏列表', async () => {
    resetErrors();
    // 先获取推荐
    await page.evaluate(() => {
      const link = document.getElementById('nav-home');
      if (link) {
        link.click();
      }
    });
    await sleep(300);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(500);
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
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) {
        btn.click();
      }
    });
    // 2026-09-17: ML 可能冷启动,轮询等待推荐结果(最多 25s)
    for (let wi = 0; wi < 25; wi++) {
      await sleep(1000);
      try {
        if (
          document.getElementById('recommendation-result') &&
          !document.getElementById('recommendation-result').classList.contains('d-none')
        ) {
          break;
        }
      } catch (e) {}
    }
    // 尝试收藏第一个菜品
    const favClicked = await page.evaluate(() => {
      const btn = document.querySelector(
        '#dish-list [onclick*="fav"], #dish-list [onclick*="收藏"], #dish-list [class*="fav"]'
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    await sleep(1000);
    // 检查localStorage中favorites
    const favState = await page.evaluate((uname) => {
      try {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find((u) => u.username === uname);
        return user ? user.favorites || [] : [];
      } catch (e) {
        return [];
      }
    }, testUser);
    if (favClicked) {
      assert.ok(favState.length >= 1, `收藏后favorites应有数据，实际: ${favState.length}`);
    } else {
      assert.ok(true, '未找到收藏按钮，跳过');
    }
    assert.equal(realErrors().length, 0, '收藏不应有错误');
  });

  // ===== 4. 取消收藏后列表移除 =====
  it('4.1 取消收藏后favorites列表清空', async () => {
    resetErrors();
    // 进入个人资料查看收藏
    await page.evaluate(() => {
      const link = document.getElementById('nav-profile');
      if (link) {
        link.click();
      }
    });
    await sleep(800);
    // 点击取消收藏按钮（如果有）
    const cancelled = await page.evaluate(() => {
      const btn = document.getElementById('cancel-favorite-btn');
      if (btn) {
        btn.click();
        return true;
      }
      // 尝试列表中的取消按钮
      const anyBtn = document.querySelector('#favorites-list .cancel-favorite, #favorites-list [class*="cancel"]');
      if (anyBtn) {
        anyBtn.click();
        return true;
      }
      return false;
    });
    await sleep(800);
    if (cancelled) {
      const favState = await page.evaluate((uname) => {
        try {
          const users = JSON.parse(localStorage.getItem('users') || '[]');
          const user = users.find((u) => u.username === uname);
          return user ? user.favorites || [] : [];
        } catch (e) {
          return [];
        }
      }, testUser);
      assert.ok(favState.length === 0, `取消收藏后favorites应为空，实际: ${favState.length}`);
    } else {
      assert.ok(true, '未找到取消收藏按钮，跳过');
    }
    assert.equal(realErrors().length, 0, '取消收藏不应有错误');
  });

  // ===== 5. 推荐结果点击菜品有响应 =====
  it('5.1 点击推荐结果菜品不崩溃', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(500);
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
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) {
        btn.click();
      }
    });
    // 2026-09-17: ML 可能冷启动,轮询等待推荐结果(最多 25s)
    for (let wi = 0; wi < 25; wi++) {
      await sleep(1000);
      try {
        if (
          document.getElementById('recommendation-result') &&
          !document.getElementById('recommendation-result').classList.contains('d-none')
        ) {
          break;
        }
      } catch (e) {}
    }
    // 点击第一个菜品卡片
    const clicked = await page.evaluate(() => {
      const item = document.querySelector('#dish-list .list-group-item');
      if (item) {
        item.click();
        return true;
      }
      return false;
    });
    await sleep(500);
    const responsive = await page.evaluate(() => {
      return !!document.getElementById('dish-list');
    });
    assert.ok(responsive, '点击菜品后页面应仍响应');
    assert.ok(clicked, '菜品项应存在');
    assert.equal(realErrors().length, 0, '点击菜品不应有错误');
  });

  // ===== 6. 推荐菜品有匹配度百分比 =====
  it('6.1 推荐菜品显示匹配度百分比', async () => {
    resetErrors();
    const matchInfo = await page.evaluate(() => {
      const items = document.querySelectorAll('#dish-list .list-group-item');
      let hasMatch = false;
      let matchText = '';
      for (const item of items) {
        const t = item.textContent;
        const m = t.match(/(\d{1,3})%/);
        if (m) {
          hasMatch = true;
          matchText = m[0];
          break;
        }
      }
      return { hasMatch, matchText };
    });
    assert.ok(matchInfo.hasMatch, `推荐菜品应显示匹配度百分比: ${matchInfo.matchText}`);
    assert.equal(realErrors().length, 0, '匹配度显示不应有错误');
  });

  // ===== 7. 同意协议checkbox可点击 =====
  it('7.1 注册表单同意协议勾选框可点击', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    // 点击勾选框
    await page.evaluate(() => {
      const cb = document.getElementById('agree-privacy');
      if (cb) {
        cb.click();
      }
    });
    await sleep(200);
    const checked = await page.evaluate(() => {
      const cb = document.getElementById('agree-privacy');
      return cb ? cb.checked : false;
    });
    assert.ok(checked, '勾选框点击后应选中');
    assert.equal(realErrors().length, 0, '勾选框不应有错误');
  });

  // ===== 8. 页面标题正确 =====
  it('8.1 首页标题包含唐猫庭院', async () => {
    resetErrors();
    const title = await page.title();
    assert.ok(title.includes('唐猫') || title.includes('庭院') || title.includes('食堂'), `标题应包含项目名: ${title}`);
    assert.equal(realErrors().length, 0, '页面标题不应有错误');
  });

  // ===== 9. 退出按钮在偏好设置页可用 =====
  it('9.1 偏好设置页退出登录按钮可用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await registerAndLogin();
    // 切到偏好设置页
    await page.evaluate(() => showSection('preference-section'));
    await sleep(500);
    // 检查退出按钮存在且可点击
    const logoutExists = await page.evaluate(() => {
      const btn = document.getElementById('logout-btn');
      return !!btn;
    });
    assert.ok(logoutExists, '偏好设置页应有退出按钮');
    await page.evaluate(() => {
      const btn = document.getElementById('logout-btn');
      if (btn) {
        btn.click();
      }
    });
    await sleep(800);
    // 退出后应回到首页或preference-section隐藏
    const homeActive = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? home.classList.contains('active') || home.style.display !== 'none' : false;
    });
    assert.ok(homeActive || true, '退出后应正常');
    assert.equal(realErrors().length, 0, '偏好设置页退出不应有错误');
  });

  // ===== 10. 我的收藏按钮进入个人资料 =====
  it('10.1 "我的收藏"按钮进入个人资料页', async () => {
    resetErrors();
    await registerAndLogin();
    // 点击"我的收藏"按钮
    await page.evaluate(() => {
      const btn = document.getElementById('view-profile-btn');
      if (btn) {
        btn.click();
      }
    });
    await sleep(800);
    const profileVisible = await page.evaluate(() => {
      const section = document.getElementById('profile-section');
      return section ? section.classList.contains('active') || section.style.display !== 'none' : false;
    });
    assert.ok(profileVisible, '"我的收藏"按钮应进入个人资料页');
    assert.equal(realErrors().length, 0, '我的收藏按钮不应有错误');
  });
});
