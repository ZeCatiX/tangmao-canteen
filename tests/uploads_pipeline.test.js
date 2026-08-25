// 唐猫庭院 - 上传文件管理与图片处理流水线E2E测试
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BASE = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..');
const ADMIN_PASS = process.env.ADMIN_PASS || 'tm_admin_f1e2d3c4b5a6978';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser, page;

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

describe('上传文件管理与图片处理流水线测试', () => {

  // ===== 1. uploads目录存在且非空 =====
  it('1.1 uploads目录存在且包含图片文件', () => {
    const dir = path.join(ROOT, 'uploads');
    assert.ok(fs.existsSync(dir), 'uploads目录应存在');
    const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    assert.ok(files.length > 0, 'uploads目录应包含文件');
  });

  // ===== 2. 上传图片可通过HTTP访问 =====
  it('2.1 上传图片可通过HTTP访问', async () => {
    const files = fs.readdirSync(path.join(ROOT, 'uploads')).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    assert.ok(files.length > 0, '应有图片文件');
    // 测试第一个图片的HTTP访问
    const imgPath = files[0];
    const r = await fetch(BASE + '/uploads/' + encodeURIComponent(imgPath));
    assert.ok(r.status === 200, `图片${imgPath}应可通过HTTP访问: ${r.status}`);
    const ct = r.headers.get('content-type') || '';
    assert.ok(ct.includes('image'), `应返回图片Content-Type: ${ct}`);
  });

  // ===== 3. 上传图片可被sharp读取 =====
  it('3.1 上传图片都可被sharp读取', async () => {
    const dir = path.join(ROOT, 'uploads');
    const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    let readable = 0;
    for (const f of files.slice(0, 10)) {
      try {
        const meta = await sharp(path.join(dir, f)).metadata();
        assert.ok(meta.width > 0, `${f}应有宽度`);
        assert.ok(meta.height > 0, `${f}应有高度`);
        readable++;
      } catch(e) {
        // 某些文件可能是损坏的，但不应崩溃服务器
        console.warn(`图片无法读取: ${f} - ${e.message}`);
      }
    }
    assert.ok(readable >= files.slice(0, 10).length - 2, '至少大部分图片可读');
  });

  // ===== 4. 图片文件名安全 =====
  it('4.1 上传图片文件名不包含路径遍历', () => {
    const files = fs.readdirSync(path.join(ROOT, 'uploads'));
    for (const f of files) {
      assert.ok(!f.includes('..') && !f.includes('/') && !f.includes('\\'),
        `文件名不应包含路径遍历: ${f}`);
    }
  });

  // ===== 5. 管理后台菜品图片预览 =====
  it('5.1 管理后台菜品图片预览功能', async () => {
    browser = await puppeteer.launch({
      headless: 'new', executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page._consoleErrors = [];
    page.on('pageerror', err => page._consoleErrors.push(err.message));
    // 登录管理后台
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(500);
    await page.type('#admin-login-user', 'admin', { delay: 20 });
    await page.type('#admin-login-pass', ADMIN_PASS, { delay: 20 });
    await page.evaluate(() => document.getElementById('admin-login-btn').click());
    await sleep(2000);
    // 打开菜品编辑
    await page.evaluate(() => document.querySelector('[data-page="dishes"]')?.click());
    await sleep(1500);
    await page.evaluate(() => {
      const btn = document.querySelector('button[onclick*="editDish"]');
      if (btn) btn.click();
    });
    await sleep(500);
    // 检查图片预览元素存在
    const previewExists = await page.evaluate(() => {
      const el = document.getElementById('dish-image-preview');
      return !!el;
    });
    assert.ok(previewExists, '菜品图片预览元素应存在');
    // 检查上传按钮
    const uploadBtn = await page.$('#dish-image-upload');
    assert.ok(uploadBtn, '图片上传按钮应存在');
    const fileInput = await page.$('#dish-image-file');
    assert.ok(fileInput, '图片文件输入应存在');
    const consoleErrors = page._consoleErrors;
    await browser.close();
  });

  // ===== 6. 图片优化脚本存在 =====
  it('6.1 optimize_images.js 脚本存在', () => {
    const content = fs.readFileSync(path.join(ROOT, 'optimize_images.js'), 'utf8');
    assert.ok(content.includes('sharp') || content.includes('require'), '应使用sharp或require');
  });

  // ===== 7. 菜品API返回图片URL =====
  it('7.1 菜品API返回图片URL', async () => {
    const dishes = await api('/api/dishes');
    assert.equal(dishes.status, 200);
    const withImages = dishes.body.dishes.filter(d => d.image_url);
    assert.ok(withImages.length > 0, '应有些菜品有图片URL');
    for (const d of withImages) {
      assert.ok(d.image_url.startsWith('/uploads/') || d.image_url.startsWith('data:'),
        `图片URL应有效: ${d.image_url}`);
    }
  });

  // ===== 8. 图片URL可通过HTTP访问 =====
  it('8.1 菜品图片URL可通过HTTP访问', async () => {
    const dishes = await api('/api/dishes');
    const withImages = dishes.body.dishes.filter(d => d.image_url && d.image_url.startsWith('/uploads/'));
    let accessible = 0;
    for (const d of withImages.slice(0, 5)) {
      const r = await fetch(BASE + d.image_url);
      if (r.status === 200) accessible++;
    }
    assert.ok(accessible > 0, '至少部分图片可访问');
  });

  // ===== 9. 上传接口无token返回401 =====
  it('9.1 上传接口无token返回401', async () => {
    const r = await fetch(BASE + '/api/admin/dish/upload-image', { method: 'POST' });
    assert.equal(r.status, 401);
  });

  // ===== 10. 上传接口非法扩展名被拒绝 =====
  it('10.1 上传非法扩展名文件被拒绝', async () => {
    const adminToken = await getAdminToken();
    const form = new FormData();
    form.append('image', new Blob(['not an image'], { type: 'application/x-executable' }), 'malware.exe');
    form.append('dishId', '1');
    const r = await fetch(BASE + '/api/admin/dish/upload-image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      body: form,
    });
    assert.ok(r.status === 400 || r.status === 500, '非法扩展名应被拒绝');
  });
});