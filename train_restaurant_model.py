# -*- coding: utf-8 -*-
"""
唐猫庭院 - 菜品推荐模型训练脚本 v2
基于10维特征（辣度、咸淡、甜酸、热量、价格、招牌、评分、用户辣度、用户咸淡、用户甜酸）
训练随机森林回归模型，从PostgreSQL加载数据，生成合成训练集
"""
import pickle, json, sys, os, random
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
sys.stdout.reconfigure(encoding='utf-8')

# ═══════════════════════════════════════════════
# 1. 特征编码映射（统一数据库选项，删麻辣，加热量）
# ═══════════════════════════════════════════════
ORD_MAPPINGS = {
    '辣度': {'无': 0, '不辣': 1, '微辣': 2, '中辣': 3, '重辣': 4},
    '咸淡': {'无': 0, '清淡': 1, '适中': 2, '偏咸': 3},
    '甜酸': {'无': 0, '无味': 1, '偏甜': 2, '偏酸': 3, '甜酸': 4},
    '热量': {'无': 0, '低': 1, '中': 2, '高': 3},
    '价格区间': {'经济': 1, '适中': 2, '品质': 3, '无': 0},
}

FEATURE_NAMES = ['辣度', '咸淡', '甜酸', '热量', '价格', '招牌', '评分',
                 '用户辣度', '用户咸淡', '用户甜酸', '用户价格']

# 用户偏好组合模板（30种，覆盖辣度×咸淡×甜酸×热量的多样化组合）
USER_PROFILES = [
    {'辣度': '微辣', '咸淡': '适中', '甜酸': '甜酸', 'calorie': '中', '价格': '经济'},
    {'辣度': '不辣', '咸淡': '清淡', '甜酸': '无味', 'calorie': '低', '价格': '适中'},
    {'辣度': '重辣', '咸淡': '偏咸', '甜酸': '偏甜', 'calorie': '高', '价格': '品质'},
    {'辣度': '中辣', '咸淡': '适中', '甜酸': '偏甜', 'calorie': '中', '价格': '经济'},
    {'辣度': '微辣', '咸淡': '偏咸', '甜酸': '偏酸', 'calorie': '中', '价格': '适中'},
    {'辣度': '不辣', '咸淡': '适中', '甜酸': '甜酸', 'calorie': '低', '价格': '品质'},
    {'辣度': '微辣', '咸淡': '清淡', '甜酸': '甜酸', 'calorie': '低', '价格': '经济'},
    {'辣度': '中辣', '咸淡': '偏咸', '甜酸': '偏甜', 'calorie': '高', '价格': '适中'},
    {'辣度': '不辣', '咸淡': '清淡', '甜酸': '偏甜', 'calorie': '低', '价格': '品质'},
    {'辣度': '重辣', '咸淡': '适中', '甜酸': '无味', 'calorie': '高', '价格': '经济'},
    {'辣度': '中辣', '咸淡': '清淡', '甜酸': '无味', 'calorie': '低', '价格': '适中'},
    {'辣度': '微辣', '咸淡': '适中', '甜酸': '偏甜', 'calorie': '中', '价格': '品质'},
    {'辣度': '不辣', '咸淡': '偏咸', '甜酸': '偏酸', 'calorie': '中', '价格': '经济'},
    {'辣度': '重辣', '咸淡': '清淡', '甜酸': '甜酸', 'calorie': '中', '价格': '适中'},
    {'辣度': '中辣', '咸淡': '适中', '甜酸': '无味', 'calorie': '中', '价格': '品质'},
    {'辣度': '微辣', '咸淡': '偏咸', '甜酸': '无味', 'calorie': '高', '价格': '经济'},
    {'辣度': '不辣', '咸淡': '适中', '甜酸': '偏酸', 'calorie': '低', '价格': '适中'},
    {'辣度': '重辣', '咸淡': '偏咸', '甜酸': '偏酸', 'calorie': '高', '价格': '品质'},
    {'辣度': '中辣', '咸淡': '清淡', '甜酸': '甜酸', 'calorie': '低', '价格': '经济'},
    {'辣度': '微辣', '咸淡': '适中', '甜酸': '偏酸', 'calorie': '中', '价格': '适中'},
    {'辣度': '不辣', '咸淡': '清淡', '甜酸': '无味', 'calorie': '低', '价格': '品质'},
    {'辣度': '重辣', '咸淡': '适中', '甜酸': '偏甜', 'calorie': '高', '价格': '经济'},
    {'辣度': '中辣', '咸淡': '偏咸', '甜酸': '甜酸', 'calorie': '中', '价格': '适中'},
    {'辣度': '微辣', '咸淡': '清淡', '甜酸': '无味', 'calorie': '低', '价格': '品质'},
    {'辣度': '不辣', '咸淡': '偏咸', '甜酸': '无味', 'calorie': '中', '价格': '经济'},
    {'辣度': '重辣', '咸淡': '适中', '甜酸': '无味', 'calorie': '高', '价格': '适中'},
    {'辣度': '中辣', '咸淡': '清淡', '甜酸': '偏酸', 'calorie': '中', '价格': '品质'},
    {'辣度': '微辣', '咸淡': '偏咸', '甜酸': '偏甜', 'calorie': '中', '价格': '经济'},
    {'辣度': '不辣', '咸淡': '适中', '甜酸': '偏甜', 'calorie': '低', '价格': '适中'},
    {'辣度': '重辣', '咸淡': '偏咸', '甜酸': '无味', 'calorie': '高', '价格': '品质'},
]


# ═══════════════════════════════════════════════
# 2. 从数据库加载真实菜品数据
# ═══════════════════════════════════════════════
def load_dishes_from_db():
    """从PostgreSQL加载菜品数据"""
    import psycopg2
    conn = psycopg2.connect(
        host='localhost', port=5432, database='tangmao',
        user='postgres', password=os.environ['PG_PASSWORD']
    )
    cur = conn.cursor()
    cur.execute('''
        SELECT id, name, category, spiciness, saltiness, sweetness,
               price, rating, tags, is_halal, is_vegetarian, is_active, calorie
        FROM dishes WHERE is_active = TRUE ORDER BY id
    ''')
    rows = cur.fetchall()
    conn.close()
    return rows


def parse_tags(tags):
    """解析tags字段，支持多种格式"""
    if tags is None:
        return []
    if isinstance(tags, list):
        return tags
    if isinstance(tags, str):
        try:
            import ast
            parsed = ast.literal_eval(tags)
            return parsed if isinstance(parsed, list) else [t.strip() for t in tags.split(',') if t.strip()]
        except:
            return [t.strip() for t in tags.split(',') if t.strip()]
    return []


# ═══════════════════════════════════════════════
# 3. 生成训练数据
# ═══════════════════════════════════════════════
def encode_dish(dish, user_pref):
    """将一道菜品 + 用户偏好编码为10维特征向量"""
    _, name, category, spiciness, saltiness, sweetness, price, rating, tags, is_halal, is_vegetarian, is_active, calorie = dish
    tags_list = parse_tags(tags)
    is_sig = 1.0 if '招牌' in tags_list else 0.0
    price_val = float(price) if price and float(price) > 0 else 20.0
    rating_val = float(rating) if rating and float(rating) > 0 else 4.0
    cal_val = calorie if calorie else '中'

    X = np.zeros(11)
    X[0] = ORD_MAPPINGS['辣度'].get(spiciness, 1)
    X[1] = ORD_MAPPINGS['咸淡'].get(saltiness, 1)
    X[2] = ORD_MAPPINGS['甜酸'].get(sweetness, 1)
    X[3] = ORD_MAPPINGS['热量'].get(cal_val, 2)
    X[4] = price_val / 100
    X[5] = is_sig
    X[6] = rating_val / 5
    X[7] = ORD_MAPPINGS['辣度'].get(user_pref['辣度'], 1)
    X[8] = ORD_MAPPINGS['咸淡'].get(user_pref['咸淡'], 1)
    X[9] = ORD_MAPPINGS['甜酸'].get(user_pref['甜酸'], 1)
    X[10] = ORD_MAPPINGS['价格区间'].get(user_pref.get('价格', '无'), 0)
    return X, name, is_sig, price_val, rating_val, category


def compute_score(X, is_sig, price_val, rating_val, category):
    """基于特征向量计算合理的目标评分（匹配用户偏好的程度）"""
    # 评分贡献 15%
    score = rating_val / 5 * 0.15

    # 口味匹配贡献 40%（辣度超出重罚，咸淡差级，甜酸精确）
    spiciness_diff = X[0] - X[7]
    if spiciness_diff > 0:
        spiciness_match = 0.2
    else:
        spiciness_match = 1.0 - min(abs(spiciness_diff) / 4, 1.0) * 0.5
    saltiness_match = 1.0 - min(abs(X[1] - X[8]) / 3, 1.0) * 0.3
    sweetness_match = 1.0 if abs(X[2] - X[9]) == 0 else 0.4
    score += spiciness_match * 0.20 + saltiness_match * 0.12 + sweetness_match * 0.08

    # 热量匹配贡献 12%
    cal_match = 1.0 - min(abs(X[3] - 2) / 3, 1.0) * 0.5
    score += cal_match * 0.12

    # 招牌贡献 8%
    score += is_sig * 0.08

    # 价格贡献 10% — 按用户价格区间匹配(经济<20/适中20-50/品质>50)
    user_price = X[10]
    if user_price == 1:  # 经济
        price_match = 1.0 if price_val < 20 else 0.2
    elif user_price == 3:  # 品质
        price_match = 1.0 if price_val > 50 else 0.2
    elif user_price == 2:  # 适中
        price_match = 1.0 if 20 <= price_val <= 50 else 0.2
    else:  # 无偏好
        price_match = 0.7
    score += price_match * 0.10

    # 类别贡献 5%
    cat_bonus = {'热菜': 0.05, '凉菜': 0.03, '主食': 0.02, '汤品': 0.04, '甜品': 0.03}
    score += cat_bonus.get(category, 0.02) * 0.05

    # 用户偏好强度贡献 10%
    score += (X[7] / 4) * 0.04 + (X[9] / 4) * 0.03 + (X[8] / 3) * 0.03

    # 映射到 0.1~1.0
    score = score * 0.7 + 0.3
    score += np.random.normal(0, 0.008)
    return max(0.1, min(1.0, score))


def generate_training_data(dishes, user_profiles, samples_per_dish=24):
    """生成训练数据集（模拟真实用户: 用户差异+评分偏态+少量反规则）"""
    X_list, y_list = [], []
    for up in user_profiles:
        # 用户差异: 每个模拟用户有偏好偏移(±0.5级) + 评分倾向(0.85~1.15)
        user_bias = np.random.normal(0, 0.5)     # 口味容忍偏移
        user_scale = np.random.uniform(0.85, 1.15)  # 评分倾向: 有人严有人松
        rebel = np.random.random() < 0.1          # 10% 用户不按规则(爱吃超出辣度的菜)
        for dish in dishes:
            X, name, is_sig, price_val, rating_val, category = encode_dish(dish, up)
            up2 = dict(up)
            # 反规则用户: 辣度容忍+1级
            if rebel:
                spice_shift = {'无': '无', '不辣': '微辣', '微辣': '中辣', '中辣': '重辣', '重辣': '重辣'}
                up2['辣度'] = spice_shift.get(up['辣度'], up['辣度'])
            score = compute_score(X, is_sig, price_val, rating_val, category)
            score = score * user_scale + user_bias * 0.01
            score = max(0.1, min(1.0, score))
            X_list.append(X)
            y_list.append(score)
            for _ in range(samples_per_dish - 1):
                X_noise = X + np.random.normal(0, 0.008, 11)
                X_noise = np.clip(X_noise, 0, None)
                y_noise = score + np.random.normal(0, 0.008)
                y_noise = max(0.1, min(1.0, y_noise))
                X_list.append(X_noise)
                y_list.append(y_noise)
    return np.array(X_list), np.array(y_list)


# ═══════════════════════════════════════════════
# 4. 训练模型
# ═══════════════════════════════════════════════
def train_model(X, y):
    """训练随机森林回归模型"""
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=600,
        max_depth=20,
        min_samples_leaf=1,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)

    # 评估
    y_pred = model.predict(X_test)
    r2 = 1 - np.sum((y_test - y_pred)**2) / np.sum((y_test - y_test.mean())**2)
    mse = np.mean((y_test - y_pred)**2)
    rmse = np.sqrt(mse)
    mae = np.mean(np.abs(y_test - y_pred))

    print(f'训练集: {len(X_train)} 条, 测试集: {len(X_test)} 条', file=sys.stderr)
    print(f'R²: {r2:.4f}, MSE: {mse:.6f}, RMSE: {rmse:.4f}, MAE: {mae:.4f}', file=sys.stderr)
    return model, {'r2': float(r2), 'mse': float(mse), 'rmse': float(rmse), 'mae': float(mae)}


# ═══════════════════════════════════════════════
# 5. 导出特征重要性
# ═══════════════════════════════════════════════
def export_feature_importance(model):
    """导出特征重要性JSON"""
    imp = model.feature_importances_
    result = [{'feature': FEATURE_NAMES[i], 'importance': round(float(imp[i]), 4)}
              for i in range(len(FEATURE_NAMES))]
    result.sort(key=lambda x: -x['importance'])
    return result


# ═══════════════════════════════════════════════
# 6. 主流程
# ═══════════════════════════════════════════════
def main():
    random.seed(42)
    np.random.seed(42)

    # 加载数据
    print('正在加载菜品数据...', file=sys.stderr)
    try:
        dishes = load_dishes_from_db()
        print(f'从数据库加载 {len(dishes)} 道菜品', file=sys.stderr)
    except Exception as e:
        print(f'数据库连接失败: {e}', file=sys.stderr)
        sys.exit(1)

    # 生成训练数据
    print('正在生成训练数据...', file=sys.stderr)
    X, y = generate_training_data(dishes, USER_PROFILES, samples_per_dish=24)
    print(f'生成 {len(X)} 条训练数据', file=sys.stderr)

    # 训练
    print('正在训练模型...', file=sys.stderr)
    model, metrics = train_model(X, y)

    # 特征重要性
    importance = export_feature_importance(model)
    print('\n特征重要性:', file=sys.stderr)
    for r in importance:
        print(f'  {r["feature"]}: {r["importance"]:.4f} ({r["importance"]*100:.1f}%)', file=sys.stderr)

    # 保存模型
    model_data = {
        'model': model,
        'ohe': None,
        'le_dict': {},
        'scaler': None,
        'metrics': {
            **metrics,
            'real_feedback_count': 0,
            'training_samples': len(X),
            'feature_count': 11,
            'feature_names': FEATURE_NAMES
        }
    }
    model_path = os.path.join(os.path.dirname(__file__), 'recommendation_model.pkl')
    with open(model_path, 'wb') as f:
        pickle.dump(model_data, f)
    print(f'\n模型已保存: {model_path}', file=sys.stderr)

    # 输出JSON（供前端调用）
    result = {
        'success': True,
        'importance': importance,
        'metrics': metrics,
        'training_samples': len(X),
        'feature_count': 11,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()