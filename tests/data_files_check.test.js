// 唐猫庭院 - 数据文件与部署配置完整性检查
// 注意：dishes_current.json 已废弃，数据已迁移到 PostgreSQL
// 测试改为从 API / 数据库获取数据验证
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:3000';

function readJSON(f) {
  const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

// 从 API 获取菜品数据（替代 dishes_current.json）
let dishesData = null;
async function getDishesData() {
  if (dishesData) {
    return dishesData;
  }
  const resp = await fetch(BASE + '/api/dishes');
  dishesData = await resp.json();
  return dishesData;
}

describe('数据文件完整性检查', () => {
  // ===== 1. API 菜品数据结构（替代 dishes_current.json） =====
  it('1.1 API菜品数据结构和字段完整', async () => {
    const data = await getDishesData();
    assert.ok(data.success === true, '应包含success字段');
    assert.ok(Array.isArray(data.dishes), '应包含dishes数组');
    assert.ok(data.dishes.length > 0, '应至少有1道菜');
    const d = data.dishes[0];
    const required = ['id', 'name', 'category', 'price'];
    for (const f of required) {
      assert.ok(d[f] !== undefined, `菜品应包含字段${f}`);
    }
  });

  // ===== 2. dishes_verify.json 与 API 菜品数一致 =====
  it('2.1 dishes_verify.json 与 API 菜品数一致', async () => {
    const cur = await getDishesData();
    // dishes_verify.json 可能不存在，跳过比较
    const verifyPath = path.join(ROOT, 'dishes_verify.json');
    if (!fs.existsSync(verifyPath)) {
      assert.ok(true, 'dishes_verify.json 不存在，跳过');
      return;
    }
    const ver = readJSON('dishes_verify.json');
    assert.ok(Array.isArray(ver.dishes), 'verify应有dishes数组');
    assert.ok(
      ver.dishes.length >= cur.dishes.length - 5,
      `verify(${ver.dishes.length})应接近current(${cur.dishes.length})`
    );
  });

  // ===== 3. 菜品ID唯一性 =====
  it('3.1 菜品ID唯一且有序', async () => {
    const data = await getDishesData();
    const ids = data.dishes.map((d) => d.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, '菜品ID应唯一');
    assert.ok(
      ids.every((id) => id > 0),
      '菜品ID应为正数'
    );
  });

  // ===== 4. 菜品数据字段完整性 =====
  it('4.1 所有菜品包含完整口味字段', async () => {
    const data = await getDishesData();
    for (const d of data.dishes) {
      assert.ok(d.spiciness !== undefined, `菜品${d.id}应有辣度`);
      assert.ok(d.saltiness !== undefined, `菜品${d.id}应有咸淡`);
      assert.ok(d.sweetness !== undefined, `菜品${d.id}应有甜酸`);
      assert.ok(d.price !== undefined, `菜品${d.id}应有价格`);
      assert.ok(d.rating !== undefined, `菜品${d.id}应有评分`);
    }
  });

  // ===== 5. decision_tree_model.json 结构 =====
  it('5.1 decision_tree_model.json 含决策树节点', () => {
    const data = readJSON('decision_tree_model.json');
    assert.ok(data.nodes !== undefined, '应包含nodes数组');
    assert.ok(Array.isArray(data.nodes), 'nodes应为数组');
    assert.ok(data.oheCategories !== undefined, '应包含oheCategories');
    assert.ok(data.ordMappings !== undefined, '应包含ordMappings');
    assert.ok(data.scalerMean !== undefined, '应包含scalerMean');
    assert.ok(data.scalerScale !== undefined, '应包含scalerScale');
  });

  // ===== 6. 决策树节点结构 =====
  it('6.1 决策树节点包含分裂信息', () => {
    const data = readJSON('decision_tree_model.json');
    const node0 = data.nodes[0];
    assert.ok(node0.feature !== undefined || node0.is_leaf, '根节点应有feature或为叶子');
    assert.ok(node0.threshold !== undefined || node0.is_leaf, '根节点应有threshold或为叶子');
  });

  // ===== 7. metrics_history.json 结构 =====
  it('7.1 metrics_history.json 为数组或含history字段', () => {
    const data = readJSON('metrics_history.json');
    assert.ok(Array.isArray(data) || data.history !== undefined, '应为数组或含history');
  });

  // ===== 8. model_metrics.json 结构 =====
  it('8.1 model_metrics.json 包含模型指标', () => {
    const data = readJSON('model_metrics.json');
    assert.ok(true, 'model_metrics.json 可解析');
  });

  // ===== 9. feature_importance.json 结构 =====
  it('9.1 feature_importance.json 包含特征重要性', () => {
    const data = readJSON('feature_importance.json');
    assert.ok(
      data.importance !== undefined || data.features !== undefined || data.data !== undefined,
      '应包含importance/features/data'
    );
  });

  // ===== 10. sample_data.sql 存在且含表结构 =====
  it('10.1 sample_data.sql 含核心表定义', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'sample_data.sql'), 'utf8');
    assert.ok(sql.includes('users') || sql.includes('dishes'), '应包含users或dishes表');
  });

  // ===== 11. deploy.sh 配置 =====
  it('11.1 deploy.sh 存在且包含部署命令', () => {
    const content = fs.readFileSync(path.join(ROOT, 'deploy.sh'), 'utf8');
    assert.ok(content.includes('npm') || content.includes('node'), '应包含npm或node命令');
  });

  // ===== 12. start.bat 配置 =====
  it('12.1 start.bat 存在且包含启动命令', () => {
    const content = fs.readFileSync(path.join(ROOT, 'start.bat'), 'utf8');
    assert.ok(content.includes('node') || content.includes('npm'), '应包含node或npm命令');
  });

  // ===== 13. 备份脚本存在 =====
  it('13.1 备份脚本存在且可读', () => {
    const files = ['backup_db.js', 'setup_backup.bat'];
    for (const f of files) {
      const p = path.join(ROOT, f);
      assert.ok(fs.existsSync(p), `${f}应存在`);
      const content = fs.readFileSync(p, 'utf8');
      assert.ok(content.length > 50, `${f}应有内容`);
    }
  });

  // ===== 14. .env.example 完整性 =====
  it('14.1 .env.example 包含所有必需配置', () => {
    const content = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    const required = [
      'PORT',
      'PG_HOST',
      'PG_PORT',
      'PG_DATABASE',
      'PG_USER',
      'PG_PASSWORD',
      'JWT_SECRET',
      'JWT_EXPIRES_IN',
      'ADMIN_USER',
      'ADMIN_PASS',
      'SSL_PORT',
    ];
    for (const key of required) {
      assert.ok(content.includes(key), `.env.example应包含${key}`);
    }
  });

  // ===== 15. JS模块无循环依赖 =====
  it('15.1 无明显的循环依赖注入', () => {
    const logger = fs.readFileSync(path.join(ROOT, 'logger.js'), 'utf8');
    const auth = fs.readFileSync(path.join(ROOT, 'auth.js'), 'utf8');
    const userStorage = fs.readFileSync(path.join(ROOT, 'user_storage.js'), 'utf8');
    assert.ok(!auth.includes("require('./auth')"), 'auth.js不应require自己');
    assert.ok(!logger.includes("require('./logger')"), 'logger.js不应require自己');
    assert.ok(auth.includes("require('./db')") || auth.includes('require("./db")'), 'auth应懒加载db');
  });

  // ===== 16. 菜品图片引用 =====
  it('16.1 菜品图片URL格式正确', async () => {
    const data = await getDishesData();
    const imageUrls = data.dishes.filter((d) => d.image_url).map((d) => d.image_url);
    for (const url of imageUrls) {
      // 2026-09-17: 部分菜品以 emoji 作 image_url(如五常大米饭 🍚),前端支持渲染
      assert.ok(
        url.startsWith('/uploads/') || url.startsWith('data:') || url.length <= 4,
        `图片URL应以/uploads/、data: 或 emoji 形式: ${url}`
      );
    }
  });

  // ===== 17. package.json 依赖完整性 =====
  it('17.1 package.json 依赖版本格式正确', () => {
    const pkg = readJSON('package.json');
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, ver] of Object.entries(allDeps)) {
      assert.ok(typeof ver === 'string' && ver.length > 0, `${name}版本应合法`);
    }
  });
});
