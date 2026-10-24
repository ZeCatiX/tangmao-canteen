// 唐猫庭院 - 可维护性改造4第五域(推荐ML/worker)接线回归测试
// 背景: server.js 内联 ML 域切至 server/routes/recommend.js + server/ml-worker.js 时,
//       曾出现四类缺陷,本文件逐一回归:
//       1) server.js 丢 runtimeSettings 声明 → 30分钟后 checkAndRetrain 未捕获拒绝崩进程
//       2) admin.js 的 saveRuntimeSettings 未注入 → settings POST 必 500
//       3) ml-worker.js 缺 require('fs') + 普通对象误用 .get() → HistGB 兜底路径失效
//       4) ml-worker.js ROOT 层级错('..'/ '../..') → worker spawn 即退(退出码2)
require('dotenv').config();
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const BASE = 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

describe('域拆分内容断言(防回退/防复发)', () => {
  it('server.js 顶层声明共享 runtimeSettings(拆分时曾丢声明致定时器崩溃)', () => {
    const content = read('server.js');
    assert.ok(content.includes('const runtimeSettings = { autoRetrain: false }'), 'server.js 应声明 runtimeSettings');
    assert.ok(
      content.includes('runtimeSettings, saveRuntimeSettings'),
      'admin 挂载应注入 runtimeSettings/saveRuntimeSettings'
    );
  });

  it('admin.js 从 deps 解构 runtimeSettings/saveRuntimeSettings(曾漏注入致 settings POST 500)', () => {
    const content = read('server/routes/admin.js');
    assert.ok(/const \{[^}]*runtimeSettings[^}]*\} = deps/.test(content), 'admin.js 应从 deps 解构 runtimeSettings');
    assert.ok(
      /const \{[^}]*saveRuntimeSettings[^}]*\} = deps/.test(content),
      'admin.js 应从 deps 解构 saveRuntimeSettings'
    );
    assert.ok(
      !content.includes('const runtimeSettings = { autoRetrain: false }'),
      'admin.js 不应有寄主本地的 runtimeSettings 声明(双份状态)'
    );
  });

  it('ml-worker.js 有 fs require 且 ORD_MAPPINGS_CACHE 为 Map(HistGB 兜底曾连环 TypeError)', () => {
    const content = read('server/ml-worker.js');
    assert.ok(content.includes("require('fs')"), '兜底模型加载需要 fs');
    assert.ok(content.includes("'辣度': new Map(["), '口味序数映射应为 Map(.get 调用点依赖)');
    assert.ok(
      content.includes("const ROOT = path.join(__dirname, '..');"),
      'server/ 一层深,ROOT 只回退一级(../.. 曾指到仓库外,worker 即退)'
    );
    assert.ok(!content.includes("path.join(__dirname, '..', '..')"), '不得出现两级回退(routes 子目录才需要)');
  });

  it('worker-health 唯一归 ml-worker 挂载,recommend 不再重复注册', () => {
    assert.ok(read('server/ml-worker.js').includes("app.get('/api/worker-health'"), 'ml-worker 应挂 worker-health');
    assert.ok(
      !read('server/routes/recommend.js').includes("app.get('/api/worker-health'"),
      'recommend 不应重复挂 worker-health(Express 首个注册生效,重复即死代码)'
    );
  });

  it('server.js 只装配不内联:域代码已迁出且挂载齐全', () => {
    const content = read('server.js');
    assert.ok(!content.includes('function startPythonWorker'), 'worker 子系统应整体在 ml-worker.js');
    assert.ok(!content.includes('function dispatchToWorker'), '分发逻辑应整体在 ml-worker.js');
    assert.ok(content.includes("require('./server/ml-worker')"), '应挂载 ml-worker');
    assert.ok(content.includes("require('./server/routes/recommend')"), '应挂载 recommend');
    assert.ok(content.includes('mlworker.register(app'), '应调用 mlworker.register');
    assert.ok(content.includes('recommendDomain.register(app'), '应调用 recommendDomain.register');
    assert.ok(content.includes('mlworker.startPythonWorker()'), 'listen 启动应改道 mlworker');
    assert.ok(
      content.includes('mlworker.shutdown()'),
      '优雅停机应改道 mlworker.shutdown(拆分后 typeof 守卫曾致 worker 杀不掉)'
    );
    assert.ok(
      content.includes('recommendDomain.getFeatureImportanceCache()'),
      'admin 的特征重要性 getter 应接 recommend 模块'
    );
  });

  it('recommend.js 导出特征重要性 getter 供 admin 共享', () => {
    const content = read('server/routes/recommend.js');
    assert.ok(content.includes('getFeatureImportanceCache'), '应导出 getFeatureImportanceCache');
    assert.ok(/let featureImportanceCache = null;/.test(content), '缓存应提升到模块级');
  });

  it('preference_log.price 列宽迁移在册(标准型/品质型全称11字符曾超 VARCHAR(10) 必 500)', () => {
    const content = read('server.js');
    assert.ok(content.includes('ALTER TABLE preference_log ALTER COLUMN price TYPE VARCHAR(20)'), '应有幂等列宽迁移');
  });
});

describe('域拆分功能回归(HTTP)', () => {
  async function getAdminToken() {
    const res = await fetch(BASE + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    const body = await res.json();
    assert.equal(res.status, 200, '管理员登录应成功');
    return body.token;
  }

  it('settings POST 往返生效且落盘(回归 saveRuntimeSettings 未注入 500)', async () => {
    const token = await getAdminToken();
    const post = async (v) => {
      const res = await fetch(BASE + '/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ autoRetrain: v }),
      });
      assert.equal(res.status, 200, `settings POST(${v}) 不应 500`);
      const body = await res.json();
      assert.equal(body.settings.autoRetrain, v, '开关应即时生效');
    };
    await post(true);
    await post(false); // 还原默认(未上线,自动重训必须保持关闭)
  });

  it('POST /api/preference-log 接受最长价格档全称(回归 VARCHAR(10) 溢出 500)', async () => {
    const res = await fetch(BASE + '/api/preference-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spiciness: '微辣',
        saltiness: '适中',
        sweetness: '无',
        price: '品质型（20元以上）',
        calorie: '中',
        religion: '无特殊要求',
        allergies: [],
      }),
    });
    assert.equal(res.status, 200, `最长价格档(11字符)不应 500,实际 ${res.status}`);
  });

  it('POST /api/predict-rf 走 Python worker 主路径返回打分', async () => {
    const dishesRes = await fetch(BASE + '/api/dishes');
    const { dishes } = await dishesRes.json();
    assert.ok(dishes.length >= 3, '应有菜品数据');
    const res = await fetch(BASE + '/api/predict-rf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPrefs: { spiciness: '微辣', saltiness: '适中', sweetness: '无', price: '标准型（12-20元）', calorie: '中' },
        dishes: dishes.slice(0, 3).map((d) => d.id),
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.success && Array.isArray(body.predictions) && body.predictions.length === 3, '应返回 3 条打分');
  });
});
