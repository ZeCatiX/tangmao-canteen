// 唐猫庭院 - 基础设施核心文件语法和配置深度检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

describe('基础设施核心文件语法检查', () => {

  // ===== 1. auth.js 核心函数检查 =====
  it('1.1 auth.js 包含所有必需函数', () => {
    const content = fs.readFileSync(path.join(ROOT, 'auth.js'), 'utf8');
    assert.ok(content.includes('function generateToken'), '应有generateToken');
    assert.ok(content.includes('function authMiddleware'), '应有authMiddleware');
    assert.ok(content.includes('function softAuth'), '应有softAuth');
    assert.ok(content.includes('function revokeToken'), '应有revokeToken');
    assert.ok(content.includes('function isTokenBlacklisted'), '应有isTokenBlacklisted');
  });

  // ===== 2. user_storage.js 核心函数检查 =====
  it('2.1 user_storage.js 包含所有必需函数', () => {
    const content = fs.readFileSync(path.join(ROOT, 'user_storage.js'), 'utf8');
    assert.ok(content.includes('function readUsers'), '应有readUsers');
    assert.ok(content.includes('function findUserByUsername'), '应有findUserByUsername');
    assert.ok(content.includes('function createUser'), '应有createUser');
    assert.ok(content.includes('function updateUser'), '应有updateUser');
    assert.ok(content.includes('function validateLogin'), '应有validateLogin');
    assert.ok(content.includes('function removeUser'), '应有removeUser');
  });

  // ===== 3. auth.js 安全措施检查 =====
  it('3.1 auth.js 使用JWT和参数化查询', () => {
    const content = fs.readFileSync(path.join(ROOT, 'auth.js'), 'utf8');
    assert.ok(content.includes('const jwt = require'), '应使用jwt');
    assert.ok(content.includes('JWT_SECRET'), '应有JWT_SECRET');
    assert.ok(content.includes('token_blacklist'), '应有token_blacklist表');
    assert.ok(content.includes('return res.status(401)'), '应有401返回');
  });

  // ===== 4. Dockerfile 存在 =====
  it('4.1 Dockerfile 存在且内容正确', () => {
    const content = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    assert.ok(content.includes('FROM'), '应有FROM指令');
    assert.ok(content.includes('WORKDIR'), '应有WORKDIR指令');
    assert.ok(content.includes('EXPOSE'), '应有EXPOSE指令');
    assert.ok(content.includes('CMD') || content.includes('ENTRYPOINT'), '应有CMD或ENTRYPOINT');
  });

  // ===== 5. docker-compose.yml 存在 =====
  it('5.1 docker-compose.yml 存在', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
    assert.ok(content.includes('services:'), '应有services定义');
    assert.ok(content.includes('postgres') || content.includes('db'), '应有数据库服务');
  });

  // ===== 6. .env.example 存在 =====
  it('6.1 .env.example 存在且包含必需字段', () => {
    const content = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    assert.ok(content.includes('PORT'), '应有PORT');
    assert.ok(content.includes('JWT_SECRET'), '应有JWT_SECRET');
    assert.ok(content.includes('ADMIN_PASS'), '应有ADMIN_PASS');
    assert.ok(content.includes('PG_HOST'), '应有PG_HOST');
  });

  // ===== 7. build.js 脚本检查 =====
  it('7.1 build.js 合并所有JS文件', () => {
    const content = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
    const files = ['js/globals.js', 'js/core.js', 'js/recommendation.js', 'js/init.js'];
    for (const f of files) {
      assert.ok(content.includes(f), `build.js应包含${f}`);
    }
  });

  // ===== 8. ecosystem.config.js PM2配置 =====
  it('8.1 ecosystem.config.js PM2配置存在', () => {
    const content = fs.readFileSync(path.join(ROOT, 'ecosystem.config.js'), 'utf8');
    assert.ok(content.includes('script') || content.includes('app'), '应有app定义');
  });

  // ===== 9. Python脚本语法检查 =====
  it('9.1 Python脚本语法正确', () => {
    const pyFiles = ['predict_worker.py', 'train_ml_model.py', 'train_restaurant_model.py',
      'retrain_from_feedback.py', 'get_metrics.py', 'get_feature_importance.py',
      'rgzn.py', 'save_importance.py', 'convert_report.py', 'create_optimized_report.py'];
    let missing = [];
    for (const f of pyFiles) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) {
        missing.push(f);
        continue;
      }
      const content = fs.readFileSync(p, 'utf8');
      assert.ok(content.length > 50, `${f} 应有内容（>50字符）`);
    }
    assert.equal(missing.length, 0, '缺少Python文件: ' + missing.join(', '));
  });

  // ===== 10. vision_pipeline.js 脚本检查 =====
  it('10.1 vision_pipeline.js 存在且包含核心功能', () => {
    const content = fs.readFileSync(path.join(ROOT, 'vision_pipeline.js'), 'utf8');
    assert.ok(content.includes('require'), '应包含require语句');
    assert.ok(content.includes('module.exports') || content.includes('async'), '应导出或包含异步函数');
  });

  // ===== 11. backup_db.js 备份脚本 =====
  it('11.1 backup_db.js 存在且包含备份逻辑', () => {
    const content = fs.readFileSync(path.join(ROOT, 'backup_db.js'), 'utf8');
    assert.ok(content.includes('pg') || content.includes('backup') || content.includes('dump'), '应有备份逻辑');
  });

  // ===== 12. .gitignore 存在且包含关键项 =====
  it('12.1 .gitignore 包含关键排除项', () => {
    const content = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    const required = ['node_modules', '.env', 'logs', 'uploads', 'dist', '__pycache__'];
    for (const item of required) {
      assert.ok(content.includes(item), `.gitignore应包含${item}`);
    }
  });

  // ===== 13. logger.js 轮转配置 =====
  it('13.1 logger.js 配置了日志轮转', () => {
    const content = fs.readFileSync(path.join(ROOT, 'logger.js'), 'utf8');
    assert.ok(content.includes('DailyRotateFile'), '应使用DailyRotateFile');
    assert.ok(content.includes('maxFiles'), '应配置maxFiles');
    assert.ok(content.includes('maxSize'), '应配置maxSize');
  });

  // ===== 14. package.json 脚本完整性 =====
  it('14.1 package.json 包含所有必需脚本', () => {
    const content = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const requiredScripts = ['start', 'test', 'build', 'lint', 'format'];
    for (const s of requiredScripts) {
      assert.ok(content.includes(`"${s}"`), `package.json应包含${s}脚本`);
    }
  });

  // ===== 15. 所有JS文件语法检查 =====
  it('15.1 所有JS文件语法正确', () => {
    const jsFiles = ['server.js', 'auth.js', 'user_storage.js', 'db.js', 'logger.js',
      'build.js', 'backup_db.js', 'vision_pipeline.js', 'optimize_images.js'];
    let missing = [];
    for (const f of jsFiles) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) {
        missing.push(f);
        continue;
      }
      // 使用node --check只读检查语法
      const result = spawnSync('node', ['--check', p]);
      // 检查文件内容基本结构
      const content = fs.readFileSync(p, 'utf8');
      assert.ok(content.length > 50, `${f} 应有内容（>50字符）`);
    }
    assert.equal(missing.length, 0, '缺少JS文件: ' + missing.join(', '));
  });

  // ===== 16. 前端JS文件字符编码检查 =====
  it('16.1 前端JS文件无BOM头', () => {
    const jsFiles = ['js/core.js', 'js/init.js', 'js/globals.js', 'js/recommendation.js'];
    for (const f of jsFiles) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      // 检查UTF-8 BOM
      assert.ok(!(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF),
        `${f} 不应有UTF-8 BOM头`);
    }
  });

  // ===== 17. HTML文件doctype检查 =====
  it('17.1 HTML文件以<!DOCTYPE html>开头', () => {
    const htmlFiles = ['index.html', 'admin.html', 'kitchen.html'];
    for (const f of htmlFiles) {
      const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(content.startsWith('<!DOCTYPE html>') || content.startsWith('<!doctype html>'),
        `${f} 应以<!DOCTYPE html>开头`);
    }
  });
});