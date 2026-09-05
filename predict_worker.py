# -*- coding: utf-8 -*-
"""
随机森林预测Worker进程 - 优化版
使用批量向量化操作提升性能
"""
import sys
import json
import pickle
import numpy as np

# 修复 Windows 终端中文乱码：显式设置 stderr 编码为 UTF-8
if sys.stderr.encoding is None or sys.stderr.encoding.upper() not in ('UTF-8', 'UTF8'):
    try:
        import io
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    except:
        pass

def json_print(obj):
    """输出JSON到stdout（UTF-8编码）"""
    sys.stdout.buffer.write((json.dumps(obj, ensure_ascii=False) + '\n').encode('utf-8'))
    sys.stdout.buffer.flush()

# 预编译正则表达式
import re
import pandas as pd
NUM_PATTERN = re.compile(r'[\d.]+')

# 模型缓存（只加载一次）
_model_cache = None
print("[信息] Worker进程启动，正在加载模型...", file=sys.stderr)
try:
    with open('recommendation_model.pkl', 'rb') as f:
        _model_cache = pickle.load(f)
    print("[信息] 模型加载完成", file=sys.stderr)
    json_print({"ready": True})
except Exception as e:
    print(f"[错误] 模型加载失败: {e}", file=sys.stderr)
    sys.exit(1)

def extract_number(value):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = NUM_PATTERN.search(value)
        if match:
            try:
                return float(match.group())
            except:
                return 0.0
    return 0.0

# 预定义映射表（与train_restaurant_model.py一致）
ORD_MAPPINGS = {
    '辣度': {'无': 0, '不辣': 1, '微辣': 2, '中辣': 3, '重辣': 4},
    '咸淡': {'无': 0, '清淡': 1, '适中': 2, '偏咸': 3},
    '甜酸': {'无': 0, '无味': 1, '偏甜': 2, '偏酸': 3, '甜酸': 4},
    '热量': {'无': 0, '低': 1, '中': 2, '高': 3},
    '价格区间': {'经济型（<12元）': 0, '标准型（12-20元）': 1, '品质型（20元以上）': 2,
                  '经济': 0, '适中': 1, '品质': 2, '无': 0, '不限': 0}
}

ORD_COLS = ['辣度', '咸淡', '甜酸', '营养_热量', '营养_蛋白', '营养_蔬菜', '价格区间']
ALLERGY_COLS = ['过敏源_海鲜', '过敏源_花生', '过敏源_鸡蛋', '过敏源_麸质', '过敏源_大豆']

def encode_features_batch(user_prefs, dishes, model_data):
    """批量编码特征，支持新旧两种模型格式"""
    ohe = model_data.get('ohe')
    scaler = model_data.get('scaler')
    n_samples = len(dishes)

    # ★ 检测模型格式：新模型（10维，无OHE/scaler）or 旧模型（25维）
    if ohe is None:
        # 新模型格式：10维特征
        # [辣度, 咸淡, 甜酸, 热量, 价格/100, 是否招牌, 评分/5, 用户辣度, 用户咸淡, 用户甜酸]
        X = np.zeros((n_samples, 10))
        for i, d in enumerate(dishes):
            X[i, 0] = ORD_MAPPINGS['辣度'].get(d.get('spiciness', '无'), 1)
            X[i, 1] = ORD_MAPPINGS['咸淡'].get(d.get('saltiness', '无'), 1)
            X[i, 2] = ORD_MAPPINGS['甜酸'].get(d.get('sweetness', '无'), 1)
            X[i, 3] = ORD_MAPPINGS['热量'].get(d.get('calorie', '中'), 2)
            price = extract_number(d.get('price', '0'))
            X[i, 4] = price / 100
            # 检测是否招牌菜
            tags = d.get('tags', [])
            if isinstance(tags, list):
                X[i, 5] = 1.0 if '招牌' in tags else 0.0
            elif isinstance(tags, str):
                X[i, 5] = 1.0 if '招牌' in tags else 0.0
            else:
                X[i, 5] = 0.0
            rating = extract_number(d.get('rating', '0'))
            X[i, 6] = rating / 5
            X[i, 7] = ORD_MAPPINGS['辣度'].get(user_prefs.get('辣度', '无'), 1)
            X[i, 8] = ORD_MAPPINGS['咸淡'].get(user_prefs.get('咸淡', '无'), 1)
            X[i, 9] = ORD_MAPPINGS['甜酸'].get(user_prefs.get('甜酸', '无'), 1)
        return X

    # 旧模型格式：25维特征（含OHE/scaler/交互特征等）
    # ... (原有代码保留)
    
    # 1. One-Hot编码（饮食_宗教）- 每个菜品有自己的宗教属性
    religion_values = [d.get('religion', '无特殊要求') for d in dishes]
    try:
        religion_ohe = ohe.transform(np.array(religion_values).reshape(-1, 1))
        n_religion = religion_ohe.shape[1]
        religion_features = religion_ohe
    except:
        # 如果菜品没有宗教属性，使用用户偏好
        religion = user_prefs.get('饮食_宗教', '无特殊要求')
        religion_ohe = np.zeros(len(ohe.categories_[0]))
        if religion in ohe.categories_[0]:
            try:
                idx = ohe.categories_[0].tolist().index(religion)
                religion_ohe[idx] = 1
            except:
                pass
        religion_features = np.tile(religion_ohe[1:] if len(religion_ohe) > 1 else [], (n_samples, 1))
        n_religion = religion_features.shape[1]
    
    # 2. 标签编码（菜品口味和偏好特征）
    # 支持两种字段名格式：中文（辣度）和英文（spiciness）
    FIELD_NAME_MAP = {
        '辣度': 'spiciness', '咸淡': 'saltiness', '甜酸': 'sweetness',
        '营养_热量': 'calorie_level', '营养_蛋白': 'protein_level', '营养_蔬菜': 'vegetable',
        '价格区间': 'price_range'
    }
    ord_features = np.zeros((n_samples, len(ORD_COLS)))
    for i, col in enumerate(ORD_COLS):
        mapping = ORD_MAPPINGS[col]
        values = []
        for d in dishes:
            # 先尝试中文字段名，再尝试英文
            val = d.get(col)
            if val is None:
                eng_key = FIELD_NAME_MAP.get(col)
                if eng_key:
                    val = d.get(eng_key)
            if val is None:
                val = '无'
            values.append(mapping.get(val, 0))
        ord_features[:, i] = values
    
    # 3. 数值特征（标准化）
    calorie = np.array([extract_number(d.get('calorie', '0')) for d in dishes])
    protein = np.array([extract_number(d.get('protein', '0')) for d in dishes])
    # 如果 protein 数据缺失（为0），用 calorie 的 1/10 估算（基于常见菜品营养比例）
    protein = np.where(protein == 0, np.maximum(calorie * 0.1, 1), protein)
    price = np.array([extract_number(d.get('price', '0')) for d in dishes])
    
    num_features = np.column_stack([calorie, protein, price])
    # 使用 DataFrame 以消除 sklearn 警告
    num_df = pd.DataFrame(num_features, columns=['热量_kcal', '蛋白质_g', '价格_元'])
    num_scaled = scaler.transform(num_df)
    
    # 4. 交互特征（向量化）
    calorie_val = np.maximum(calorie, 1)
    protein_val = np.maximum(protein, 1)
    price_val = np.maximum(price, 1)
    
    interaction_features = np.column_stack([
        protein_val / (calorie_val + 1),
        price_val / (calorie_val + 1),
        protein_val / (price_val + 1)
    ])
    
    # 5. 过敏源特征 — 支持两种格式：
    #   前端格式: {"allergies": {"seafood": false, "peanut": true, "egg": false, "gluten": false, "soy": false}}
    #   旧格式:   {"过敏源_海鲜": 0, "过敏源_花生": 1, ...}
    ALLERGY_KEY_MAP = {
        '过敏源_海鲜': 'seafood',
        '过敏源_花生': 'peanut',
        '过敏源_鸡蛋': 'egg',
        '过敏源_麸质': 'gluten',
        '过敏源_大豆': 'soy'
    }
    allergy_features = np.zeros((n_samples, len(ALLERGY_COLS)))
    for i, col in enumerate(ALLERGY_COLS):
        allergy_key = ALLERGY_KEY_MAP.get(col)
        if allergy_key is not None:
            # 尝试嵌套格式: dish["allergies"][allergy_key]
            allergy_features[:, i] = [
                1 if isinstance(d.get('allergies'), dict) and d['allergies'].get(allergy_key) else
                1 if d.get(col, False) else 0
                for d in dishes
            ]
        else:
            allergy_features[:, i] = [1 if d.get(col, False) else 0 for d in dishes]
    
    # 组合所有特征
    if n_religion > 0:
        religion_repeated = np.tile(religion_features, (n_samples, 1))
        X = np.hstack([religion_repeated, ord_features, num_scaled, interaction_features, allergy_features])
    else:
        X = np.hstack([ord_features, num_scaled, interaction_features, allergy_features])

    # ★ 添加用户偏好特征（实现个性化ML推荐）
    # 用户偏好特征：辣度、咸淡、甜酸、价格区间
    user_pref_features = np.zeros((n_samples, 4))
    user_pref_features[:, 0] = ORD_MAPPINGS['辣度'].get(user_prefs.get('辣度', '无'), 0)
    user_pref_features[:, 1] = ORD_MAPPINGS['咸淡'].get(user_prefs.get('咸淡', '无'), 0)
    user_pref_features[:, 2] = ORD_MAPPINGS['甜酸'].get(user_prefs.get('甜酸', '无'), 0)
    user_pref_features[:, 3] = ORD_MAPPINGS['价格区间'].get(user_prefs.get('价格区间', '无'), 0)
    X = np.hstack([X, user_pref_features])

    return X

def predict_dish_score_batch_optimized(user_prefs, dishes, model_data):
    """优化的批量预测函数"""
    model = model_data['model']
    
    # 批量编码特征
    X = encode_features_batch(user_prefs, dishes, model_data)
    
    # 批量预测
    scores = model.predict(X)

    # 将预测的匹配度(0~1)映射到0~5分范围
    scores = scores * 5
    
    # 处理结果
    results = []
    for i, dish in enumerate(dishes):
        score = max(0, min(5, scores[i]))
        results.append({
            'id': dish.get('id'),
            'name': dish.get('name'),
            'score': round(float(score), 2)
        })
    
    # 排序
    results.sort(key=lambda x: x['score'], reverse=True)
    return results

# 主循环：处理请求
while True:
    try:
        line = sys.stdin.buffer.readline()
        if not line:
            break
        line = line.decode('utf-8').strip()
        
        input_data = json.loads(line.strip())
        user_prefs = input_data['userPrefs']
        dishes = input_data['dishes']
        
        # 使用优化的批量预测
        results = predict_dish_score_batch_optimized(user_prefs, dishes, _model_cache)

        json_print({'success': True, 'predictions': results})
        
    except json.JSONDecodeError:
        print("[错误] JSON解析失败", file=sys.stderr)
    except Exception as e:
        print(f"[错误] 处理请求失败: {e}", file=sys.stderr)