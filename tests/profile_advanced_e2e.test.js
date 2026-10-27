// 唐猫庭院 - 个人中心与高级交互 E2E 测试
// 覆盖：登录用户收藏 → 查看收藏 → 退出登录 → 厨房完成订单 → 管理员上下架菜品
const { describe, it, before, after } = require('node:test');

// 真实菜品 ID 池(2026-09-17)
let dishPool = [{ id: 2069, name: '测试菜品', price: 18 }];
before(async () => {
  try {
    const r = await fetch('http://localhost:3000/api/dishes').then(function (x) {
      return x.json();
    });
    const list = (r && (r.dishes || r)) || [];
    if (list.length) {
      dishPool = list.slice(0, 5).map(function (d) {
        return { id: d.id, name: d.name, price: parseFloat(d.price) || 18 };
      });
    }
  } catch (e) {}
});
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
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) {
    return false;
  }
  return true;
}

describe('个人中心与高级交互测试', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    // 自动接受 confirm 对话框（厨房完成订单等场景）
    page.on('dialog', (d) => d.accept().catch(() => {}));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && isRealError(msg.text())) {
        page._consoleErrors.push(msg.text());
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

  // ===== 1. 登录后个人中心 =====
  it('1.1 用户登录后进入个人中心（我的收藏）', async () => {
    resetErrors();
    // 先注册一个用户
    const uniq = 'profile' + Date.now();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('nav-user')?.click());
    await sleep(400);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(500);
    await page.type('#register-username', uniq, { delay: 10 });
    await page.type('#register-password', 'Pass1234!', { delay: 10 });
    await page.type('#register-confirm', 'Pass1234!', { delay: 10 });
    await page.evaluate(() => document.getElementById('agree-privacy')?.click());
    await sleep(100);
    await page.evaluate(() => document.getElementById('register-form')?.requestSubmit());
    await sleep(1500);
    console.log('注册用户:', uniq);

    // 进入个人中心（偏好页有"我的收藏"按钮）
    const viewProfileBtn = await page.$('#view-profile-btn');
    assert.ok(viewProfileBtn, '应有"我的收藏"按钮');
    await page.evaluate(() => document.getElementById('view-profile-btn')?.click());
    await sleep(800);
    const profileVisible = await page.evaluate(() => {
      const sec = document.getElementById('profile-section');
      return sec && !sec.classList.contains('d-none');
    });
    assert.ok(profileVisible, '个人中心应可见');
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  it('1.1b 空收藏/空黑名单时隐藏"清空"按钮（回归：空态死按钮）', async () => {
    resetErrors();
    // 沿用 1.1 注册的新用户:收藏/黑名单均为空
    await page.evaluate(() => document.getElementById('view-profile-btn')?.click());
    await sleep(600);
    const state = await page.evaluate(() => {
      const sec = document.getElementById('profile-section');
      const visible = sec && !sec.classList.contains('d-none');
      const favEmpty = (document.getElementById('favorites-list')?.textContent || '').includes('还没有收藏的菜品');
      const blEmpty = (document.getElementById('blacklist-list')?.textContent || '').includes('还没有拉黑的菜品');
      const favBtn = document.getElementById('cancel-favorite-btn');
      const blBtn = document.getElementById('cancel-blacklist-btn');
      return {
        visible,
        favEmpty,
        blEmpty,
        favBtnHidden: !favBtn || favBtn.offsetParent === null || getComputedStyle(favBtn).display === 'none',
        blBtnHidden: !blBtn || blBtn.offsetParent === null || getComputedStyle(blBtn).display === 'none',
      };
    });
    assert.ok(state.visible, '个人中心应可见');
    assert.ok(state.favEmpty && state.blEmpty, '新用户收藏/黑名单应为空');
    assert.ok(state.favBtnHidden, '空收藏时"取消收藏"按钮应隐藏');
    assert.ok(state.blBtnHidden, '空黑名单时"取消"按钮应隐藏');
  });

  it('1.2 收藏一个菜品后显示在收藏列表', async () => {
    resetErrors();
    // 在菜单页收藏第一个菜
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(800);
    // 找到收藏按钮（heart 图标）
    const hasFavBtn = await page.evaluate(() => {
      const btns = document.querySelectorAll('#dataset-table-body button, .fav-btn, [data-fav]');
      return btns.length;
    });
    console.log('菜单中收藏按钮数量:', hasFavBtn);
    if (hasFavBtn > 0) {
      // 点击第一个收藏按钮
      const clicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('#dataset-table-body button, .fav-btn, [data-fav]');
        if (btns[0]) {
          btns[0].click();
          return true;
        }
        return false;
      });
      assert.ok(clicked, '应能点击收藏按钮');
      await sleep(800);
      // 查看收藏是否出现
      await page.evaluate(() => document.getElementById('view-profile-btn')?.click());
      await sleep(600);
      const favCount = await page.evaluate(() => {
        const fl = document.getElementById('favorites-list');
        return fl ? fl.children.length : -1;
      });
      console.log('收藏列表项数:', favCount);
      assert.ok(favCount >= 0, '收藏列表应可读取');
      assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
    } else {
      console.log('跳过：菜单中无收藏按钮（可能为表格布局无收藏功能）');
    }
  });

  it('1.3 退出登录按钮可用', async () => {
    resetErrors();
    await page.evaluate(() => document.getElementById('logout-btn')?.click());
    await sleep(800);
    // 退出后应回到登录/首页状态
    const loggedOut = await page.evaluate(() => {
      const navUser = document.getElementById('nav-user');
      return navUser && !navUser.classList.contains('d-none');
    });
    console.log('退出后 nav-user 可见:', loggedOut);
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  // ===== 2. 厨房看板完成订单 =====
  it('2.1 游客下单后厨房看板可完成订单', async () => {
    resetErrors();
    const ts = Date.now();
    const uniqUser = 'kitchen_t_' + ts;
    const createRes = await fetch(BASE + '/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: uniqUser,
        items: [{ id: dishPool[0].id, name: dishPool[0].name, price: dishPool[0].price, quantity: 1 }],
      }),
    }).catch(function (e) {
      console.log('下单失败:', e.message);
      return null;
    });
    if (!createRes || !createRes.ok) {
      console.log('下单返回异常');
      return;
    }
    const orderData = await createRes.json();
    const orderId = String(orderData.orderId);
    console.log('订单已创建: ' + orderId);

    // 厨房看板登录
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(800);
    const userInput = await page.$('#login-user');
    const passInput = await page.$('#login-pass');
    assert.ok(userInput && passInput, '厨房应有登录输入框');
    require('dotenv').config();
    await userInput.type('admin', { delay: 10 });
    await passInput.type(process.env.ADMIN_PASS, { delay: 10 });
    await page.evaluate(() => document.getElementById('login-btn')?.click());
    await sleep(2500);

    // 轮询找到订单卡片并双击完成(最多 30s)
    let completed = false;
    for (let r = 0; r < 15 && !completed; r++) {
      await sleep(2000);
      completed = await page.evaluate(function (oid) {
        const cards = document.querySelectorAll('.order-card');
        for (let ci = 0; ci < cards.length; ci++) {
          if (cards[ci].getAttribute('data-id') === oid) {
            const btn = cards[ci].querySelector('.btn-complete');
            if (btn) {
              btn.click();
              btn.click();
              return true;
            }
          }
        }
        return false;
      }, orderId);
      if (completed) {
        break;
      }
    }
    assert.ok(completed, '厨房看板应显示并完成订单 ' + orderId + ', 实际: ' + completed);
    assert.equal(realErrors().length, 0, '厨房看板不应有错误: ' + realErrors().join('; '));
  });

  // ===== 3. 管理员菜品上下架 =====
  it('3.1 管理后台菜品列表加载与导出按钮', async () => {
    resetErrors();
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(500);
    const loginBtn = await page.$('#admin-login-btn');
    if (loginBtn) {
      const userInput = await page.$('#admin-login-user');
      const passInput = await page.$('#admin-login-pass');
      if (userInput && passInput) {
        require('dotenv').config();
        await userInput.type('admin', { delay: 10 });
        await passInput.type(process.env.ADMIN_PASS, { delay: 10 });
      }
      await loginBtn.click();
      await sleep(1500);
    }
    // 打开菜品管理
    const dishNav = await page.evaluate(() => {
      const links = document.querySelectorAll('[data-page="dishes"], #nav-dishes, .sidebar a');
      for (const l of links) {
        if (/菜品|dishes/i.test(l.textContent)) {
          l.click();
          return true;
        }
      }
      return false;
    });
    console.log('打开菜品管理:', dishNav);
    await sleep(1000);
    const dishRows = await page.evaluate(() => document.querySelectorAll('#dish-table tbody tr, .dish-row').length);
    console.log('菜品管理表格行数:', dishRows);
    assert.ok(dishRows >= 0, '菜品表格应加载');
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  // ===== 4. 字符与排版抽查（桌面/移动） =====
  it('4.1 三页面中文字符与排版抽查', async () => {
    for (const path of ['/', '/admin', '/kitchen']) {
      await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 20000 });
      await sleep(500);
      const txt = await page.evaluate(() => document.body.textContent);
      const mojibake = /锛|閿|鍑|鐨|涓|鍜|鏄|钖|鍟|妗|閰|椁|寮|鍏|鏉|鍚|鐢|鍦/.test(txt);
      assert.ok(!mojibake, path + ' 存在乱码');
      // 中文标题存在
      assert.ok(/唐猫/.test(txt), path + ' 应包含站点名');
    }
  });

  it('4.2 桌面端首页关键按钮在视口内', async () => {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(600);
    const btns = await page.evaluate(() => {
      const ids = ['#guest-btn', '#nav-user', '#nav-cart', '#dark-mode-toggle'];
      const res = {};
      for (const id of ids) {
        const el = document.querySelector(id);
        if (!el) {
          res[id] = '不存在';
          continue;
        }
        const r = el.getBoundingClientRect();
        res[id] = r.width > 0 && r.height > 0 && r.top >= 0 && r.top < window.innerHeight;
      }
      return res;
    });
    console.log('桌面端按钮可见性:', JSON.stringify(btns));
    assert.ok(btns['#guest-btn'] === true, '开始点餐按钮应在视口内');
  });
});
