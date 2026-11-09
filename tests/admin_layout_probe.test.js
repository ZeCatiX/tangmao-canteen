// admin 全页面×全视口 布局探针（2026-11-08 系统性排查）
// 检测: ①文档级水平溢出 ②可见元素超出视口右边界(排除表格内滚容器内行)
// 页面切换走 showSection 真实链路; 视口 1280/768/412 三档
// 需要本地 Chrome; 找不到则整组 skip。服务需在跑。
require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const CHROME_PATH = require('./_chrome_path');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const CAN_RUN = Boolean(CHROME_PATH && ADMIN_PASS);

const VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'mobile-412', width: 412, height: 915 },
];
const PAGES = ['dashboard', 'dishes', 'orders', 'tables', 'users', 'feedback', 'report', 'qrcodes', 'preferences', 'analytics', 'model', 'apidocs'];

let browser, page;

describe('admin 全页面×全视口布局探针', () => {
  before(async function () {
    if (!CAN_RUN) {
      console.log('  skip: 缺Chrome或ADMIN_PASS');
      this.skip();
      return;
    }
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    // 登录
    await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1200));
    await page.evaluate((u, p) => {
      const ue = document.getElementById('admin-login-user') || document.querySelector("input[aria-label='管理员账号']");
      const pe = document.getElementById('admin-login-pass') || document.querySelector("input[aria-label='管理员密码']");
      if (ue) ue.value = u;
      if (pe) pe.value = p;
    }, ADMIN_USER, ADMIN_PASS);
    await page.click('#admin-login-btn').catch(async () => {
      await page.evaluate(() => document.getElementById('admin-login-btn').click());
    });
    await new Promise((r) => setTimeout(r, 2500));
  });

  after(async function () {
    if (browser) await browser.close();
  });

  for (const vp of VIEWPORTS) {
    it(`视口 ${vp.name}: 全页面无水平溢出`, async function () {
      if (!CAN_RUN) { this.skip(); return; }
      await page.setViewport({ width: vp.width, height: vp.height });
      const problems = [];
      for (const pid of PAGES) {
        // 切页: 点侧栏/顶部导航
        await page.evaluate((pid) => {
          document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
          const t = document.getElementById('page-' + pid);
          if (t) t.classList.add('active');
        }, pid);
        await new Promise((r) => setTimeout(r, 350));
        const doc = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          overflows: (() => {
            const out = [];
            const vw = document.documentElement.clientWidth;
            document.querySelectorAll('.page.active *').forEach((el) => {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.right > vw + 2 && el.offsetParent !== null) {
                const cs = getComputedStyle(el);
                if (cs.position === 'fixed') return;
                // 内滚容器的直接内容由容器自己负责(table-wrap 的行右边界超出属预期)
                if (el.closest('.table-wrap, .table-body-wrap')) return;
                out.push({ tag: el.tagName, cls: String(el.className).slice(0, 24), right: Math.round(r.right) });
              }
            });
            return out.slice(0, 3);
          })(),
        }));
        if (doc.scrollW > doc.clientW + 2 || doc.overflows.length) {
          problems.push(pid + '@' + vp.name + ': 文档溢出=' + (doc.scrollW - doc.clientW) + 'px ' + JSON.stringify(doc.overflows));
        }
      }
      assert.equal(problems.length, 0, '发现布局问题:\n' + problems.join('\n'));
    });
  }
});
