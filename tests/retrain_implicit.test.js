// 重训隐式样本（收藏/拉黑折算）回归（2026-11-05 接入的钉死测试）
// 背景: retrain_from_feedback.py 原来只吃显式评分; 接入 users 表收藏(折5分)/拉黑(折1分)后,
// 本测试造数验证三条纪律: ①显式评分优先去重 ②拉黑优先于收藏 ③档案无偏好用户跳过。
// python 侧由 node 注入 PG_PASSWORD（dotenvx shim 只钩 node 进程——retrain 的已知坑）。
// 需要本地 python+psycopg2; 找不到 python 时整组 skip（与 _chrome_path 模式同理）。
require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');
const { spawnSync } = require('node:child_process');

const FAV_DISH = 2082;   // 回坊酸辣汤(陕西小吃, 非饮品主食)
const BLK_DISH = 2072;    // 唐僧望塔酥(招牌)
const USER = 'retest_impl_1105';
const USER_NOPREF = 'retest_impl_1105b';
const PREFS = { spiciness: '微辣', saltiness: '适中', sweetness: '偏甜', price: '无', calorie: '无' };

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: +(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE || 'tangmao',
});

function runPython(code) {
  const env = Object.assign({}, process.env, { PG_PASSWORD: process.env.PG_PASSWORD || '' });
  for (const bin of ['python', 'python3']) {
    const r = spawnSync(bin, ['-c', code], { encoding: 'utf8', env, cwd: process.cwd() });
    if (r.error && r.error.code === 'ENOENT') continue;
    return r;
  }
  return null;
}

function loadImplicitPy(explicitJson) {
  const code = `
import sys, json
sys.path.insert(0, 'ml')
import retrain_from_feedback as m
samples, dup, nopref = m.load_implicit_from_db(${explicitJson})
out = []
for s in samples:
    X, y = m.encode_feedback(s)
    out.append({'dish_id': s[0], 'rating': s[1], 'user': s[11], 'X': [round(float(v), 3) for v in X], 'y': round(float(y), 3)})
print(json.dumps({'samples': out, 'skipped_dup': dup, 'skipped_nopref': nopref}))
`;
  return runPython(code);
}

describe('重训隐式样本(收藏/拉黑折算)', () => {
  before(async function () {
    const probe = runPython("import psycopg2; print('ok')");
    if (!probe || probe.status !== 0) {
      console.log('  skip: 本地无 python/psycopg2');
      this.skip();
      return;
    }
    // 造数: 有偏好用户(收藏2082+拉黑2072+对2082有显式评分→去重命中) + 无偏好用户(收藏→跳过)
    await pool.query('DELETE FROM feedback WHERE user_id = ANY($1)', [[USER, USER_NOPREF]]);
    await pool.query('DELETE FROM users WHERE username = ANY($1)', [[USER, USER_NOPREF]]);
    await pool.query(
      'INSERT INTO users (username, password, preferences, favorites, blacklist) VALUES ($1, $2, $3::jsonb, $4, $5)',
      [USER, 'x', JSON.stringify(PREFS), [FAV_DISH], [BLK_DISH]]
    );
    await pool.query(
      'INSERT INTO users (username, password, preferences, favorites, blacklist) VALUES ($1, $2, $3::jsonb, $4, $5)',
      [USER_NOPREF, 'x', '{}', [BLK_DISH], []]
    );
    await pool.query(
      'INSERT INTO feedback (dish_id, rating, user_preferences, user_id) VALUES ($1, $2, $3::jsonb, $4)',
      [FAV_DISH, 3.0, JSON.stringify(PREFS), USER]
    );
  });

  after(async function () {
    await pool.query('DELETE FROM feedback WHERE user_id = ANY($1)', [[USER, USER_NOPREF]]);
    await pool.query('DELETE FROM users WHERE username = ANY($1)', [[USER, USER_NOPREF]]);
    await pool.end();
  });

  it('显式评分优先: 收藏菜已有评分→只折拉黑, 不重复喂', async () => {
    // 注: load_implicit_from_db 是全库扫描(历史 fav_*/blk_* 测试账号会带进样本),
    // 断言按测试用户过滤——去重纪律只看本用户的样本集合。
    const r = loadImplicitPy(`{('${USER}', ${FAV_DISH})}`);
    assert.ok(r && r.status === 0, 'python 执行失败: ' + (r ? r.stderr : '无python'));
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.ok(j.skipped_dup >= 1, '收藏2082应因显式评分被去重(skipped_dup=' + j.skipped_dup + ')');
    const mine = j.samples.filter((s) => s.user === USER);
    assert.equal(mine.length, 1, '测试用户只剩拉黑2072折算的隐式样本');
    assert.equal(mine[0].dish_id, BLK_DISH);
    assert.equal(mine[0].rating, 1.0, '拉黑折算应为1分');
  });

  it('隐式样本编码: 拉黑1分 → y=0.2, 菜品/用户特征同 encode 纪律', async () => {
    const r = loadImplicitPy('set()');
    assert.ok(r && r.status === 0);
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    const blk = j.samples.find((s) => s.user === USER && s.dish_id === BLK_DISH);
    assert.ok(blk, '应有本用户的拉黑样本');
    assert.equal(blk.y, 0.2, 'y = 1/5 = 0.2');
    assert.equal(blk.X[7], 2, '用户辣度=微辣(序2)');
    assert.equal(blk.X[5], 1, '唐僧望塔酥带招牌tag → X[5]=1');
  });

  it('档案无偏好用户跳过(模型只学有口味上下文的行为)', async () => {
    const r = loadImplicitPy('set()');
    assert.ok(r && r.status === 0);
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.ok(j.skipped_nopref >= 1, '无偏好用户应被计数跳过');
  });
});
