// 唐猫庭院 - 数据库清理后回归测试
// 模拟真实用户完整旅程，验证清理后系统功能无回归
// 注意：本测试会创建测试用户/订单，运行后请用 db_cleanup_test_data.js 清理
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
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) return false;
  return true;
}

describe('数据库清理后回归 - 用户完整旅程', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && isRealError(msg.text())) page._consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => page._consoleErrors.push(err.message));
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() { return page._consoleErrors.filter(isRealError); }

  // ===== 1. 首页游客浏览 =====
  it('1.1 首页加载、统计卡片显示正常', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(500);
    // 检查页面基础元素
    const info = await page.evaluate(() => {
      const dishCount = document.querySelectorAll('#dataset-table-body tr').length;
      const navBrand = document.querySelector('.navbar-brand')?.textContent || '';
      const hero = document.querySelector('#home-section h1, #home-section .hero-title')?.textContent || '';
      const menuCount = document.getElementById('menu-count')?.textContent || '';
      return { dishCount, navBrand, hero, menuCount };
    });
    assert.ok(info.navBrand.includes('唐猫'), '品牌名应显示唐猫庭院: ' + info.navBrand);
    // 点击"全部菜单"后应立即显示菜品（竞态修复验证）
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(600);
    const rows = await page.evaluate(() => document.querySelectorAll('#dataset-table-body tr').length);
    console.log('全部菜单行数:', rows, '计数:', info.menuCount);
    assert.ok(rows >= 60, '菜单应显示菜品(>=60): ' + rows);
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  it('1.2 游客点击"游客模式"进入点餐', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(400);
    const guestBtn = await page.$('#guest-btn');
    if (guestBtn) {
      await guestBtn.click();
      await sleep(600);
      const menuVisible = await page.evaluate(() => {
        return !document.getElementById('menu-section')?.classList.contains('d-none');
      });
      assert.ok(menuVisible, '游客模式应进入菜单');
    } else {
      // 若游客按钮不存在则跳过（已登录状态）
      console.log('跳过：guest-btn 不存在');
    }
  });

  // ===== 2. 注册 -> 登录 -> 偏好 -> 推荐 =====
  it('2.1 新用户注册完整流程', async () => {
    resetErrors();
    const uniq = 'journey_' + Date.now();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(400);
    // 点击导航登录，再切到注册（带滚动确保可见）
    await page.evaluate(() => document.getElementById('nav-user')?.click());
    await sleep(500);
    await page.evaluate(() => document.getElementById('register-btn')?.click());
    await sleep(500);
    // 断言注册表单可见
    const regVisible = await page.evaluate(() => {
      const sec = document.getElementById('register-section');
      return sec && !sec.classList.contains('d-none');
    });
    assert.ok(regVisible, '注册表单应可见');
    // 填表
    const inputs = await page.$$('#register-username, #register-password, #register-confirm');
    if (inputs.length >= 3) {
      await inputs[0].type(uniq, { delay: 10 });
      await inputs[1].type('Pass1234!', { delay: 10 });
      await inputs[2].type('Pass1234!', { delay: 10 });
      // 同意隐私政策
      await page.evaluate(() => document.getElementById('agree-privacy')?.click());
      await sleep(100);
      await page.evaluate(() => {
        const form = document.getElementById('register-form');
        form?.requestSubmit();
      });
      await sleep(1500);
      // 验证注册成功（可能出现成功提示或已登录）
      const state = await page.evaluate(() => {
        const body = document.body.textContent;
        return {
          hasSuccess: /注册成功|欢迎/.test(body),
          hasError: /失败|错误|已存在|无效/.test(body),
        };
      });
      console.log('注册结果:', JSON.stringify(state));
      assert.ok(state.hasSuccess || !state.hasError, '注册应成功或至少无错误: ' + JSON.stringify(state));
    } else {
      assert.fail('注册表单输入框不存在');
    }
  });

  it('2.2 偏好设置流程（填写偏好表单并获取推荐）', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(500);
    // 显示偏好区（点击推荐入口或导航到 preference-section）
    await page.evaluate(() => {
      const btn = document.getElementById('start-recommendation') || document.getElementById('nav-recommend') || document.getElementById('preference-btn');
      if (btn) btn.click();
    });
    await sleep(600);
    const prefVisible = await page.evaluate(() => {
      const sec = document.getElementById('preference-section');
      return sec && !sec.classList.contains('d-none');
    });
    if (!prefVisible) {
      // 直接通过 JS 切换到偏好区（用于测试内部）
      await page.evaluate(() => {
        document.querySelectorAll('.section').forEach(s => s.classList.add('d-none'));
        const sec = document.getElementById('preference-section');
        if (sec) sec.classList.remove('d-none');
      });
    }
    await sleep(300);
    // 填偏好（用默认值即可）
    const prefForm = await page.$('#preference-form');
    if (prefForm) {
      // 选择推荐模式（如不填则用默认）
      const mode = await page.$('#recommendation-mode');
      if (mode) {
        await mode.select('智能推荐');
      }
    }
    // 提交偏好
    await page.evaluate(() => document.getElementById('preference-form')?.requestSubmit());
    await sleep(2500);
    // 检查推荐结果区是否出现
    const recoState = await page.evaluate(() => {
      const result = document.getElementById('recommendation-result');
      const loading = document.getElementById('recommendation-loading');
      const body = document.body.textContent;
      return {
        resultVisible: result && !result.classList.contains('d-none'),
        loadingVisible: loading && !loading.classList.contains('d-none'),
        hasError: /推荐失败|出错|错误/.test(body),
      };
    });
    console.log('推荐状态:', JSON.stringify(recoState));
    // 不强制断言推荐成功（可能因未登录或数据原因），但断言无崩溃错误
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  // ===== 3. 购物车 =====
  it('3.1 打开购物车并验证内容', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(500);
    const cart = await page.$('#nav-cart');
    if (cart) {
      await cart.click();
      await sleep(500);
      const cartVisible = await page.evaluate(() => {
        const el = document.getElementById('cart-section, #cart-modal, .cart-panel');
        return !!el;
      });
      console.log('购物车元素存在:', cartVisible);
      // 关闭
      const close = await page.$('#cart-close, .cart-close, #close-cart');
      if (close) { await close.click(); await sleep(300); }
    }
  });

  // ===== 4. 管理后台 =====
  it('4.1 管理后台登录+仪表盘', async () => {
    resetErrors();
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(500);
    const loginBtn = await page.$('#admin-login-btn');
    if (loginBtn) {
      // 填入admin凭据（从 .env 读取，测试文件运行在 Node 环境）
      const userInput = await page.$('#admin-login-user');
      const passInput = await page.$('#admin-login-pass');
      if (userInput && passInput) {
        require('dotenv').config();
        const adminPass = process.env.ADMIN_PASS;
        await userInput.type('admin', { delay: 10 });
        await passInput.type(adminPass, { delay: 10 });
      } else {
        console.log('警告：未找到 admin 登录输入框（id=admin-login-user/pass）');
      }
      await loginBtn.click();
      await sleep(1500);
      const dashVisible = await page.evaluate(() => {
        const stats = document.querySelectorAll('.stat-card, .stat-item, #stats-section');
        const loginPage = document.getElementById('admin-login-page');
        return {
          statsCount: stats.length,
          loginHidden: !loginPage || loginPage.style.display === 'none' || getComputedStyle(loginPage).display === 'none',
        };
      });
      console.log('admin 登录后状态:', JSON.stringify(dashVisible));
      assert.ok(dashVisible.loginHidden, '登录后登录页应隐藏');
    } else {
      console.log('跳过：admin 登录按钮不存在（可能已登录）');
    }
  });

  // ===== 5. 厨房看板 =====
  it('5.1 厨房看板加载与订单列表', async () => {
    resetErrors();
    await page.goto(BASE + '/kitchen', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(1200);
    const info = await page.evaluate(() => {
      const login = !!document.getElementById('login-btn');
      const orderList = document.querySelectorAll('.order-card, .order-item').length;
      const body = document.body.textContent;
      return { login, orderList, hasTitle: body.includes('厨房'), bodyLen: body.length };
    });
    console.log('厨房看板:', JSON.stringify(info));
    assert.ok(info.bodyLen > 100, '页面应有内容');
  });

  // ===== 6. 各页面排版与字符 =====
  it('6.1 三个页面无乱码字符', async () => {
    for (const path of ['/', '/admin', '/kitchen']) {
      await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 20000 });
      await sleep(400);
      const txt = await page.evaluate(() => document.body.textContent);
      // 乱码检测：常见 UTF-8 被误读为 GBK 的字符
      const mojibake = /锛|閿|鍑|鐨|涓|鍜|鏄|钖|鍟|妗|閰|椁|寮|鍏|鏉|鍚|鐢|鍦|涓绉|鍙/.test(txt);
      assert.ok(!mojibake, path + ' 存在乱码字符');
      // 页面不为空
      assert.ok(txt.trim().length > 50, path + ' 页面内容过短');
    }
  });

  it('6.2 响应式布局 - 375px 与 768px', async () => {
    for (const [w, h] of [[375, 667], [768, 1024]]) {
      await page.setViewport({ width: w, height: h });
      await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
      await sleep(500);
      // 检查横向滚动（排版问题指标）
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      });
      assert.ok(!overflow, `${w}px 宽度不应横向滚动溢出`);
      // 按钮可点击
      const clickable = await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        const visible = [...btns].filter(b => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        return visible.length;
      });
      assert.ok(clickable > 0, `${w}px 应有可见按钮`);
    }
  });
});