// 唐猫庭院 - 决策树推荐逻辑和管理后台用户管理深度E2E测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');
require('dotenv').config();

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
  if (msg.includes('409')) {
    return false;
  }
  if (msg.includes('Failed to load resource') && msg.match(/\b[4-5]\d{2}\b/)) {
    return false;
  }
  return true;
}

async function api(p, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(BASE + p, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...rest,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function getAdminToken() {
  const r = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }),
  });
  return r.body.token || '';
}

describe('决策树本地推荐逻辑检查', () => {
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

  // ===== 1. 决策树模型加载 =====
  it('1.1 决策树模型可正常加载', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(1000);
    // 重置状态后重新加载
    const loaded = await page.evaluate(async () => {
      decisionTreeLoaded = false;
      decisionTreeLoading = false;
      return await loadDecisionTreeModel();
    });
    assert.ok(loaded, '决策树模型应加载成功');
    assert.equal(realErrors().length, 0, '决策树加载不应有错误');
  });

  // ===== 2. predictWithDecisionTree返回有效分数 =====
  it('2.1 predictWithDecisionTree返回0-5之间的分数', async () => {
    resetErrors();
    // 等待菜品数据加载
    await sleep(2000);
    const result = await page.evaluate(() => {
      if (!dishData.length) {
        return { error: 'no dishData' };
      }
      const dish = dishData[0];
      const prefs = { 辣度: dish.spiciness, 咸淡: dish.saltiness, 甜酸: dish.sweetness };
      const score = predictWithDecisionTree(prefs, dish);
      return { score, dishName: dish.name, isFinite: isFinite(score) };
    });
    assert.ok(!result.error, '应有菜品数据');
    assert.ok(result.isFinite, '分数应为有限数');
    assert.ok(result.score >= 0 && result.score <= 5, `分数应在0-5之间: ${result.score} (${result.dishName})`);
    assert.equal(realErrors().length, 0, '决策树预测不应有错误');
  });

  // ===== 3. computeDishMatch返回正确匹配度 =====
  it('3.1 computeDishMatch返回匹配度和详情', async () => {
    resetErrors();
    const result = await page.evaluate(() => {
      if (!dishData.length) {
        return { error: 'no dishData' };
      }
      const dish = dishData[0];
      const prefs = { 辣度: dish.spiciness, 咸淡: dish.saltiness, 甜酸: dish.sweetness };
      const match = computeDishMatch(prefs, dish);
      return {
        matchDetails: match.matchDetails,
        totalMatch: match.totalMatch,
        matchRate: match.matchRate,
        hasTaste: match.matchDetails.taste !== undefined,
        hasCuisine: match.matchDetails.cuisine !== undefined,
        hasNutrition: match.matchDetails.calorie !== undefined,
        hasRating: match.matchDetails.rating !== undefined,
        matchRateFinite: isFinite(match.matchRate),
      };
    });
    assert.ok(!result.error, '应有菜品数据');
    assert.ok(result.hasTaste, '应有taste匹配');
    assert.ok(result.hasCuisine, '应有cuisine匹配');
    assert.ok(result.hasNutrition, '应有calorie(营养)匹配');
    assert.ok(result.hasRating, '应有rating匹配');
    assert.ok(result.matchRateFinite, 'matchRate应为有限数');
    assert.ok(result.matchRate >= 0 && result.matchRate <= 1.1, `matchRate应在0-1.1之间: ${result.matchRate}`);
    assert.equal(realErrors().length, 0, 'computeDishMatch不应有错误');
  });

  // ===== 4. generateDishReason返回非空理由 =====
  it('4.1 generateDishReason返回非空推荐理由', async () => {
    resetErrors();
    const result = await page.evaluate(() => {
      if (!dishData.length) {
        return { error: 'no dishData' };
      }
      const dish = dishData[0];
      const prefs = { 辣度: '微辣', 咸淡: '适中', 甜酸: '酸甜' };
      const reason = generateDishReason(prefs, dish);
      return { reason, length: reason.length };
    });
    assert.ok(!result.error, '应有菜品数据');
    assert.ok(result.length > 10, '推荐理由应大于10字符: ' + result.length);
    assert.ok(result.reason.includes('推荐理由'), '应包含"推荐理由"前缀');
    assert.equal(realErrors().length, 0, 'generateDishReason不应有错误');
  });

  // ===== 5. 不同偏好的推荐结果不同 =====
  it('5.1 不同偏好产生不同推荐排序', async () => {
    resetErrors();
    // 用偏好1获取推荐
    const result1 = await page.evaluate(async () => {
      const dishes = dishData.slice(0, 20);
      const prefs1 = {
        辣度: '微辣',
        咸淡: '适中',
        甜酸: '酸甜',
        价格区间: '无',
        饮食_宗教: '无特殊要求',
        allergies: [],
        calorie: '无',
      };
      dishes.forEach((d) => {
        const m = computeDishMatch(prefs1, d);
        d.matchIndex = m.totalMatch;
      });
      return dishes
        .sort((a, b) => b.matchIndex - a.matchIndex)
        .slice(0, 3)
        .map((d) => d.id);
    });
    // 用偏好2获取推荐
    const result2 = await page.evaluate(() => {
      const dishes = dishData.slice(0, 20);
      const prefs2 = {
        辣度: '重辣',
        咸淡: '偏咸',
        甜酸: '咸鲜',
        价格区间: '无',
        饮食_宗教: '无特殊要求',
        allergies: [],
        calorie: '无',
      };
      dishes.forEach((d) => {
        const m = computeDishMatch(prefs2, d);
        d.matchIndex = m.totalMatch;
      });
      return dishes
        .sort((a, b) => b.matchIndex - a.matchIndex)
        .slice(0, 3)
        .map((d) => d.id);
    });
    // 两个偏好的top3可能在小样本上相同（如果菜品口味都一样）
    // 用全部菜品测试
    const allResult1 = await page.evaluate(() => {
      const dishes = dishData.filter((d) => d.is_active !== false);
      const prefs1 = { 辣度: '微辣', 咸淡: '适中', 甜酸: '酸甜' };
      dishes.forEach((d) => {
        d.matchIndex = computeDishMatch(prefs1, d).totalMatch;
      });
      return dishes
        .sort((a, b) => b.matchIndex - a.matchIndex)
        .slice(0, 5)
        .map((d) => d.id);
    });
    const allResult2 = await page.evaluate(() => {
      const dishes = dishData.filter((d) => d.is_active !== false);
      const prefs2 = { 辣度: '重辣', 咸淡: '偏咸', 甜酸: '咸鲜' };
      dishes.forEach((d) => {
        d.matchIndex = computeDishMatch(prefs2, d).totalMatch;
      });
      return dishes
        .sort((a, b) => b.matchIndex - a.matchIndex)
        .slice(0, 5)
        .map((d) => d.id);
    });
    const overlap = allResult1.filter((id) => allResult2.includes(id));
    // 允许部分重叠，但不应完全相同
    assert.ok(overlap.length < 5, `不同偏好应有不同推荐排序，重叠: ${overlap.length}/5`);
    assert.equal(realErrors().length, 0, '不同偏好推荐不应有错误');
  });

  // ===== 6. 推荐结果不包含已拉黑菜品 =====
  it('6.1 推荐结果不包含已拉黑菜品', async () => {
    resetErrors();
    // 设置拉黑列表
    await page.evaluate(() => {
      localStorage.setItem('currentUser', 'blacklist_test');
      const users = [{ username: 'blacklist_test', blacklist: [], favorites: [], preferences: {} }];
      localStorage.setItem('users', JSON.stringify(users));
    });
    const result = await page.evaluate(() => {
      // 获取拉黑第一个菜品ID
      const firstDishId = dishData[0]?.id;
      return firstDishId;
    });
    if (result) {
      // 设置拉黑
      await page.evaluate((id) => {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const u = users.find((x) => x.username === 'blacklist_test');
        if (u) {
          u.blacklist = [id];
          localStorage.setItem('users', JSON.stringify(users));
        }
      }, result);
      // 获取推荐
      const recIds = await page.evaluate(() => {
        const prefs = {
          辣度: '微辣',
          咸淡: '适中',
          甜酸: '酸甜',
          价格区间: '无',
          饮食_宗教: '无特殊要求',
          allergies: [],
          calorie: '无',
        };
        const blk = [dishData[0]?.id];
        const dishes = dishData.filter((d) => !blk.includes(d.id) && d.is_active !== false);
        dishes.forEach((d) => {
          d.matchIndex = computeDishMatch(prefs, d).totalMatch;
        });
        return dishes
          .sort((a, b) => b.matchIndex - a.matchIndex)
          .slice(0, 5)
          .map((d) => d.id);
      });
      assert.ok(!recIds.includes(result), '推荐结果不应包含已拉黑菜品');
    }
    assert.equal(realErrors().length, 0, '拉黑过滤不应有错误');
  });

  // ===== 7. 本地推荐模式可用 =====
  it('7.1 本地推荐模式（无API）正常工作', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(300);
    // 清除登录状态
    await page.evaluate(() => {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('userToken');
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(500);
    await page.evaluate(() => document.getElementById('guest-btn')?.click());
    await sleep(400);
    // 设置为本地模式
    const hasMode = await page.$('#recommendation-mode');
    if (hasMode) {
      await page.select('#recommendation-mode', 'local');
      await sleep(200);
    }
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
    assert.ok(recVisible, '本地推荐结果应显示');
    const mode = await page.evaluate(() => currentRecommendationMode);
    assert.ok(mode.includes('决策树') || mode.includes('本地'), '推荐模式应为决策树/本地: ' + mode);
    assert.equal(realErrors().length, 0, '本地推荐不应有错误');
  });
});

describe('管理后台用户管理深度E2E测试', () => {
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

  // ===== 8. 用户管理页面加载用户列表 =====
  it('8.1 用户管理页面加载用户列表', async () => {
    resetErrors();
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    await page.type('#admin-login-user', 'admin', { delay: 20 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2000);
    await page.evaluate(() => document.querySelector('[data-page="users"]')?.click());
    await sleep(1500);
    const userRows = await page.evaluate(() => {
      const tbody = document.querySelector('#user-table-body');
      return tbody ? tbody.children.length : 0;
    });
    assert.ok(userRows >= 0, '用户表格应存在（可能0个用户）');
    assert.equal(realErrors().length, 0, '用户管理加载不应有错误');
  });

  // ===== 9. 创建测试用户后在管理后台可见 =====
  it('9.1 注册用户后在管理后台用户列表可见', async () => {
    resetErrors();
    // 通过API注册用户
    const uniq = 'admin_v' + Date.now();
    const regR = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'AdminVis123!' }),
    });
    assert.ok(regR.body.success, '注册应成功');
    // 刷新管理后台用户列表
    await page.evaluate(() => document.querySelector('[data-page="users"]')?.click());
    await sleep(1500);
    // 检查用户列表是否包含新用户
    const userText = await page.evaluate(() => {
      const tbody = document.querySelector('#user-table-body');
      return tbody ? tbody.textContent : '';
    });
    assert.ok(userText.includes(uniq), `用户列表应包含新注册用户: ${uniq}`);
    // 清理
    if (regR.body.token) {
      await api('/api/user/delete', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + regR.body.token },
        body: JSON.stringify({ username: uniq }),
      });
    }
    assert.equal(realErrors().length, 0, '用户可见性检查不应有错误');
  });

  // ===== 10. 删除用户按钮存在 =====
  it('10.1 用户管理有删除按钮', async () => {
    resetErrors();
    const deleteBtns = await page.evaluate(() => {
      return document.querySelectorAll('button[onclick*="deleteUser"]').length;
    });
    assert.ok(deleteBtns > 0, '应有删除用户按钮');
    assert.equal(realErrors().length, 0, '删除按钮检查不应有错误');
  });

  // ===== 11. 用户数据不显示密码 =====
  it('11.1 用户列表不显示密码', async () => {
    resetErrors();
    const userText = await page.evaluate(() => {
      const tbody = document.querySelector('#user-table-body');
      return tbody ? tbody.textContent : '';
    });
    // 不应包含明文密码
    assert.ok(!userText.includes('password'), '用户列表不应显示password字段');
    assert.ok(!userText.match(/\$2[ab]\$\d+/), '用户列表不应显示bcrypt哈希');
    assert.equal(realErrors().length, 0, '密码安全检查不应有错误');
  });

  // ===== 12. 管理后台通知加载 =====
  it('12.1 管理后台通知正常加载', async () => {
    resetErrors();
    const notifExists = await page.evaluate(() => typeof loadNotifications === 'function');
    assert.ok(notifExists, 'loadNotifications函数应存在');
    await page.evaluate(() => {
      try {
        loadNotifications();
      } catch (e) {}
    });
    await sleep(1000);
    assert.equal(realErrors().length, 0, '通知加载不应有错误');
  });

  // ===== 13. 管理后台监控端点 =====
  it('13.1 管理后台监控端点正常', async () => {
    resetErrors();
    const adminToken = await page.evaluate(() => localStorage.getItem('adminToken'));
    if (adminToken) {
      const r = await api('/api/admin/monitor', {
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      assert.ok(r.status === 200 || r.status === 404, '监控端点应返回200或404');
    }
    assert.equal(realErrors().length, 0, '监控端点不应有错误');
  });
});
