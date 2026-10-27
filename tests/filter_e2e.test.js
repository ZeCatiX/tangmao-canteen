// 唐猫庭院 - 菜单筛选器 E2E 测试
// 覆盖：分类筛选、辣度筛选、重置筛选、筛选结果严格匹配
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser, page;

describe('菜单筛选器测试', () => {
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
      if (msg.type() === 'error') {
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
    return page._consoleErrors.filter(
      (e) =>
        !e.includes('fonts.') &&
        !e.includes('401 (Unauthorized)') &&
        !e.includes('429 (Too Many Requests)') &&
        !e.includes('404 (Not Found)')
    );
  }

  it('1.1 分类筛选 - 招牌菜', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 25000 });
    await sleep(600);
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(800);
    // 2026-09-17: 分类选项值为全名
    await page.select('#menu-filter-cat', '招牌与游西安必打卡');
    await sleep(600);
    const info = await page.evaluate(() => {
      const count = document.getElementById('menu-count')?.textContent || '';
      const cards = document.querySelectorAll('#dataset-table-body .dish-card');
      // 2026-10-06:卡片副标题为 "分类 · 辣度 · 规格"(规格后加),按 " · " 分段取第1段=分类
      const cats = [
        ...new Set(
          [...cards].map((c) => {
            const p = c.querySelector('.dish-card-body p');
            if (!p) {
              return '';
            }
            return (p.textContent.split(' · ')[0] || '').trim();
          })
        ),
      ];
      return { count: count, rows: cards.length, cats: cats };
    });
    assert.ok(info.rows >= 1 && info.rows <= 69, '筛选后行数应1-69: ' + info.rows);
    assert.ok(
      info.cats.every(function (c) {
        return c === '招牌与游西安必打卡';
      }),
      '所有行都应是招牌: ' + info.cats.join(',')
    );
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  it('1.2 辣度筛选 - 不辣', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 25000 });
    await sleep(600);
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(800);
    await page.select('#menu-filter-spice', '不辣');
    await sleep(600);
    const info = await page.evaluate(() => {
      const count = document.getElementById('menu-count')?.textContent || '';
      const cards = document.querySelectorAll('#dataset-table-body .dish-card');
      // 第2段=辣度(规格在第3段,分类名内部的 · 无空格不受影响)
      const spices = [
        ...new Set(
          [...cards].map(function (c) {
            const p = c.querySelector('.dish-card-body p');
            if (!p) {
              return '';
            }
            return (p.textContent.split(' · ')[1] || '').trim();
          })
        ),
      ];
      return { count: count, rows: cards.length, spices: spices };
    });
    assert.ok(info.rows >= 1, '筛选后应有结果: ' + info.rows);
    assert.ok(
      info.spices.every(function (s) {
        return s === '不辣';
      }),
      '所有行都是不辣: ' + info.spices.join(',')
    );
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });

  it('1.3 重置筛选恢复全部菜品', async () => {
    resetErrors();
    await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 25000 });
    await sleep(600);
    await page.evaluate(() => document.getElementById('nav-dataset')?.click());
    await sleep(800);
    // 先筛选，再重置
    await page.select('#menu-filter-cat', '招牌与游西安必打卡');
    await sleep(400);
    await page.evaluate(() => document.getElementById('menu-reset-filter')?.click());
    await sleep(600);
    const info = await page.evaluate(() => {
      const count = document.getElementById('menu-count')?.textContent || '';
      const rows = document.querySelectorAll('#dataset-table-body .dish-card').length;
      return { count, rows };
    });
    assert.ok(info.rows >= 60, '重置后应显示全部菜品(>=60): ' + info.rows);
    // 计数应显示实际菜品数（不硬编码69，因为可能有测试菜品未清理）
    assert.ok(info.count.match(/\d+/), '计数应显示数字: ' + info.count);
    assert.equal(realErrors().length, 0, '不应有控制台错误: ' + realErrors().join('; '));
  });
});
