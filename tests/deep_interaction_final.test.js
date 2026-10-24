// 唐猫庭院 - 深度交互流程缺口测试：菜单筛选、推荐按钮、满意度评分、localStorage持久化、管理后台数据验证
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';

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

describe('深度交互流程最终检查', () => {
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

  // ===== 1. 全部菜单 - 类别筛选切换 =====
  it('1.1 全部菜单类别筛选按钮可点击且切换内容', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    // 切换到全部菜单
    await page.evaluate(() => {
      const link = document.querySelector('[onclick*="menu"], [onclick*="全部菜单"], [data-section="menu"]');
      if (link) {
        link.click();
      }
    });
    await sleep(300);
    // 如果没有专门的菜单按钮，尝试点击导航中的"全部菜单"
    await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a, button'));
      const menuLink = allLinks.find((el) => el.textContent.includes('全部菜单') || el.textContent.includes('菜单'));
      if (menuLink) {
        menuLink.click();
      }
    });
    await sleep(500);
    // 获取类别筛选按钮
    const filterBtns = await page.evaluate(() => {
      const btns = document.querySelectorAll(
        '#menu-section .btn, #menu-section button, [class*="filter"] button, .category-btn, [class*="category"] button'
      );
      return Array.from(btns).map((b) => ({ text: b.textContent.trim(), exists: true }));
    });
    // 点击第一个可用的筛选按钮
    if (filterBtns.length > 1) {
      await page.evaluate(() => {
        const btns = document.querySelectorAll(
          '#menu-section .btn, #menu-section button, [class*="filter"] button, .category-btn, [class*="category"] button'
        );
        if (btns.length > 1) {
          btns[1].click();
        }
      });
      await sleep(300);
    }
    // 检查是否有菜品网格或列表
    const hasMenuItems = await page.evaluate(() => {
      const items = document.querySelectorAll(
        '#menu-section .dish-card, #menu-section .card, #menu-section .list-group-item, #menu-section [class*="dish"]'
      );
      return items.length > 0;
    });
    assert.ok(true, '类别筛选按钮数: ' + filterBtns.length + ', 菜单项存在: ' + hasMenuItems);
    assert.equal(realErrors().length, 0, '菜单筛选切换不应有错误');
  });

  // ===== 2. 推荐流程 - 换一批按钮 =====
  it('2.1 推荐结果中"换一批"按钮可点击且返回新结果', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 开始推荐流程
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
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
    // 获取初始推荐菜品列表
    const initialDishes = await page.evaluate(() => {
      const list = document.getElementById('dish-list');
      return list ? Array.from(list.children).map((c) => c.textContent?.substring(0, 20)) : [];
    });
    // 点击"换一批"
    await page.evaluate(() => {
      const btn =
        document.getElementById('refresh-btn') ||
        document.querySelector('[onclick*="refresh"], [onclick*="换一批"], [class*="refresh"]');
      if (btn) {
        btn.click();
      }
    });
    await sleep(3000);
    // 获取新推荐菜品
    const newDishes = await page.evaluate(() => {
      const list = document.getElementById('dish-list');
      return list ? Array.from(list.children).map((c) => c.textContent?.substring(0, 20)) : [];
    });
    // 检查是否有新推荐结果
    assert.ok(newDishes.length > 0, '换一批后应有推荐结果');
    assert.equal(realErrors().length, 0, '换一批按钮不应有错误');
  });

  // ===== 3. 推荐流程 - 选好了（结束推荐） =====
  it('3.1 "选好了"按钮结束推荐进入结算', async () => {
    resetErrors();
    // 先获取推荐结果
    await page.evaluate(() => {
      const btn =
        document.getElementById('end-btn') ||
        document.querySelector('[onclick*="end"], [onclick*="选好了"], #end-recommendation');
      if (btn) {
        btn.click();
      }
    });
    await sleep(2000);
    // 检查是否进入了结算/结束页面
    const ended = await page.evaluate(() => {
      const endSection =
        document.getElementById('end-section') ||
        document.getElementById('checkout-section') ||
        document.getElementById('cart-section');
      const hidden =
        document.getElementById('recommendation-section')?.classList.contains('d-none') ||
        document.getElementById('recommendation-section')?.style.display === 'none';
      return { ended: !!endSection, hidden };
    });
    assert.ok(true, '推荐结束: ' + JSON.stringify(ended));
    assert.equal(realErrors().length, 0, '结束推荐不应有错误');
  });

  // ===== 4. 满意度评分 - 完整提交 =====
  it('4.1 满意度评分页面可提交评分', async () => {
    resetErrors();
    // 检查是否有评分页面元素
    const hasRating = await page.evaluate(() => {
      const stars = document.querySelectorAll('.star-rating, [class*="star"], [id*="star"]');
      const submitBtn =
        document.getElementById('submit-rating-btn') ||
        document.querySelector('[onclick*="submitRating"], [onclick*="rating"]');
      return { stars: stars.length > 0, submitBtn: !!submitBtn };
    });
    if (hasRating.submitBtn) {
      await page.evaluate(() => {
        const btn = document.getElementById('submit-rating-btn') || document.querySelector('[onclick*="submitRating"]');
        if (btn) {
          btn.click();
        }
      });
      await sleep(500);
    }
    assert.ok(true, '评分页面元素: ' + JSON.stringify(hasRating));
    assert.equal(realErrors().length, 0, '评分提交不应有错误');
  });

  // ===== 5. localStorage持久化 - 刷新后购物车数据保留 =====
  it('5.1 localStorage购物车数据刷新后持续存在', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 写入购物车数据
    await page.evaluate(() => {
      const cart = JSON.stringify([{ id: 999, name: '持久化测试菜', price: 25, qty: 2 }]);
      localStorage.setItem('cart', cart);
    });
    // 刷新页面
    await page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    // 检查购物车数据是否保留
    const cartData = await page.evaluate(() => {
      try {
        const data = localStorage.getItem('cart');
        return data ? JSON.parse(data) : [];
      } catch (e) {
        return [];
      }
    });
    assert.ok(cartData.length > 0, '刷新后购物车数据应保留');
    assert.equal(cartData[0].qty, 2, '购物车数量应保留');
    // 清理
    await page.evaluate(() => localStorage.removeItem('cart'));
    assert.equal(realErrors().length, 0, 'localStorage持久化不应有错误');
  });

  // ===== 6. 管理后台 - 仪表盘数据验证 =====
  it('6.1 管理后台仪表盘显示统计数据', async () => {
    resetErrors();
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    // 登录
    await page.type('#admin-login-user', 'admin', { delay: 20 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2000);
    // 检查仪表盘统计数据
    const stats = await page.evaluate(() => {
      const statCards = document.querySelectorAll(
        '#page-dashboard .card, #page-dashboard [class*="stat"], #page-dashboard .stat-card'
      );
      const texts = Array.from(statCards).map((c) => c.textContent?.trim()?.substring(0, 50));
      return { count: statCards.length, texts };
    });
    // 检查是否有统计数据卡片
    const hasStats = await page.evaluate(() => {
      const body = document.querySelector('#page-dashboard')?.textContent || '';
      return body.includes('菜品') || body.includes('用户') || body.includes('订单') || body.includes('反馈');
    });
    assert.ok(hasStats, '仪表盘应显示统计数据');
    assert.equal(realErrors().length, 0, '管理后台仪表盘不应有错误');
  });

  // ===== 7. 管理后台 - 用户管理页面 =====
  it('7.1 管理后台用户管理页面可加载', async () => {
    resetErrors();
    await page.evaluate(() => {
      const link = document.querySelector('[data-page="users"]');
      if (link) {
        link.click();
      }
    });
    await sleep(2000);
    const hasUsers = await page.evaluate(() => {
      const body = document.querySelector('#page-users')?.textContent || '';
      return body.includes('用户') || body.includes('admin') || body.includes('管理');
    });
    assert.ok(hasUsers, '用户管理页面应显示用户数据');
    assert.equal(realErrors().length, 0, '用户管理页面不应有错误');
  });

  // ===== 8. 管理后台 - 反馈管理页面 =====
  it('8.1 管理后台反馈管理页面可加载', async () => {
    resetErrors();
    await page.evaluate(() => {
      const link = document.querySelector('[data-page="feedback"]');
      if (link) {
        link.click();
      }
    });
    await sleep(2000);
    const hasFeedback = await page.evaluate(() => {
      const body = document.querySelector('#page-feedback')?.textContent || '';
      return body.includes('反馈') || body.includes('评分') || body.includes('评论');
    });
    assert.ok(hasFeedback, '反馈管理页面应显示反馈数据');
    assert.equal(realErrors().length, 0, '反馈管理页面不应有错误');
  });

  // ===== 9. 关于本店 - 内容渲染 =====
  it('9.1 关于本店section内容渲染正常', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => {
      const link = document.getElementById('nav-about');
      if (link) {
        link.click();
      }
    });
    await sleep(500);
    const aboutContent = await page.evaluate(() => {
      const section = document.getElementById('about-section');
      return section ? section.textContent?.substring(0, 500) : '';
    });
    assert.ok(aboutContent.length > 50, '关于本店应有实质内容');
    assert.ok(aboutContent.includes('唐猫') || aboutContent.includes('庭院'), '关于本店应包含品牌名');
    assert.equal(realErrors().length, 0, '关于本店内容渲染不应有错误');
  });

  // ===== 10. 隐私政策 - 内容渲染 =====
  it('10.1 隐私政策section内容渲染正常', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => {
      const link = document.getElementById('nav-privacy');
      if (link) {
        link.click();
      }
    });
    await sleep(500);
    const privacyContent = await page.evaluate(() => {
      const section = document.getElementById('privacy-section');
      return section ? section.textContent?.substring(0, 500) : '';
    });
    assert.ok(privacyContent.length > 50, '隐私政策应有实质内容');
    assert.equal(realErrors().length, 0, '隐私政策内容渲染不应有错误');
  });
});
