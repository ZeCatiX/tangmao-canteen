// 唐猫庭院 - 剩余基础设施文件最终检查
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

describe('剩余基础设施文件最终检查', () => {

  // ===== 1. db.js 数据库连接模块 =====
  it('1.1 db.js 存在且包含pg连接', () => {
    const content = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
    assert.ok(content.includes('require(\'pg\')') || content.includes('require("pg")'), '应使用pg');
    assert.ok(content.includes('Pool') || content.includes('Client'), '应创建Pool或Client');
    assert.ok(content.length > 50, '应有实质内容');
  });

  // ===== 2. migrate_to_pg.js 迁移脚本 =====
  it('2.1 migrate_to_pg.js 存在且包含迁移逻辑', () => {
    const content = fs.readFileSync(path.join(ROOT, 'migrate_to_pg.js'), 'utf8');
    // 通过require('./db')使用pg连接池
    assert.ok(content.includes('require') || content.includes('INSERT'), '应包含require或INSERT');
    assert.ok(content.length > 100, '应有实质内容');
  });

  // ===== 3. CHANGELOG.md 存在且有内容 =====
  it('3.1 CHANGELOG.md 存在且包含版本记录', () => {
    const content = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    assert.ok(content.includes('## ') || content.includes('# '), '应包含版本标题');
    assert.ok(content.length > 100, '应有版本记录内容');
  });

  // ===== 4. CHECKLIST.md 存在 =====
  it('4.1 CHECKLIST.md 存在且包含检查标题', () => {
    const content = fs.readFileSync(path.join(ROOT, 'CHECKLIST.md'), 'utf8');
    assert.ok(content.includes('##') || content.includes('检查'), '应包含检查标题');
    assert.ok(content.length > 100, '应有实质内容');
  });

  // ===== 5. CONTRIBUTING.md 存在 =====
  it('5.1 CONTRIBUTING.md 存在且包含贡献指南', () => {
    const content = fs.readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8');
    assert.ok(content.length > 50, '应有贡献指南内容');
  });

  // ===== 6. README.md 存在且完整 =====
  it('6.1 README.md 存在且包含项目说明', () => {
    const content = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    assert.ok(content.includes('唐猫') || content.includes('食堂'), '应包含项目名');
    assert.ok(content.length > 100, '应有完整说明');
  });

  // ===== 7. install.bat 安装脚本 =====
  it('7.1 install.bat 存在且包含安装命令', () => {
    const content = fs.readFileSync(path.join(ROOT, 'install.bat'), 'utf8');
    assert.ok(content.includes('npm') || content.includes('node'), '应包含npm或node命令');
    assert.ok(content.length > 50, '应有实质内容');
  });

  // ===== 8. .dockerignore 存在 =====
  it('8.1 .dockerignore 存在且包含排除项', () => {
    const content = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
    assert.ok(content.includes('node_modules') || content.includes('.env'), '应包含关键排除项');
  });

  // ===== 9. optimize_images.js 存在 =====
  it('9.1 optimize_images.js 存在且包含图片处理逻辑', () => {
    const content = fs.readFileSync(path.join(ROOT, 'optimize_images.js'), 'utf8');
    assert.ok(content.includes('sharp') || content.includes('fs'), '应使用sharp或fs');
    assert.ok(content.length > 100, '应有实质内容');
  });

  // ===== 10. edit_package.js 存在 =====
  it('10.1 edit_package.js 存在且包含编辑逻辑', () => {
    const content = fs.readFileSync(path.join(ROOT, 'edit_package.js'), 'utf8');
    assert.ok(content.length > 50, '应有实质内容');
  });

  // ===== 11. 所有文件无BOM =====
  it('11.1 所有JS/JSON文件无BOM头', () => {
    const files = ['db.js', 'migrate_to_pg.js', 'edit_package.js', 'optimize_images.js',
      'ecosystem.config.js', 'build.js', 'backup_db.js', 'logger.js', 'auth.js', 'user_storage.js'];
    let bomCount = 0;
    for (const f of files) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) bomCount++;
    }
    assert.equal(bomCount, 0, '不应有BOM头文件');
  });

  // ===== 12. 所有JS文件有内容 =====
  it('12.1 所有JS文件有内容', () => {
    const files = ['db.js', 'migrate_to_pg.js', 'edit_package.js', 'optimize_images.js',
      'ecosystem.config.js', 'build.js', 'backup_db.js', 'logger.js', 'auth.js', 'user_storage.js'];
    for (const f of files) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, 'utf8');
      assert.ok(content.length > 50, `${f}应有内容`);
    }
  });
});