// 唐猫庭院 - ML预测逻辑、PythonWorker、SSL证书深度E2E检查
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config();

const BASE = 'http://localhost:3000';
const ROOT = path.join(__dirname, '..');

describe('ML模型与PythonWorker深度检查', () => {

  // ===== 1. predict_worker.py 存在 =====
  it('1.1 predict_worker.py 存在且可执行', () => {
    const p = path.join(ROOT, 'ml', 'predict_worker.py');
    assert.ok(fs.existsSync(p), 'predict_worker.py应存在');
    const content = fs.readFileSync(p, 'utf8');
    assert.ok(content.length > 100, '应有实质内容');
    assert.ok(content.includes('sys.stdin') || content.includes('json.load'), '应从stdin读取');
  });

  // ===== 2. 训练脚本存在 =====
  it('2.1 ML训练脚本存在', () => {
    const scripts = ['train_restaurant_model.py', 'train_restaurant_model.py', 'retrain_from_feedback.py'];
    for (const s of scripts) {
      const p = path.join(ROOT, s);
      assert.ok(fs.existsSync(p), `${s}应存在`);
      const content = fs.readFileSync(p, 'utf8');
      assert.ok(content.length > 200, `${s}应有实质内容`);
    }
  });

  // ===== 3. ML模型文件大小合理 =====
  it('3.1 recommendation_model.pkl 大小合理', () => {
    const p = path.join(ROOT, 'recommendation_model.pkl');
    assert.ok(fs.existsSync(p), '模型文件应存在');
    const stat = fs.statSync(p);
    assert.ok(stat.size > 1000, '模型文件应>1KB');
    assert.ok(stat.size < 100 * 1024 * 1024, '模型文件应<100MB');
  });

  // ===== 4. Python脚本结构检查 =====
  it('4.1 Python脚本包含关键结构', () => {
    // rgzn.py 已归档至 deprecated/(commit 47095d2),根目录不再保留旧训练脚本
    const pyFiles = ['ml/predict_worker.py', 'ml/train_restaurant_model.py',
      'ml/retrain_from_feedback.py', 'ml/get_metrics.py', 'ml/get_feature_importance.py',
      'ml/save_importance.py', 'ml/convert_report.py', 'ml/create_optimized_report.py'];
    for (const f of pyFiles) {
      const p = path.join(ROOT, f);
      assert.ok(fs.existsSync(p), `${f}应存在`);
      const content = fs.readFileSync(p, 'utf8');
      assert.ok(content.length > 50, `${f}应有内容（>50字符）`);
    }
  });

  // ===== 5. Worker健康检查包含stats =====
  it('5.1 Worker健康检查包含统计信息', async () => {
    const r = await fetch(BASE + '/api/worker-health');
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.ok(body.alive !== undefined, '应包含alive');
    assert.ok(body.ready !== undefined, '应包含ready');
    assert.ok(body.pendingRequests !== undefined, '应包含pendingRequests');
    assert.ok(body.uptime !== undefined, '应包含uptime');
  });

  // ===== 6. 推荐模型预测可用 =====
  it('6.1 推荐API调用RF模型返回预测', async () => {
    const r = await fetch(BASE + '/api/predict-rf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPrefs: { '辣度': '微辣', '咸淡': '适中', '甜酸': '酸甜' },
        dishes: [
          { id: 1, name: 'A', spiciness: '微辣', saltiness: '适中', sweetness: '酸甜', rating: 4, price: 20, isHalal: false, isVegetarian: false, allergies: [], religion: '无特殊要求', calorie: '200', protein: '10' }
        ]
      }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.predictions), '应返回predictions数组');
    assert.ok(body.predictions.length > 0, '应有至少1个预测');
  });

  // ===== 7. SSL证书存在 =====
  it('7.1 SSL证书文件存在', () => {
    const cert = path.join(ROOT, 'ssl', 'cert.pem');
    const key = path.join(ROOT, 'ssl', 'key.pem');
    assert.ok(fs.existsSync(cert), 'cert.pem应存在');
    assert.ok(fs.existsSync(key), 'key.pem应存在');
    const certContent = fs.readFileSync(cert, 'utf8');
    const keyContent = fs.readFileSync(key, 'utf8');
    assert.ok(certContent.includes('CERTIFICATE'), 'cert.pem应包含证书');
    assert.ok(keyContent.includes('PRIVATE KEY'), 'key.pem应包含私钥');
  });

  // ===== 8. HTTPS服务器可访问 =====
  it('8.1 HTTPS服务器可访问（自签名证书）', async () => {
    const https = require('https');
    const result = await new Promise((resolve) => {
      const req = https.get('https://localhost:3443/api/worker-health', {
        rejectUnauthorized: false,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', (e) => resolve({ error: e.message }));
      req.setTimeout(5000, () => { req.destroy(); resolve({ error: 'timeout' }); });
    });
    assert.ok(!result.error, 'HTTPS请求不应出错');
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.ready, true);
  });

  // ===== 9. ML模型评估指标可获取 =====
  it('9.1 模型评估指标可获取', async () => {
    const r = await fetch(BASE + '/api/model-metrics');
    const body = await r.json();
    assert.equal(r.status, 200);
    const metrics = body.metrics || body.data;
    assert.ok(metrics, '应包含指标数据');
    if (metrics) {
      // 应包含MSE/RMSE/MAE/R²中的至少一个
      const hasMetric = metrics.mse !== undefined || metrics.rmse !== undefined ||
        metrics.mae !== undefined || metrics.r2 !== undefined || metrics.MSE !== undefined;
      assert.ok(hasMetric, '应包含至少一个评估指标');
    }
  });

  // ===== 10. 特征重要性字段完整 =====
  it('10.1 特征重要性字段完整', async () => {
    const r = await fetch(BASE + '/api/feature-importance');
    const body = await r.json();
    assert.equal(r.status, 200);
    const imp = body.importance || body.features || body.data;
    if (Array.isArray(imp) && imp.length > 0) {
      const item = imp[0];
      assert.ok(item.feature !== undefined || item.name !== undefined, '应包含特征名');
    }
  });
});