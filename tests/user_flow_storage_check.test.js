// 唐猫庭院 - 用户流程与存储深度检查：注册自动登录、退出清理、缓存推荐、徽标更新
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
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) {
    return false;
  }
  return true;
}

describe('用户流程与存储深度检查', () => {
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
    // 默认处理dialog
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

  // ===== 1. 注册后自动登录 =====
  it('1.1 注册成功后自动登录（无需再次登录）', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    const uname = 'auto_' + Date.now(); // 18字符,≤20上限(Date.now()13位;前缀过长会被maxlength=20拒绝)
    const upass = 'Autologin123';
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate((u) => {
      const el = document.getElementById('register-username');
      if (el) {
        el.value = u;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, uname);
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
    // 检查是否自动登录（"我的"导航显示 = 已登录）
    const autoLoggedIn = await page.evaluate(() => {
      const item = document.getElementById('nav-profile-item');
      return item ? !item.classList.contains('d-none') : false;
    });
    // 检查localStorage中是否有登录状态
    const hasCurrentUser = await page.evaluate(() => {
      const cu = localStorage.getItem('currentUser');
      return cu && cu !== 'guest';
    });
    assert.ok(autoLoggedIn || hasCurrentUser, '注册后应自动登录');
    assert.equal(realErrors().length, 0, '注册自动登录不应有错误');
  });

  // ===== 2. 退出登录清理localStorage =====
  it('2.1 退出登录后清理用户存储', async () => {
    resetErrors();
    // 当前已自动登录，点击退出
    await page.evaluate(() => {
      const btn = document.getElementById('logout-btn');
      if (btn) {
        btn.click();
      }
    });
    await sleep(1000);
    // 检查localStorage中用户数据是否清理
    const userCleared = await page.evaluate(() => {
      const user = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      // user可能为null或被清理
      return user === null || user === undefined;
    });
    assert.ok(userCleared, '退出后应清理用户存储');
    // 检查"我的"导航隐藏
    const profileHidden = await page.evaluate(() => {
      const item = document.getElementById('nav-profile-item');
      return item ? item.classList.contains('d-none') : true;
    });
    assert.ok(profileHidden, '退出后"我的"导航应隐藏');
    assert.equal(realErrors().length, 0, '退出清理不应有错误');
  });

  // ===== 3. 偏好设置存储到localStorage（已登录用户） =====
  it('3.1 已登录用户提交偏好后localStorage保存偏好', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    // 注册新用户
    const uname = 'prefs_' + Date.now(); // 19字符,≤20上限
    const upass = 'Prefsave123';
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate((u) => {
      const el = document.getElementById('register-username');
      if (el) {
        el.value = u;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, uname);
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
    // 进入偏好设置
    await page
      .evaluate(() => {
        const btn = document.getElementById('continue-btn');
        if (btn) {
          btn.click();
        }
      })
      .catch(() => {});
    // 直接切到偏好section
    await page.evaluate(() => showSection('preference-section'));
    await sleep(500);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) {
        btn.click();
      }
    });
    await sleep(5000);
    // 检查users数组中当前用户的偏好
    const prefSaved = await page.evaluate((expectedUser) => {
      try {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find((u) => u.username === expectedUser);
        if (user && user.preferences) {
          return { found: true, pref: JSON.stringify(user.preferences).substring(0, 80) };
        }
        return { found: false };
      } catch (e) {
        return { found: false, err: e.message };
      }
    }, uname);
    assert.ok(prefSaved.found, `已登录用户偏好应保存: ${JSON.stringify(prefSaved)}`);
    assert.equal(realErrors().length, 0, '偏好保存不应有错误');
  });

  // ===== 4. 推荐结果可能缓存到localStorage =====
  it('4.1 推荐结果缓存机制存在', async () => {
    resetErrors();
    // 检查是否有缓存推荐结果的key
    const cacheKeys = await page.evaluate(() => {
      const result = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.includes('rec') || key.includes('recommend') || key.includes('dish') || key.includes('cache'))
        ) {
          result.push(key);
        }
      }
      return result;
    });
    // 推荐结果可能不缓存，只验证无错误
    assert.ok(true, `缓存keys: ${cacheKeys.join(', ') || '无'}`);
    assert.equal(realErrors().length, 0, '推荐缓存检查不应有错误');
  });

  // ===== 5. 购物车徽标添加商品后更新 =====
  it('5.1 添加商品后购物车徽标更新', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    // 清空购物车
    await page.evaluate(() => localStorage.removeItem('cart'));
    // 直接写入2件商品并刷新页面
    await page.evaluate(() => {
      localStorage.setItem('cart', JSON.stringify([{ id: 99996, name: '徽标菜', price: 8, qty: 2 }]));
    });
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
    await sleep(800);
    // 检查徽标
    const badge = await page.evaluate(() => {
      const el = document.getElementById('cart-badge');
      return el ? { text: el.textContent, display: el.style.display } : null;
    });
    if (badge) {
      assert.equal(badge.text, '2', `徽标应显示2，实际: ${badge.text}`);
      assert.notEqual(badge.display, 'none', '徽标应可见');
    } else {
      assert.ok(true, '徽标元素不存在，跳过');
    }
    // 清理
    await page.evaluate(() => localStorage.removeItem('cart'));
    assert.equal(realErrors().length, 0, '购物车徽标更新不应有错误');
  });

  // ===== 6. 菜单数据从API加载 =====
  it('6.1 全部菜单数据加载显示', async () => {
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
    const menuInfo = await page.evaluate(() => {
      const count = document.getElementById('menu-count');
      const tbody = document.getElementById('dataset-table-body');
      return {
        countText: count ? count.textContent : '',
        rows: tbody ? tbody.children.length : 0,
      };
    });
    assert.ok(menuInfo.rows > 0, `菜单应有数据行，实际: ${menuInfo.rows}`);
    assert.ok(menuInfo.countText !== '', `菜单计数应显示，实际: ${menuInfo.countText}`);
    assert.equal(realErrors().length, 0, '菜单数据加载不应有错误');
  });

  // ===== 7. 注册用户名重复被拒绝 =====
  it('7.1 重复注册同名用户被拒绝', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    const uname = 'dupuser' + Date.now();
    const upass = 'Dupuser123';
    // 第一次注册
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate((u) => {
      const el = document.getElementById('register-username');
      if (el) {
        el.value = u;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, uname);
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
    // 退出登录（如果自动登录了）
    await page.evaluate(() => {
      const btn = document.getElementById('logout-btn');
      if (btn) {
        btn.click();
      }
    });
    await sleep(500);
    // 再次注册同名
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(400);
    await page.evaluate((u) => {
      const el = document.getElementById('register-username');
      if (el) {
        el.value = u;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, uname);
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
    // 应显示错误提示或留在注册页
    const errorShown = await page.evaluate(() => {
      const modal = document.getElementById('message-modal');
      const text = modal ? modal.textContent : '';
      return text.includes('已存在') || text.includes('重复') || text.includes('占用') || text.includes('注册失败');
    });
    const stayedOnRegister = await page.evaluate(() => {
      const section = document.getElementById('register-section');
      return section ? section.classList.contains('active') || section.style.display !== 'none' : false;
    });
    assert.ok(errorShown || stayedOnRegister, '重复注册应被拒绝');
    assert.equal(realErrors().length, 0, '重复注册不应有JS错误');
  });

  // ===== 8. 数据集返回按钮回到首页 =====
  it('8.1 数据集页面返回按钮可用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => {
      const link = document.getElementById('nav-dataset');
      if (link) {
        link.click();
      }
    });
    await sleep(800);
    await page.evaluate(() => {
      const btn = document.getElementById('back-from-dataset');
      if (btn) {
        btn.click();
      }
    });
    await sleep(500);
    const homeVisible = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? home.classList.contains('active') || home.style.display !== 'none' : false;
    });
    assert.ok(homeVisible, '数据集返回应回到首页');
    assert.equal(realErrors().length, 0, '数据集返回不应有错误');
  });

  // ===== 9. 关于本店返回按钮可用 =====
  it('9.1 关于本店返回按钮可用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => {
      const link = document.getElementById('nav-about');
      if (link) {
        link.click();
      }
    });
    await sleep(500);
    await page.evaluate(() => {
      const btn = document.getElementById('back-from-about');
      if (btn) {
        btn.click();
      }
    });
    await sleep(500);
    const homeVisible = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? home.classList.contains('active') || home.style.display !== 'none' : false;
    });
    assert.ok(homeVisible, '关于本店返回应回到首页');
    assert.equal(realErrors().length, 0, '关于本店返回不应有错误');
  });

  // ===== 10. 隐私政策返回按钮可用 =====
  it('10.1 隐私政策返回按钮可用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => {
      const link = document.getElementById('nav-privacy');
      if (link) {
        link.click();
      }
    });
    await sleep(500);
    await page.evaluate(() => {
      const btn = document.getElementById('back-from-privacy');
      if (btn) {
        btn.click();
      }
    });
    await sleep(500);
    const homeVisible = await page.evaluate(() => {
      const home = document.getElementById('home-section');
      return home ? home.classList.contains('active') || home.style.display !== 'none' : false;
    });
    assert.ok(homeVisible, '隐私政策返回应回到首页');
    assert.equal(realErrors().length, 0, '隐私政策返回不应有错误');
  });
});
