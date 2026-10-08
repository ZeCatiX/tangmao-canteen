# 一次性: HistGB 模型树结构导出为 JSON (Node 端推理用)
# 背景: ML 管线迁移后, 把生产 HistGB 模型导出为 JSON, server.js(Node) 可在 Python worker 不可用时兜底打分
# 结构: 100 棵树 × ~60 节点, 预测 = baseline + sum(每棵树从节点0遍历)
import joblib, json, os

m = joblib.load('recommendation_model.pkl')
mdl = m['model']
baseline = float(mdl._baseline_prediction.ravel()[0])
trees = []
total_nodes = 0
for pred in mdl._predictors:
    # pred 可能是 TreePredictor 或 [TreePredictor]（旧版兼容包装）
    tp = pred[0] if isinstance(pred, list) else pred
    nodes = tp.nodes
    arr = []
    for n in nodes:
        arr.append({
            'v': round(float(n['value']), 8),
            'f': int(n['feature_idx']),
            't': round(float(n['num_threshold']), 8),
            'l': int(n['left']),
            'r': int(n['right']),
            'leaf': bool(n['is_leaf']),
        })
    trees.append(arr)
    total_nodes += len(arr)

out = {'n': len(trees), 'baseline': baseline, 'trees': trees}
with open('ml/histgb_model.json', 'w', encoding='utf-8') as f:
    json.dump(out, f)
print('导出完成: ml/histgb_model.json |', len(trees), '棵树 |', total_nodes, '节点 |', os.path.getsize('ml/histgb_model.json'), 'bytes')
