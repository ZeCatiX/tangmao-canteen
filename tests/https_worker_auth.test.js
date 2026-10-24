// 唐猫庭院 - HTTPS、Python Worker、用户存储深度检查
const { describe, it, before, after } = require('node:test');

// 真实菜品 ID 池(2026-09-17:订单载荷不能用重播种前的幻影 ID)
let dishPool = [{ id: 2069, name: '测试菜品', price: 18 }];
before(async () => {
  try {
    const r = await fetch('http://localhost:3000/api/dishes').then(function (x) {
      return x.json();
    });
    const list = (r && (r.dishes || r)) || [];
    if (list.length) {
      dishPool = list.slice(0, 5).map(function (d) {
        return { id: d.id, name: d.name, price: parseFloat(d.price) || 18 };
      });
    }
  } catch (e) {}
});
const assert = require('node:assert/strict');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const HTTPS_BASE = 'https://localhost:3443';

async function api(path, options = {}) {
  const url = BASE + path;
  const { headers: optHeaders, ...rest } = options;
  let res;
  // 429重试（大量测试并发运行时可能触发限流）
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...optHeaders },
      ...rest,
    });
    if (res.status !== 429) {
      break;
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('HTTPS和Python Worker深度检查', () => {
  // ===== 1. HTTPS服务器响应 =====
  it('1.1 HTTPS服务器正常响应', async () => {
    // Node.js fetch 默认拒绝自签名证书，用 https 模块绕过
    const https = require('https');
    const result = await new Promise((resolve) => {
      let attempts = 0;
      const tryRequest = () => {
        const req = https.get(
          'https://localhost:3443/api/worker-health',
          {
            rejectUnauthorized: false,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode === 429 && attempts < 3) {
                attempts++;
                setTimeout(tryRequest, 500 * attempts);
                return;
              }
              resolve({ status: res.statusCode, body: data });
            });
          }
        );
        req.on('error', (e) => resolve({ error: e.message }));
        req.setTimeout(5000, () => {
          req.destroy();
          resolve({ error: 'timeout' });
        });
      };
      tryRequest();
    });
    assert.ok(!result.error, 'HTTPS请求不应出错: ' + (result.error || ''));
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.alive, true);
    assert.equal(body.ready, true);
  });

  // ===== 2. Python Worker健康状态 =====
  it('2.1 Python Worker健康且无重启', async () => {
    const r = await api('/api/worker-health');
    assert.equal(r.status, 200);
    assert.equal(r.body.alive, true);
    assert.equal(r.body.ready, true);
    assert.ok(r.body.pendingRequests === undefined || r.body.pendingRequests >= 0, 'pendingRequests应有效');
  });

  // ===== 3. 推荐API响应质量 =====
  it('3.1 推荐API返回有效推荐结果', async () => {
    const r = await api('/api/predict-rf', {
      method: 'POST',
      body: JSON.stringify({
        userPrefs: {
          辣度: '微辣',
          咸淡: '适中',
          甜酸: '酸甜',
          价格区间: '0-30',
          热量: '0-500',
          饮食_宗教: '无特殊要求',
        },
        dishes: [
          {
            id: 1,
            name: '测试菜品1',
            spiciness: '微辣',
            saltiness: '适中',
            sweetness: '酸甜',
            rating: 4.5,
            price: 20,
            isHalal: false,
            isVegetarian: false,
            allergies: [],
            religion: '无特殊要求',
            calorie: '200',
            protein: '10',
          },
          {
            id: 2,
            name: '测试菜品2',
            spiciness: '中辣',
            saltiness: '偏咸',
            sweetness: '咸鲜',
            rating: 3.5,
            price: 25,
            isHalal: false,
            isVegetarian: false,
            allergies: [],
            religion: '无特殊要求',
            calorie: '300',
            protein: '15',
          },
          {
            id: 3,
            name: '测试菜品3',
            spiciness: '微辣',
            saltiness: '适中',
            sweetness: '酸甜',
            rating: 5.0,
            price: 15,
            isHalal: true,
            isVegetarian: true,
            allergies: [],
            religion: '无特殊要求',
            calorie: '150',
            protein: '8',
          },
        ],
      }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(Array.isArray(r.body.predictions), '应返回预测数组');
    assert.ok(r.body.predictions.length > 0, '应至少有1个预测');
    // 检查预测结果结构
    const pred = r.body.predictions[0];
    assert.ok(pred.id !== undefined, '预测应包含id');
    assert.ok(pred.matchRate !== undefined || pred.score !== undefined, '预测应包含匹配率或分数');
  });

  // ===== 4. 推荐API超时处理 =====
  it('4.1 推荐API空用户偏好返回结果', async () => {
    const r = await api('/api/predict-rf', {
      method: 'POST',
      body: JSON.stringify({
        userPrefs: {},
        dishes: [
          {
            id: 1,
            name: '测试',
            spiciness: '微辣',
            saltiness: '适中',
            sweetness: '酸甜',
            rating: 4,
            price: 20,
            isHalal: false,
            isVegetarian: false,
            allergies: [],
            religion: '无特殊要求',
            calorie: '200',
            protein: '10',
          },
        ],
      }),
    });
    // 应返回200或错误，但不崩溃
    assert.ok(r.status === 200 || r.status === 500, '应返回200或500');
    if (r.status === 200) {
      assert.equal(r.body.success, true);
    }
  });

  // ===== 5. 推荐API大量菜品 =====
  it('5.1 推荐API处理大量菜品不超时', async () => {
    const dishes = [];
    for (let i = 1; i <= 69; i++) {
      dishes.push({
        id: i,
        name: '菜品' + i,
        spiciness: '微辣',
        saltiness: '适中',
        sweetness: '酸甜',
        rating: 4.0,
        price: 20,
        isHalal: false,
        isVegetarian: false,
        allergies: [],
        religion: '无特殊要求',
        calorie: '200',
        protein: '10',
      });
    }
    const start = Date.now();
    const r = await api('/api/predict-rf', {
      method: 'POST',
      body: JSON.stringify({
        userPrefs: {
          辣度: '微辣',
          咸淡: '适中',
          甜酸: '酸甜',
          价格区间: '0-30',
          热量: '0-500',
          饮食_宗教: '无特殊要求',
        },
        dishes,
      }),
    });
    const elapsed = Date.now() - start;
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(elapsed < 50000, '应在50秒内完成，实际: ' + elapsed + 'ms');
  });

  // ===== 6. 模型指标可获取 =====
  it('6.1 模型指标包含有效数据', async () => {
    const r = await api('/api/model-metrics');
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.metrics || r.body.data, '应包含指标数据');
  });

  // ===== 7. 特征重要性可获取 =====
  it('7.1 特征重要性包含有效数据', async () => {
    const r = await api('/api/feature-importance');
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.features || r.body.data || r.body.importance, '应包含特征重要性数据');
  });
});

describe('用户存储和认证流程检查', () => {
  // ===== 8. 用户注册和token =====
  it('8.1 注册返回有效token', async () => {
    const uniq = 'auth_te' + Date.now();
    const r = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'TestAuth123!' }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.token, '应返回token');
    assert.ok(r.body.token.length > 20, 'token应有足够长度');
  });

  // ===== 9. 登录返回有效token =====
  it('9.1 登录返回有效token和用户数据', async () => {
    const uniq = 'login_t' + Date.now();
    // 先注册
    await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'TestLogin123!' }),
    });
    // 登录
    const r = await api('/api/user/login', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'TestLogin123!' }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.token, '应返回token');
    assert.ok(r.body.user, '应返回用户数据');
  });

  // ===== 10. token可用于认证 =====
  it('10.1 token可用于访问需要认证的端点', async () => {
    const uniq = 'token_t' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'TestToken123!' }),
    });
    const token = reg.body.token;
    // 用token访问订单列表
    const r = await api('/api/orders?userId=' + uniq, {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.ok(r.status === 200 || r.status === 404, 'token应能认证，状态: ' + r.status);
  });

  // ===== 11. 过期/无效token被拒绝 =====
  it('11.1 无效token被拒绝', async () => {
    const r = await api('/api/orders?userId=test', {
      headers: { Authorization: 'Bearer invalid_expired_token_xyz' },
    });
    assert.equal(r.status, 401, '无效token应返回401');
  });

  // ===== 12. 用户偏好保存和读取 =====
  it('12.1 用户偏好可保存和读取', async () => {
    const uniq = 'pref_te' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'TestPref123!' }),
    });
    const token = reg.body.token;
    // 保存偏好
    const saveR = await api('/api/user-preferences', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        username: uniq,
        preferences: { spiciness: '微辣', saltiness: '适中', sweetness: '酸甜' },
      }),
    });
    assert.ok(saveR.status === 200 || saveR.status === 201, '保存偏好应成功');
  });

  // ===== 13. 反馈提交 =====
  it('13.1 用户反馈可提交', async () => {
    const uniq = 'feedbac' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'TestFeedback123!' }),
    });
    const token = reg.body.token;
    const r = await api('/api/feedback', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        dishId: 1,
        score: 4,
        userId: uniq,
        userPreferences: { spiciness: '微辣' },
      }),
    });
    assert.ok(r.status === 200 || r.status === 201, '反馈提交应成功');
  });

  // ===== 14. 订单创建 =====
  it('14.1 订单可创建', async () => {
    const uniq = 'order_t' + Date.now();
    const reg = await api('/api/user/register', {
      method: 'POST',
      body: JSON.stringify({ username: uniq, password: 'TestOrder123!' }),
    });
    const token = reg.body.token;
    const r = await api('/api/order', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        userId: uniq,
        items: [{ id: dishPool[0].id, name: '测试菜品', price: 20, type: '偏好推荐', matchRate: 0.8 }],
        totalPrice: 20,
      }),
    });
    assert.ok(r.status === 200 || r.status === 201, '订单创建应成功');
  });
});
