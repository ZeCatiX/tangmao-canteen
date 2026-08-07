# -*- coding: utf-8 -*-
"""
唐猫庭院 - 完整AI模型训练系统
包含：高级特征工程、多模型对比、交叉验证、超参数调优、模型评估报告
"""
import pickle, json, sys, os, random, time
import numpy as np
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import cross_val_score, GridSearchCV, train_test_split
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
sys.stdout.reconfigure(encoding='utf-8')

# ═══════════════════════════════════════════════
# 1. 特征工程
# ═══════════════════════════════════════════════
ORD_MAPPINGS = {
    '辣度': {'无': 0, '不辣': 1, '微辣': 2, '中辣': 3, '重辣': 4, '麻辣': 5},
    '咸淡': {'无': 0, '清淡': 1, '适中': 2, '偏咸': 3},
    '甜酸': {'无': 0, '无味': 1, '微甜': 2, '酸甜': 3, '偏酸': 4, '偏甜': 5},
}

FEATURE_NAMES = ['辣度', '咸淡', '甜酸', '价格', '招牌', '评分',
                 '用户辣度', '用户咸淡', '用户甜酸']

USER_PROFILES = [
    {'辣度': '微辣', '咸淡': '适中', '甜酸': '酸甜'},
    {'辣度': '不辣', '咸淡': '清淡', '甜酸': '无味'},
    {'辣度': '重辣', '咸淡': '偏咸', '甜酸': '偏甜'},
    {'辣度': '中辣', '咸淡': '适中', '甜酸': '微甜'},
    {'辣度': '微辣', '咸淡': '偏咸', '甜酸': '偏酸'},
    {'辣度': '不辣', '咸淡': '适中', '甜酸': '酸甜'},
    {'辣度': '麻辣', '咸淡': '适中', '甜酸': '无味'},
    {'辣度': '微辣', '咸淡': '清淡', '甜酸': '酸甜'},
    {'辣度': '中辣', '咸淡': '偏咸', '甜酸': '偏甜'},
    {'辣度': '不辣', '咸淡': '清淡', '甜酸': '微甜'},
]


def load_dishes():
    """从PostgreSQL加载菜品数据"""
    import psycopg2
    conn = psycopg2.connect(
        host='localhost', port=5432, database='tangmao',
        user='postgres', password=os.environ['PG_PASSWORD']
    )
    cur = conn.cursor()
    cur.execute('''
        SELECT id, name, category, spiciness, saltiness, sweetness,
               price, rating, tags, is_halal, is_vegetarian, is_active
        FROM dishes WHERE is_active = TRUE ORDER BY id
    ''')
    rows = cur.fetchall()
    conn.close()
    return rows


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


def encode_features(dish, user_pref):
    """编码9维特征"""
    _, name, category, spiciness, saltiness, sweetness, price, rating, tags, is_halal, is_vegetarian, is_active = dish
    tags_list = parse_tags(tags)
    is_sig = 1.0 if '招牌' in tags_list else 0.0
    price_val = float(price) if price and float(price) > 0 else 20.0
    rating_val = float(rating) if rating and float(rating) > 0 else 4.0

    X = np.zeros(9)
    X[0] = ORD_MAPPINGS['辣度'].get(spiciness, 1)
    X[1] = ORD_MAPPINGS['咸淡'].get(saltiness, 1)
    X[2] = ORD_MAPPINGS['甜酸'].get(sweetness, 1)
    X[3] = price_val / 100
    X[4] = is_sig
    X[5] = rating_val / 5
    X[6] = ORD_MAPPINGS['辣度'].get(user_pref['辣度'], 1)
    X[7] = ORD_MAPPINGS['咸淡'].get(user_pref['咸淡'], 1)
    X[8] = ORD_MAPPINGS['甜酸'].get(user_pref['甜酸'], 1)
    return X, is_sig, price_val, rating_val, category


def compute_target(X, is_sig, price_val, rating_val, category):
    """计算目标评分"""
    score = rating_val / 5 * 0.20
    spiciness_match = 1.0 - min(abs(X[0] - X[6]) / 5, 1.0)
    saltiness_match = 1.0 - min(abs(X[1] - X[7]) / 3, 1.0)
    sweetness_match = 1.0 - min(abs(X[2] - X[8]) / 5, 1.0)
    score += spiciness_match * 0.15 + saltiness_match * 0.08 + sweetness_match * 0.12
    score += is_sig * 0.08
    ideal_price = 28.0
    price_dist = abs(price_val - ideal_price) / 80
    price_pref = max(0, 1.0 - price_dist * 1.5)
    score += price_pref * 0.17
    cat_bonus = {'热菜': 0.05, '凉菜': 0.03, '主食': 0.02, '汤品': 0.04, '甜品': 0.03}
    score += cat_bonus.get(category, 0.02) * 0.05
    score += (X[6] / 5) * 0.05 + (X[8] / 5) * 0.05 + (X[7] / 3) * 0.05
    score = score * 0.7 + 0.3
    score += np.random.normal(0, 0.025)
    return max(0.1, min(1.0, score))


def generate_dataset(dishes, profiles, samples_per_dish=4):
    """生成完整训练数据集"""
    X_list, y_list = [], []
    for dish in dishes:
        for up in profiles:
            X, is_sig, price_val, rating_val, category = encode_features(dish, up)
            y = compute_target(X, is_sig, price_val, rating_val, category)
            X_list.append(X)
            y_list.append(y)
            for _ in range(samples_per_dish - 1):
                Xn = X + np.random.normal(0, 0.02, 9)
                Xn = np.clip(Xn, 0, None)
                yn = y + np.random.normal(0, 0.02)
                X_list.append(Xn)
                y_list.append(max(0.1, min(1.0, yn)))
    return np.array(X_list), np.array(y_list)


# ═══════════════════════════════════════════════
# 2. 模型训练与评估
# ═══════════════════════════════════════════════
def train_random_forest(X_train, y_train, X_test, y_test):
    """训练随机森林 + 网格搜索调优"""
    print('\n--- 随机森林模型 ---', file=sys.stderr)

    # 基础模型
    rf = RandomForestRegressor(random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    baseline_r2 = r2_score(y_test, rf.predict(X_test))
    print(f'基础模型 R²: {baseline_r2:.4f}', file=sys.stderr)

    # 网格搜索调优
    param_grid = {
        'n_estimators': [100, 200],
        'max_depth': [8, 10, 12, None],
        'min_samples_leaf': [1, 2, 4],
    }
    grid = GridSearchCV(
        RandomForestRegressor(random_state=42, n_jobs=-1),
        param_grid, cv=3, scoring='r2', n_jobs=-1, verbose=0
    )
    grid.fit(X_train, y_train)
    best_rf = grid.best_estimator_
    best_r2 = r2_score(y_test, best_rf.predict(X_test))

    print(f'最优参数: {grid.best_params_}', file=sys.stderr)
    print(f'优化后 R²: {best_r2:.4f}', file=sys.stderr)
    return best_rf


def train_gradient_boosting(X_train, y_train, X_test, y_test):
    """训练梯度提升回归（对比用）"""
    print('\n--- 梯度提升模型 ---', file=sys.stderr)
    gb = GradientBoostingRegressor(n_estimators=100, max_depth=5, random_state=42)
    gb.fit(X_train, y_train)
    r2 = r2_score(y_test, gb.predict(X_test))
    print(f'GradientBoosting R²: {r2:.4f}', file=sys.stderr)
    return gb


# ═══════════════════════════════════════════════
# 3. 主流程
# ═══════════════════════════════════════════════
def main():
    random.seed(42)
    np.random.seed(42)
    print('=' * 50, file=sys.stderr)
    print('唐猫庭院 - AI模型训练系统', file=sys.stderr)
    print('=' * 50, file=sys.stderr)

    # 加载数据
    print('\n[1/5] 加载菜品数据...', file=sys.stderr)
    dishes = load_dishes()
    print(f'  加载 {len(dishes)} 道菜品', file=sys.stderr)

    # 生成训练数据
    print('\n[2/5] 生成训练数据...', file=sys.stderr)
    X, y = generate_dataset(dishes, USER_PROFILES, samples_per_dish=4)
    print(f'  生成 {len(X)} 条数据, {X.shape[1]} 维特征', file=sys.stderr)

    # 划分数据集
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42
    )
    print(f'  训练集: {len(X_train)} 条, 测试集: {len(X_test)} 条', file=sys.stderr)

    # 训练模型
    print('\n[3/5] 训练模型...', file=sys.stderr)
    model = train_random_forest(X_train, y_train, X_test, y_test)

    # 交叉验证
    print('\n[4/5] 交叉验证...', file=sys.stderr)
    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring='r2')
    print(f'  5折交叉验证 R²: {cv_scores.mean():.4f} (±{cv_scores.std():.4f})', file=sys.stderr)

    # 评估
    y_pred = model.predict(X_test)
    metrics = {
        'r2': float(r2_score(y_test, y_pred)),
        'mse': float(mean_squared_error(y_test, y_pred)),
        'rmse': float(np.sqrt(mean_squared_error(y_test, y_pred))),
        'mae': float(mean_absolute_error(y_test, y_pred)),
        'cv_r2_mean': float(cv_scores.mean()),
        'cv_r2_std': float(cv_scores.std()),
        'training_samples': len(X),
        'feature_count': X.shape[1],
        'feature_names': FEATURE_NAMES,
        'real_feedback_count': 0,
    }

    # 特征重要性
    print('\n[5/5] 特征重要性:', file=sys.stderr)
    imp = model.feature_importances_
    importance = []
    for i, name in enumerate(FEATURE_NAMES):
        importance.append({'feature': name, 'importance': round(float(imp[i]), 4)})
    importance.sort(key=lambda x: -x['importance'])
    for r in importance:
        print(f'  {r["feature"]}: {r["importance"]:.4f} ({r["importance"]*100:.1f}%)', file=sys.stderr)

    # 保存模型
    model_data = {
        'model': model,
        'ohe': None,
        'le_dict': {},
        'scaler': None,
        'metrics': metrics,
    }
    model_path = os.path.join(os.path.dirname(__file__), 'recommendation_model.pkl')
    with open(model_path, 'wb') as f:
        pickle.dump(model_data, f)
    print(f'\n模型已保存: {model_path}', file=sys.stderr)

    # 输出JSON
    print(json.dumps({
        'success': True,
        'importance': importance,
        'metrics': {k: v for k, v in metrics.items() if isinstance(v, (int, float))},
        'training_samples': len(X),
        'feature_count': X.shape[1],
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()