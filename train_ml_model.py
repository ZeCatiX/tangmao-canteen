# -*- coding: utf-8 -*-
"""
唐猫庭院 - 模型训练脚本（真实数据 + 合成数据联合训练）
从PostgreSQL加载真实反馈，结合31000条合成数据训练模型
"""
import pickle, json, sys, os, random, numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
sys.stdout.reconfigure(encoding='utf-8')

# ═══════════════════════════════════════════════
# 1. 特征编码配置
# ═══════════════════════════════════════════════
ORD_MAPPINGS = {
    '辣度': {'无':0,'不辣':1,'微辣':2,'中辣':3,'重辣':4,'麻辣':5},
    '咸淡': {'无':0,'清淡':1,'适中':2,'偏咸':3},
    '甜酸': {'无':0,'无味':1,'微甜':2,'酸甜':3,'偏酸':4,'偏甜':5},
}
FEATURE_NAMES = ['辣度','咸淡','甜酸','价格','招牌','评分','用户辣度','用户咸淡','用户甜酸']

USER_PREF_DIST = [
    {'辣度':'微辣','咸淡':'适中','甜酸':'酸甜','weight':0.25},
    {'辣度':'不辣','咸淡':'清淡','甜酸':'无味','weight':0.15},
    {'辣度':'重辣','咸淡':'偏咸','甜酸':'偏甜','weight':0.08},
    {'辣度':'中辣','咸淡':'适中','甜酸':'微甜','weight':0.12},
    {'辣度':'微辣','咸淡':'偏咸','甜酸':'偏酸','weight':0.10},
    {'辣度':'不辣','咸淡':'适中','甜酸':'酸甜','weight':0.10},
    {'辣度':'麻辣','咸淡':'适中','甜酸':'无味','weight':0.05},
    {'辣度':'微辣','咸淡':'清淡','甜酸':'酸甜','weight':0.08},
    {'辣度':'中辣','咸淡':'偏咸','甜酸':'偏甜','weight':0.04},
    {'辣度':'不辣','咸淡':'清淡','甜酸':'微甜','weight':0.03},
]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ═══════════════════════════════════════════════
# 2. 数据库加载
# ═══════════════════════════════════════════════
def load_data():
    """加载菜品和真实反馈数据"""
    import psycopg2
    conn = psycopg2.connect(host='localhost',port=5432,database='tangmao',
        user='postgres',password=os.environ.get('PG_PASSWORD', ''))
    cur = conn.cursor()

    # 加载菜品
    cur.execute('SELECT id,name,category,spiciness,saltiness,sweetness,price,rating,tags FROM dishes WHERE is_active=TRUE')
    dishes = cur.fetchall()
    print(f'菜品: {len(dishes)} 道', file=sys.stderr)

    # 加载有偏好的真实反馈
    cur.execute('''
        SELECT f.dish_id, f.rating, f.user_preferences,
               d.spiciness, d.saltiness, d.sweetness, d.price, d.rating as dish_rating, d.tags
        FROM feedback f JOIN dishes d ON f.dish_id = d.id
        WHERE f.user_preferences IS NOT NULL AND f.user_preferences != '{}'::jsonb
    ''')
    feedbacks = cur.fetchall()
    conn.close()
    print(f'真实反馈(有偏好): {len(feedbacks)} 条', file=sys.stderr)
    return dishes, feedbacks


def parse_tags(tags):
    if tags is None: return []
    if isinstance(tags, list): return tags
    if isinstance(tags, str):
        try:
            import ast
            return ast.literal_eval(tags) if isinstance(ast.literal_eval(tags), list) else []
        except:
            return [t.strip() for t in tags.split(',') if t.strip()]
    return []


# ═══════════════════════════════════════════════
# 3. 真实反馈编码
# ═══════════════════════════════════════════════
def encode_real_feedback(feedbacks):
    """将真实反馈编码为训练数据"""
    X_list, y_list = [], []
    field_map = {'spiciness':'辣度','saltiness':'咸淡','sweetness':'甜酸',
                 'price':'价格','calorie':'热量','protein':'蛋白质','religion':'饮食要求'}

    for fb in feedbacks:
        dish_id, rating, user_prefs, spiciness, saltiness, sweetness, price, dish_rating, tags = fb
        tags_list = parse_tags(tags)
        is_sig = 1.0 if '招牌' in tags_list else 0.0
        price_val = float(price) if price and float(price) > 0 else 20.0
        dish_rating_val = float(dish_rating) if dish_rating and float(dish_rating) > 0 else 4.0

        # 解析user_preferences
        if isinstance(user_prefs, str):
            import json as j
            try: prefs = j.loads(user_prefs)
            except: prefs = {}
        else:
            prefs = user_prefs or {}

        # 提取用户偏好（支持中英文key）
        def get_pref(keys, default='无'):
            for k in keys:
                v = prefs.get(k)
                if v and v != '无' and v != '无所谓':
                    return v
            return default

        user_spice = get_pref(['辣度','spiciness'])
        user_salty = get_pref(['咸淡','saltiness'])
        user_sweet = get_pref(['甜酸','sweetness'])

        X = np.zeros(9)
        X[0] = ORD_MAPPINGS['辣度'].get(spiciness, 1)
        X[1] = ORD_MAPPINGS['咸淡'].get(saltiness, 1)
        X[2] = ORD_MAPPINGS['甜酸'].get(sweetness, 1)
        X[3] = price_val / 100
        X[4] = is_sig
        X[5] = dish_rating_val / 5
        X[6] = ORD_MAPPINGS['辣度'].get(user_spice, 1)
        X[7] = ORD_MAPPINGS['咸淡'].get(user_salty, 1)
        X[8] = ORD_MAPPINGS['甜酸'].get(user_sweet, 1)

        y = max(0.1, min(1.0, float(rating) / 5))
        X_list.append(X)
        y_list.append(y)

    return np.array(X_list), np.array(y_list) if X_list else (np.array([]), np.array([]))


# ═══════════════════════════════════════════════
# 4. 合成数据生成
# ═══════════════════════════════════════════════
def generate_synthetic(dishes, target=31000):
    """生成大规模合成数据"""
    random.seed(42)
    np.random.seed(42)
    X_list, y_list = [], []
    dishes_per_target = target // len(dishes)

    for dish_idx, dish in enumerate(dishes):
        _, name, category, spiciness, saltiness, sweetness, price, rating, tags = dish
        tags_list = parse_tags(tags)
        is_sig = 1.0 if '招牌' in tags_list else 0.0
        price_val = float(price) if price and float(price) > 0 else 20.0
        rating_val = float(rating) if rating and float(rating) > 0 else 4.0
        samples_for_dish = dishes_per_target + (1 if dish_idx < (target % len(dishes)) else 0)

        for up in USER_PREF_DIST:
            count = max(1, int(samples_for_dish * up['weight']))
            for _ in range(count):
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

                # 等权评分
                f0 = X[0]/5; f1 = X[1]/3; f2 = X[2]/5
                f3 = X[3]; f4 = X[4]; f5 = X[5]
                f6 = X[6]/5; f7 = X[7]/3; f8 = X[8]/5
                score = 0.30 + 0.055 * (f0+f1+f2+f3+f4+f5+f6+f7+f8)
                score += np.random.normal(0, 0.015)
                score = max(0.1, min(1.0, score))
                X_list.append(X)
                y_list.append(score)

    return np.array(X_list), np.array(y_list)


# ═══════════════════════════════════════════════
# 5. 模型训练
# ═══════════════════════════════════════════════
def train(X, y, real_count=0):
    """训练随机森林模型"""
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)
    print(f'训练集: {len(X_train)} 条, 测试集: {len(X_test)} 条', file=sys.stderr)

    model = RandomForestRegressor(
        n_estimators=200, max_depth=16, min_samples_leaf=1,
        random_state=42, n_jobs=-1
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    r2 = 1 - np.sum((y_test - y_pred)**2) / np.sum((y_test - y_test.mean())**2)
    mse = np.mean((y_test - y_pred)**2)
    rmse = np.sqrt(mse)
    mae = np.mean(np.abs(y_test - y_pred))

    print(f'R²: {r2:.4f}, MSE: {mse:.6f}, RMSE: {rmse:.4f}, MAE: {mae:.4f}', file=sys.stderr)

    # 特征重要性
    print('\n特征重要性:', file=sys.stderr)
    imp = model.feature_importances_
    for i, name in enumerate(FEATURE_NAMES):
        print(f'  {name}: {imp[i]*100:.1f}%', file=sys.stderr)

    return model, {
        'r2': float(r2), 'mse': float(mse), 'rmse': float(rmse), 'mae': float(mae),
        'real_feedback_count': real_count,
        'training_samples': len(X), 'feature_count': 9, 'feature_names': FEATURE_NAMES,
    }


# ═══════════════════════════════════════════════
# 6. 主流程
# ═══════════════════════════════════════════════
def main():
    print('=' * 50, file=sys.stderr)
    print('唐猫庭院 - 模型训练（真实+合成数据）', file=sys.stderr)
    print('=' * 50, file=sys.stderr)

    # 加载数据
    print('\n[1/4] 加载数据...', file=sys.stderr)
    dishes, real_feedbacks = load_data()

    # 生成合成数据
    print('\n[2/4] 生成合成数据...', file=sys.stderr)
    X_syn, y_syn = generate_synthetic(dishes, target=31000)
    print(f'合成数据: {len(X_syn)} 条', file=sys.stderr)

    # 编码真实反馈
    X_real, y_real = encode_real_feedback(real_feedbacks)
    real_count = len(X_real)
    if real_count > 0:
        print(f'真实反馈: {real_count} 条（不加权，自然累积）', file=sys.stderr)
        X = np.vstack([X_syn, X_real])
        y = np.concatenate([y_syn, y_real])
    else:
        X, y = X_syn, y_syn
    print(f'总训练数据: {len(X)} 条', file=sys.stderr)

    # 训练
    print('\n[3/4] 训练模型...', file=sys.stderr)
    model, metrics = train(X, y, real_count=real_count)

    # 保存
    print('\n[4/4] 保存模型...', file=sys.stderr)
    model_data = {
        'model': model, 'ohe': None, 'le_dict': {}, 'scaler': None,
        'metrics': metrics,
    }
    model_path = os.path.join(BASE_DIR, 'recommendation_model.pkl')
    with open(model_path, 'wb') as f:
        pickle.dump(model_data, f)
    print(f'模型已保存: {model_path}', file=sys.stderr)

    # 输出JSON
    imp = model.feature_importances_
    importance = [{'feature': FEATURE_NAMES[i], 'importance': round(float(imp[i]), 4)}
                  for i in range(len(FEATURE_NAMES))]
    importance.sort(key=lambda x: -x['importance'])
    print(json.dumps({
        'success': True, 'importance': importance, 'metrics': {
            'r2': metrics['r2'], 'mse': metrics['mse'],
            'rmse': metrics['rmse'], 'mae': metrics['mae'],
            'real_feedback_count': real_count, 'training_samples': len(X),
        },
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()