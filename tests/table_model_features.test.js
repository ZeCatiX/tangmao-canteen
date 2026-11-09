// 席面模型管线预铺回归(2026-11-09 飞轮第3步: 12→14 维)
// 钉死四件事:
//   ① train_restaurant_model.encode_dish 输出 14 维, 席面两列(partySize/budgetPerPerson)缺省 0=单菜中性
//   ② compute_score 预算规则三态: 超人均预算30%以上罚分、预算内不罚、budget=0(单菜)完全不受影响
//   ③ retrain_from_feedback.encode_feedback 与训练端同构(席面参数从 user_preferences JSON 读)
//   ④ predict_worker 双模兼容: 当前线上 12 维模型下, 带/不带席面参数的打分**完全一致**(行为零变化铁证)
// 需要 python+numpy+sklearn; 缺失时整组 skip(与 retrain_implicit 同模式)。不执行任何训练。
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function runPython(code) {
  const env = Object.assign({}, process.env);
  for (const bin of ['python', 'python3']) {
    const r = spawnSync(bin, ['-c', code], { encoding: 'utf8', env, cwd: ROOT, timeout: 120000 });
    if (r.error && r.error.code === 'ENOENT') continue;
    return r;
  }
  return null;
}

function probePython() {
  const r = runPython('import numpy, sklearn; print("ok")');
  return r && r.status === 0;
}

// 与 load_dishes_from_db 的 SELECT 列序一致的假菜(13 元组)
function fakeDish(price) {
  // 返回 python 字面量字符串(直接拼进 python -c 代码)——不走 JSON.stringify, JS 的 false/true 灌进 python 会 NameError
  return "[2061, '测试菜', '热菜', '微辣', '适中', '偏甜', " + price + ", 3.5, '招牌', False, False, True, '中']";
}
const PREF = { '辣度': '微辣', '咸淡': '适中', '甜酸': '偏甜', '价格': '无', 'calorie': '无' };

describe('席面模型管线预铺(14维)', () => {
  let ok = false;
  before(function () {
    ok = probePython();
    if (!ok) {
      console.log('  skip: 本地无 python/numpy/sklearn');
      this.skip();
    }
  });

  it('encode_dish 输出14维, 席面列缺省0/显式传入生效', () => {
    const r = runPython(`
import sys, json
sys.path.insert(0, 'ml')
import train_restaurant_model as t
dish = ${fakeDish(60)}
pref = ${JSON.stringify(PREF)}
X_plain, _, _, _, _, _ = t.encode_dish(dish, pref)
X_table, _, _, _, _, _ = t.encode_dish(dish, pref, {'partySize': 4, 'budgetPerPerson': 80})
print(json.dumps({'plain': [float(v) for v in X_plain], 'table': [float(v) for v in X_table],
                  'names': t.FEATURE_NAMES}))
`);
    assert.equal(r.status, 0, 'python 执行失败: ' + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.names.length, 14, 'FEATURE_NAMES 应为 14 项');
    assert.equal(out.plain.length, 14, '编码应为 14 维');
    assert.deepEqual(out.plain.slice(12), [0, 0], '不传席面上下文时席面两列应为中性 0');
    assert.equal(out.table[12], 4, 'partySize 应写入第13列');
    assert.equal(out.table[13], 80, 'budgetPerPerson 应写入第14列');
    assert.deepEqual(out.plain.slice(0, 12), out.table.slice(0, 12), '前12列应与席面上下文无关(兼容)');
  });

  it('compute_score 预算规则三态: 超预算罚/预算内不罚/budget=0 不变', () => {
    const r = runPython(`
import sys, json
sys.path.insert(0, 'ml')
import train_restaurant_model as t
dish = ${fakeDish(100)}   # 贵菜(100元)
pref = ${JSON.stringify(PREF)}
X0, _, is_sig, price_val, rating_val, cat = t.encode_dish(dish, pref, None)
s_none = t.compute_score(X0, is_sig, price_val, rating_val, cat)
X_in, _, is_sig2, pv2, rv2, cat2 = t.encode_dish(dish, pref, {'partySize': 4, 'budgetPerPerson': 100})  # 预算内(100 <= 130)
s_in = t.compute_score(X_in, is_sig2, pv2, rv2, cat2)
X_over, _, is_sig3, pv3, rv3, cat3 = t.encode_dish(dish, pref, {'partySize': 4, 'budgetPerPerson': 50})  # 超预算(100 > 65)
s_over = t.compute_score(X_over, is_sig3, pv3, rv3, cat3)
print(json.dumps({'s_none': s_none, 's_in': s_in, 's_over': s_over}))
`);
    assert.equal(r.status, 0, 'python 执行失败: ' + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(Math.abs(out.s_none - out.s_in) < 1e-9, '预算内不应罚分');
    assert.ok(out.s_over < out.s_none, '超预算30%以上应罚分');
    assert.ok(out.s_none >= 0.1 && out.s_none <= 1.0, '分数应保持在 0.1~1.0');
  });

  it('retrain encode_feedback 与训练端同构(席面参数从 user_preferences 读)', () => {
    const r = runPython(`
import sys, json
sys.path.insert(0, 'ml')
import retrain_from_feedback as m
fb = [2061, 4, ${JSON.stringify({ spiciness: '微辣', saltiness: '适中', sweetness: '偏甜', price: '无', calorie: '无', partySize: 6, budgetPerPerson: 80 })}, '2026-11-09', '微辣', '适中', '偏甜', 60, 3.5, '招牌', '中', 'tester']
X, y = m.encode_feedback(fb)
fb_plain = [2061, 4, ${JSON.stringify({ spiciness: '微辣', saltiness: '适中', sweetness: '偏甜', price: '无', calorie: '无' })}, '2026-11-09', '微辣', '适中', '偏甜', 60, 3.5, '招牌', '中', 'tester']
Xp, yp = m.encode_feedback(fb_plain)
print(json.dumps({'X': [float(v) for v in X], 'y': float(y), 'Xp': [float(v) for v in Xp], 'names': m.FEATURE_NAMES}))
`);
    assert.equal(r.status, 0, 'python 执行失败: ' + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.X.length, 14, 'retrain 编码应为 14 维');
    assert.equal(out.X[12], 6, 'partySize 应入第13列');
    assert.equal(out.X[13], 80, 'budgetPerPerson 应入第14列');
    assert.deepEqual(out.Xp.slice(12), [0, 0], '无席面参数时两列中性 0');
    assert.deepEqual(out.names, ['辣度', '咸淡', '甜酸', '热量', '价格', '招牌', '评分', '用户辣度', '用户咸淡', '用户甜酸', '用户价格', '用户热量', '席面人数', '人均预算']);
    assert.ok(out.y > 0 && out.y <= 1);
  });

  it('predict_worker 双模兼容: 12维模型下带/不带席面参数打分完全一致(行为零变化)', async () => {
    // 用真 worker 子进程(pickle 模型=当前线上 12 维)走 stdin 协议
    const dishes = [
      { id: 2071, name: '葫芦鸡', spiciness: '不辣', saltiness: '适中', sweetness: '无', price: '58元', rating: '3.5', tags: ['招牌'], calorie: '高' },
      { id: 2101, name: '醋泡花生米', spiciness: '不辣', saltiness: '偏酸', sweetness: '无', price: '12元', rating: '3.5', tags: [], calorie: '低' },
    ];
    const code = `
import subprocess, json, sys, os
p = subprocess.Popen([sys.executable, os.path.join('ml', 'predict_worker.py')],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
req_a = json.dumps({'userPrefs': {'辣度': '微辣'}, 'dishes': ${JSON.stringify(dishes)}})
req_b = json.dumps({'userPrefs': {'辣度': '微辣', 'partySize': 8, 'budgetPerPerson': 50}, 'dishes': ${JSON.stringify(dishes)}})
out, err = p.communicate((req_a + '\\n' + req_b + '\\n').encode('utf-8'), timeout=60)
lines = [l for l in out.decode('utf-8').splitlines() if l.strip().startswith('{') and 'success' in l]  # 跳过启动 ready 行
ra, rb = json.loads(lines[0]), json.loads(lines[1])
print(json.dumps({'a': ra, 'b': rb, 'err': (err or b'').decode('utf-8', 'replace')[-400:]}))
`;
    const r = runPython(code);
    assert.equal(r.status, 0, 'worker 子进程失败: ' + (r.stderr || '').slice(0, 300));
    const { a, b } = JSON.parse(r.stdout);
    assert.ok(a.success && b.success, '两次请求都应 success, worker stderr: ' + (a.err || b.err || ''));
    assert.deepEqual(
      a.predictions.map((x) => [x.id, x.score]),
      b.predictions.map((x) => [x.id, x.score]),
      '12 维模型下席面参数不应影响打分(前12列与席面无关, 双模分流生效)'
    );
  });
});
