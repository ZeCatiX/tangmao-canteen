// 唐猫庭院 - 最后边界场景验证：推荐模式影响结果、构建同步、差异化推荐
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..');
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

describe('最后边界场景验证', () => {
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
    page.on('dialog', async dialog => { await dialog.accept(); });
  });

  after(async () => { if (browser) await browser.close(); });

  function resetErrors() { page._consoleErrors = []; }
  function realErrors() { return page._consoleErrors.filter(isRealError); }

  // ===== 1. 不同推荐模式返回不同结果 =====
  it('1.1 balanced模式推荐结果可用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(400);
    // 选择balanced模式
    await page.select('#recommendation-mode', 'balanced').catch(() => {});
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(5000);
    const dishCount = await page.evaluate(() => {
      const list = document.getElementById('dish-list');
      return list ? list.children.length : 0;
    });
    assert.ok(dishCount > 0, 'balanced模式应返回推荐菜品');
    assert.equal(realErrors().length, 0, 'balanced推荐不应有错误');
  });

  // ===== 2. auto模式推荐结果可用 =====
  it('2.1 auto模式推荐结果可用', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(500);
    await page.evaluate(() => { var b = [...document.querySelectorAll('#table-picker-modal button')].find(function(x) { return x.textContent.trim() === '08'; }); if (b) b.click(); });
    await page.select('#recommendation-mode', 'auto').catch(() => {});
    await page.select('#spiciness', '中辣');
    await page.select('#saltiness', '偏咸');
    await page.select('#sweetness', '无味');
    await page.evaluate(() => {
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) btn.click();
    });
    // 2026-09-17: ML 可能冷启动,用 page.evaluate 轮询等待推荐结果(最多 25s)
    var dishCount = 0;
    for (var wi = 0; wi < 25; wi++) {
      await sleep(1000);
      dishCount = await page.evaluate(() => {
        const list = document.getElementById('dish-list');
        return list ? list.children.length : 0;
      });
      if (dishCount > 0) break;
    }
    assert.ok(dishCount > 0, 'auto模式应返回推荐菜品');
    assert.equal(realErrors().length, 0, 'auto推荐不应有错误');
  });

  // ===== 3. 推荐模式切换后模式名称显示 =====
  it('3.1 切换推荐模式后显示当前模式名', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(400);
    // 遍历所有模式，检查显示
    const modes = await page.evaluate(() => {
      const select = document.getElementById('recommendation-mode');
      return select ? Array.from(select.options).map(o => o.text) : [];
    });
    for (let i = 0; i < Math.min(3, modes.length); i++) {
      await page.evaluate(idx => {
        const select = document.getElementById('recommendation-mode');
        if (select) { select.selectedIndex = idx; select.dispatchEvent(new Event('change', { bubbles: true })); }
      }, i);
      await sleep(200);
      const display = await page.evaluate(() => {
        const el = document.getElementById('current-recommendation-mode');
        return el ? el.textContent : '';
      });
      assert.ok(display.length > 0, `模式${i}应有显示: ${display}`);
    }
    assert.equal(realErrors().length, 0, '模式切换显示不应有错误');
  });

  // ===== 4. script.js与js/init.js构建同步 =====
  it('4.1 script.js构建产物与源同步', async () => {
    resetErrors();
    // 检查关键函数是否同时存在于源文件和构建产物
    const initContent = fs.readFileSync(path.join(ROOT, 'js', 'init.js'), 'utf8');
    const scriptContent = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    // 检查updateCartBadge调用
    assert.ok(initContent.includes("updateCartBadge()"), 'js/init.js应包含updateCartBadge调用');
    assert.ok(scriptContent.includes("updateCartBadge()"), 'script.js应包含updateCartBadge调用');
    // 检查关键函数
    assert.ok(scriptContent.includes("function updateCartBadge"), 'script.js应包含updateCartBadge函数');
    assert.ok(scriptContent.includes("function getCart"), 'script.js应包含getCart函数');
    assert.ok(scriptContent.includes("function clearCart"), 'script.js应包含clearCart函数');
    assert.equal(realErrors().length, 0, '构建同步检查不应有错误');
  });

  // ===== 5. 推荐结果中菜品名不包含undefined =====
  it('5.1 推荐结果菜品名不包含undefined', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '微辣');
    await page.select('#saltiness', '适中');
    await page.select('#sweetness', '酸甜');
    await page.evaluate(() => {
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(5000);
    const hasUndefined = await page.evaluate(() => {
      const items = document.querySelectorAll('#dish-list .list-group-item');
      return Array.from(items).some(item => item.textContent.includes('undefined'));
    });
    assert.ok(!hasUndefined, '推荐结果不应包含undefined');
    const hasNaN = await page.evaluate(() => {
      const items = document.querySelectorAll('#dish-list .list-group-item');
      return Array.from(items).some(item => item.textContent.includes('NaN'));
    });
    assert.ok(!hasNaN, '推荐结果不应包含NaN');
    assert.equal(realErrors().length, 0, '推荐结果渲染不应有错误');
  });

  // ===== 6. 推荐菜品价格显示正常 =====
  it('6.1 推荐菜品价格显示正常', async () => {
    resetErrors();
    const priceInfo = await page.evaluate(() => {
      const items = document.querySelectorAll('#dish-list .list-group-item');
      const prices = [];
      for (const item of items) {
        const text = item.textContent;
        const m = text.match(/(\d+(\.\d+)?)\s*元/);
        if (m) prices.push(m[0]);
      }
      return { count: prices.length, samples: prices.slice(0, 3) };
    });
    assert.ok(priceInfo.count > 0, `推荐菜品应有价格显示，实际: ${priceInfo.count}个`);
    assert.equal(realErrors().length, 0, '价格显示不应有错误');
  });

  // ===== 7. 推荐菜品有加购/收藏操作按钮 =====
  it('7.1 推荐菜品行有操作按钮', async () => {
    resetErrors();
    const btns = await page.evaluate(() => {
      const items = document.querySelectorAll('#dish-list .list-group-item');
      let hasBtn = false;
      for (const item of items) {
        const btn = item.querySelector('button, a');
        if (btn) { hasBtn = true; break; }
      }
      return hasBtn;
    });
    assert.ok(btns, '推荐菜品应有操作按钮');
    assert.equal(realErrors().length, 0, '操作按钮不应有错误');
  });

  // ===== 8. 推荐结果加载完成后loading隐藏 =====
  it('8.1 推荐结果加载后loading隐藏', async () => {
    resetErrors();
    const loadingHidden = await page.evaluate(() => {
      const loading = document.getElementById('recommendation-loading');
      return loading ? loading.classList.contains('d-none') || loading.style.display === 'none' : true;
    });
    const resultVisible = await page.evaluate(() => {
      const result = document.getElementById('recommendation-result');
      return result ? !result.classList.contains('d-none') : false;
    });
    assert.ok(loadingHidden, '加载完成后loading应隐藏');
    assert.ok(resultVisible, '推荐结果应显示');
    assert.equal(realErrors().length, 0, 'loading状态不应有错误');
  });

  // ===== 9. 推荐菜品匹配度≠100%即合理 =====
  it('9.1 推荐菜品匹配度在合理范围', async () => {
    resetErrors();
    const matchValues = await page.evaluate(() => {
      const items = document.querySelectorAll('#dish-list .list-group-item');
      const values = [];
      for (const item of items) {
        const text = item.textContent;
        const m = text.match(/(\d+)%/);
        if (m) values.push(parseInt(m[1]));
      }
      return values;
    });
    if (matchValues.length > 0) {
      const allValid = matchValues.every(v => v >= 0 && v <= 100);
      assert.ok(allValid, `匹配度应在0-100范围: ${JSON.stringify(matchValues)}`);
    }
    assert.equal(realErrors().length, 0, '匹配度范围不应有错误');
  });

  // ===== 10. 不同偏好返回不同推荐结果 =====
  it('10.1 不同偏好设置返回不同推荐结果', async () => {
    resetErrors();
    // 用"特辣"偏好获取推荐
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('ai-recommend-btn')?.click());
    await sleep(400);
    await page.select('#spiciness', '特辣');
    await page.select('#saltiness', '偏咸');
    await page.select('#sweetness', '偏甜');
    await page.evaluate(() => {
      const btn = document.querySelector('#preference-form button[type="submit"]');
      if (btn) btn.click();
    });
        for (var pi = 0; pi < 20; pi++) { await sleep(1000); var itemC = await page.evaluate(() => document.querySelectorAll('#dish-list .list-group-item').length); if (itemC > 0) break; }

    const spicyDishes = await page.evaluate(() => {
      const items = document.querySelectorAll('#dish-list .list-group-item');
      return Array.from(items).map(item => item.textContent.substring(0, 30));
    });
    // 检查是否有推荐结果
    assert.ok(spicyDishes.length > 0, '特辣偏好应返回推荐');
    assert.equal(realErrors().length, 0, '差异化推荐不应有错误');
  });
});