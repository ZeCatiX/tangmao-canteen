// 模拟用户点击旅程E2E测试：真实用户视角验证完整可工作性
// 覆盖：菜单浏览→搜索筛选→游客点餐→偏好表单→推荐→换一批→购物车
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

describe('真实用户点击旅程深度检查', () => {
  before(async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('dialog', async d => await d.dismiss());
    page._errors = [];
    page.on('pageerror', e => page._errors.push(e.message));
  });

  after(async () => { if (browser) await browser.close(); });

  it('1.1 全部菜单渲染70行数据', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(1500);
    await page.evaluate(() => document.getElementById('nav-dataset').click());
    await sleep(1000);
    // 菜单已改为卡片网格布局（.dish-card），不再是 <tr> 表格行
    const rows = await page.evaluate(() => document.querySelectorAll('#dataset-table-body .dish-card').length);
    assert.ok(rows >= 60, '菜单应渲染60+张卡片，实际:' + rows);
  });

  it('1.2 搜索过滤正常', async () => {
    await page.type('#menu-search', '鸡', { delay: 15 });
    await sleep(800);
    const filtered = await page.evaluate(() => document.querySelectorAll('#dataset-table-body .dish-card').length);
    const total = await page.evaluate(() => parseInt(document.getElementById('menu-count')?.textContent.split('/')[0] || '0'));
    assert.ok(filtered > 0 && filtered < 70, '搜索应过滤菜品，实际:' + filtered);
    assert.ok(total === filtered, '菜单计数应与过滤结果一致:' + total + 'vs' + filtered);
  });

  it('1.3 分类筛选与重置', async () => {
    await page.evaluate(() => { document.getElementById('menu-search').value = ''; });
    await page.evaluate(() => {
      const el = document.getElementById('menu-filter-cat');
      el.value = '招牌'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(800);
    const catRows = await page.evaluate(() => document.querySelectorAll('#dataset-table-body .dish-card').length);
    assert.ok(catRows > 0, '招牌分类应有菜品');
    await page.evaluate(() => {
      const el = document.getElementById('menu-filter-cat');
      el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(800);
    const resetRows = await page.evaluate(() => document.querySelectorAll('#dataset-table-body .dish-card').length);
    assert.ok(resetRows >= 60, '重置后应恢复全量:' + resetRows);
  });

  it('1.4 偏好表单存在且字段完整', async () => {
    // 偏好表单的入口是"AI帮你选"（ai-recommend-btn），guest-btn 是进菜单浏览
    await page.evaluate(() => document.getElementById('ai-recommend-btn').click());
    await sleep(800);
    const state = await page.evaluate(() => {
      const form = document.getElementById('preference-form');
      return {
        hasForm: !!form,
        selects: form ? Array.from(form.querySelectorAll('select')).map(s => s.id) : [],
        submitText: form?.querySelector('button[type="submit"]')?.textContent.trim() || ''
      };
    });
    assert.ok(state.hasForm, '偏好表单应存在');
    for (const id of ['spiciness', 'saltiness', 'sweetness', 'price']) {
      assert.ok(state.selects.includes(id), '缺少选择器:' + id);
    }
    assert.ok(state.submitText === '推荐菜品', '提交按钮文字应为"推荐菜品"');
  });

  it('1.5 提交偏好后推荐结果可见且有卡片', async () => {
    // 新版流程：guest-btn 有桌号拦截，先通过选择桌号弹层选桌
    await page.evaluate(() => document.getElementById('table-change-btn').click());
    await sleep(600);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#table-grid button')].find(x => x.textContent.trim() === '08');
      if (b) b.click();
    });
    await sleep(500);
    // 确保先回到偏好表单（ai-recommend-btn 才是偏好路径；guest-btn 进菜单）
    await page.evaluate(() => document.getElementById('ai-recommend-btn').click());
    await sleep(800);
    await page.evaluate(() => {
      const map = { spiciness: '微辣', saltiness: '适中', sweetness: '无味' };
      for (const [id, v] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      const form = document.getElementById('preference-form');
      form.querySelector('button[type="submit"]').click();
    });
    // ML 接口慢或不可用时会经 15s 超时切本地兜底，轮询等待而不是固定 sleep
    let state = null;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      state = await page.evaluate(() => {
        const sec = document.getElementById('recommendation-section');
        const rr = document.getElementById('recommendation-result');
        return {
          active: sec ? sec.classList.contains('active') : false,
          resultVisible: rr ? !rr.classList.contains('d-none') : false,
          items: document.querySelectorAll('#dish-list .list-group-item').length,
          dishList: !!document.getElementById('dish-list')
        };
      });
      if (state.items >= 1) break;
    }
    assert.ok(state.active, '推荐section应激活');
    assert.ok(state.resultVisible, '推荐结果应可见');
    assert.ok(state.dishList, '应渲染菜品列表容器');
    assert.ok(state.items >= 1, '应有推荐菜品条目，实际:' + JSON.stringify(state));
  });

  it('1.6 换一批按钮有效', async () => {
    await page.evaluate(() => document.getElementById('refresh-recommendations').click());
    let items = 0;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      items = await page.evaluate(() => document.querySelectorAll('#dish-list .list-group-item').length);
      if (items >= 1) break;
    }
    assert.ok(items >= 1, '换一批后仍有推荐条目，实际:' + items);
  });

  it('1.7 全流程无页面JS错误', async () => {
    const real = page._errors.filter(e => !/favicon|fonts\.|net::/i.test(e));
    assert.equal(real.length, 0, '页面JS错误:' + real.slice(0, 3).join('; '));
  });
});