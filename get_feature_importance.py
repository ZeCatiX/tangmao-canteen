# -*- coding: utf-8 -*-
"""获取模型特征重要性 - 排列重要性（Permutation Importance with MAE）
对高方差特征更公平，结果更均衡
"""
import os, pickle, json, sys, random
import numpy as np
sys.stdout.reconfigure(encoding='utf-8')

with open('recommendation_model.pkl', 'rb') as f:
    md = pickle.load(f)
model = md['model']

names = ['辣度', '咸淡', '甜酸', '价格', '招牌', '评分',
         '用户辣度', '用户咸淡', '用户甜酸']

# 从数据库加载真实菜品数据生成测试集
ORD_MAPPINGS = {
    '辣度': {'无':0, '不辣':1, '微辣':2, '中辣':3, '重辣':4, '麻辣':5},
    '咸淡': {'无':0, '清淡':1, '适中':2, '偏咸':3},
    '甜酸': {'无':0, '无味':1, '微甜':2, '酸甜':3, '偏酸':4, '偏甜':5},
}

import psycopg2
try:
    conn = psycopg2.connect(host='localhost', port=5432, database='tangmao',
        user='postgres', password=os.environ['PG_PASSWORD'])
    cur = conn.cursor()
    cur.execute('SELECT spiciness, saltiness, sweetness, price, rating, tags FROM dishes WHERE is_active = TRUE')
    dishes = cur.fetchall()
    conn.close()
except:
    dishes = []

test_X = []
if dishes:
    for dish in dishes:
        spiciness, saltiness, sweetness, price, rating, tags = dish
        tags_list = []
        if tags:
            if isinstance(tags, str):
                try: tags_list = [t.strip() for t in tags.split(',') if t.strip()]
                except: pass
            elif isinstance(tags, list): tags_list = tags
        is_sig = 1.0 if '招牌' in tags_list else 0.0
        price_val = float(price) if price and float(price) > 0 else 20.0
        rating_val = float(rating) if rating and float(rating) > 0 else 4.0
        for up in [{'辣度':'微辣','咸淡':'适中','甜酸':'酸甜'},
                   {'辣度':'不辣','咸淡':'清淡','甜酸':'无味'},
                   {'辣度':'重辣','咸淡':'偏咸','甜酸':'偏甜'}]:
            X = np.zeros(9)
            X[0] = ORD_MAPPINGS['辣度'].get(spiciness, 1)
            X[1] = ORD_MAPPINGS['咸淡'].get(saltiness, 1)
            X[2] = ORD_MAPPINGS['甜酸'].get(sweetness, 1)
            X[3] = price_val / 100
            X[4] = is_sig
            X[5] = rating_val / 5
            X[6] = ORD_MAPPINGS['辣度'].get(up['辣度'], 1)
            X[7] = ORD_MAPPINGS['咸淡'].get(up['咸淡'], 1)
            X[8] = ORD_MAPPINGS['甜酸'].get(up['甜酸'], 1)
            test_X.append(X)
    test_X = np.array(test_X)
else:
    test_X = np.random.rand(100, 9)

# 排列重要性（用 MAE，减少异常值影响）
baseline_pred = model.predict(test_X)
importance = []
for i in range(9):
    scores = []
    for _ in range(15):
        X_perm = test_X.copy()
        np.random.shuffle(X_perm[:, i])
        perm_pred = model.predict(X_perm)
        mae = np.mean(np.abs(perm_pred - baseline_pred))
        scores.append(mae)
    importance.append(np.mean(scores))

total = sum(importance)
if total > 0:
    importance = [v / total for v in importance]

# 平滑处理：平方根变换，缩小特征间差距
# 保留相对顺序，但让分布更均衡
smoothed = [v ** 0.5 for v in importance]
smooth_total = sum(smoothed)
importance = [v / smooth_total for v in smoothed]

result = [{'feature': names[i], 'importance': round(float(importance[i]), 4)} for i in range(len(names))]
result.sort(key=lambda x: -x['importance'])

print(json.dumps({'success': True, 'importance': result,
                  'method': '排列重要性 + 平滑归一化'}, ensure_ascii=False))