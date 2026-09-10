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
                 '用户辣度', '用户咸淡', '用户甜酸', '用户价格', '用户热量']

# 模拟用户池：按接近真实人群的比例随机生成
# （原来手写 30 个用户太少，靠"同一道题抄 24 遍"凑数据量 —— 那是虚高 R² 和模型膨胀的根源）
# 用独立 Random(seed) 保证可复现，且不受全局 np.random 状态影响
def make_user_profiles(n=800, seed=20260101):
    rng = random.Random(seed)
    profs = []
    for _ in range(n):
        profs.append({
            '辣度': rng.choices(['不辣', '微辣', '中辣', '重辣'], weights=[35, 40, 18, 7])[0],
            '咸淡': rng.choices(['清淡', '适中', '偏咸'], weights=[30, 55, 15])[0],
            '甜酸': rng.choices(['无味', '偏甜', '偏酸', '甜酸'], weights=[45, 25, 18, 12])[0],
            'calorie': rng.choices(['低', '中', '高'], weights=[30, 50, 20])[0],
            '价格': rng.choices(['经济', '适中', '品质'], weights=[40, 45, 15])[0],
        })
    return profs


USER_PROFILES = make_user_profiles(800)


# ═══════════════════════════════════════════════
# 2. 从数据库加载真实菜品数据
# ═══════════════════════════════════════════════
def load_dishes_from_db():
    """从PostgreSQL加载菜品数据"""
    import psycopg2
    conn = psycopg2.connect(
        host='localhost', port=5432, database='tangmao',
        user='postgres', password=os.environ.get('PG_PASSWORD', '')
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

    X = np.zeros(12)
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
    X[11] = ORD_MAPPINGS['热量'].get(user_pref.get('calorie', '无'), 0)
    return X, name, is_sig, price_val, rating_val, category


def compute_score(X, is_sig, price_val, rating_val, category):
    """与线上规则 computeDishMatch(script.js:177) 对齐的训练目标函数。
    逻辑完全镜像 computeDishMatch 的阶梯式打分，确保 ML 学的规律和线上规则一致。
    输出 0.1~1.0（= matchRate = total/14，与 computeDishMatch 的 matchRate 同口径）。"""
    # ── 口味 taste（-3 ~ +6）──
    taste = 0.0
    # 辣度：菜比用户辣→-2(重罚)；精确→+2；差1级→+1；差2级→+0；无偏好→+2
    if X[7] == 0:        # 用户无辣度偏好
        taste += 2
    elif X[0] > X[7]:    # 菜比用户偏好辣
        taste -= 2
    else:
        d = X[7] - X[0]
        taste += 2 if d == 0 else (1 if d == 1 else 0)
    # 咸淡：精确→+2；差1级→+1；差2级→+0；无偏好→+2
    if X[8] == 0:
        taste += 2
    else:
        d = abs(X[1] - X[8])
        taste += 2 if d == 0 else (1 if d == 1 else 0)
    # 甜酸：精确→+2；不匹配→-1；无偏好→+2
    if X[9] == 0:
        taste += 2
    else:
        taste += 2 if X[2] == X[9] else -1

    # ── 菜系 cuisine：招牌→+1.5，无→0 ──
    cuisine = 1.5 if is_sig else 0.0

    # ── 热量 calorie：精确→+2；差1级→+1；差2级→+0；无偏好→+1 ──
    if X[11] == 0:       # 用户无热量偏好
        calorie = 1.0
    else:
        d = abs(X[3] - X[11])
        calorie = 2.0 if d == 0 else (1.0 if d == 1 else 0.0)

    # ── 价格 price（三档制，与 computeDishMatch 一致）──
    if X[10] == 0:       # 无偏好
        price = 1.0
    elif X[10] == 1:     # 经济
        price = 2.0 if price_val < 20 else (-1.0 if price_val < 30 else -2.0)
    elif X[10] == 2:     # 适中
        price = 2.0 if 20 <= price_val <= 50 else -1.0
    elif X[10] == 3:     # 品质
        price = 2.0 if price_val > 50 else (-1.0 if price_val > 40 else -2.0)
    else:
        price = 1.0

    # ── 菜品评分 rating ──
    rating = (rating_val / 5) * 2.5 if rating_val > 0 else 2.0

    # ── 总分 → matchRate（与 computeDishMatch 的 total/14 同口径）──
    total = taste + cuisine + calorie + price + rating
    match_rate = total / 14.0
    return max(0.1, min(1.0, match_rate))


def generate_training_data(dishes, user_profiles, samples_per_dish=1):
    """生成训练数据集。
    要点（让模拟数据更像真人）：
    - 每个"用户×菜品"只出 1 条，不再复印近似重复样本；数据量靠"更多不同的用户"。
    - 答案里不再乘隐藏的随机"评分倾向"（特征里看不到，会让目标变得不可学）。
    - 10% 用户"口不对心"：声明的辣度偏好 ≠ 真实口味。特征仍用声明值（线上拿到的就是声明值），
      但目标按真实口味算 —— 这才是真实世界里的噪声来源。
    """
    X_list, y_list = [], []
    SPICE_SHIFT = {'无': '无', '不辣': '微辣', '微辣': '中辣', '中辣': '重辣', '重辣': '重辣'}
    for up in user_profiles:
        rebel = np.random.random() < 0.1          # 10% 用户不按声明口味吃
        up_true = dict(up)
        if rebel:
            up_true['辣度'] = SPICE_SHIFT.get(up['辣度'], up['辣度'])
        for dish in dishes:
            # 特征：按用户"声明的"偏好编码
            X, name, is_sig, price_val, rating_val, category = encode_dish(dish, up)
            if rebel:
                # 目标：按用户"真实的"口味计算
                X_true, _, _, _, _, _ = encode_dish(dish, up_true)
                score = compute_score(X_true, is_sig, price_val, rating_val, category)
            else:
                score = compute_score(X, is_sig, price_val, rating_val, category)
            # 只保留轻微评分噪声（真人评分有抖动，但不足以让目标不可学）
            score = max(0.1, min(1.0, score + np.random.normal(0, 0.01)))
            X_list.append(X)
            y_list.append(score)
            for _ in range(samples_per_dish - 1):
                X_noise = X + np.random.normal(0, 0.008, 12)
                X_noise = np.clip(X_noise, 0, None)
                y_noise = score + np.random.normal(0, 0.008)
                y_noise = max(0.1, min(1.0, y_noise))
                X_list.append(X_noise)
                y_list.append(y_noise)
    return np.array(X_list), np.array(y_list)


# ═══════════════════════════════════════════════
# 4. 训练模型
# ═══════════════════════════════════════════════
def train_model(X_train, y_train, X_test, y_test):
    """训练随机森林回归模型。
    X_test/y_test 必须是「另一批全新模拟用户」的数据：不能再用同一批数据随机切分，
    否则同一"用户×菜品"簇的样本会同时进训练和测试，R² 会虚高（旧版 0.98 就是这么来的）。
    """
    model = RandomForestRegressor(
        n_estimators=300,      # 数据不再靠复印件撑量，不需要那么多深树
        max_depth=12,          # 原 20：太深会把单点噪声也背进去
        min_samples_leaf=2,    # 叶子至少 2 条，抑制对孤立样本的记忆
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)

    # 评估（用全新用户的数据）
    y_pred = model.predict(X_test)
    r2 = 1 - np.sum((y_test - y_pred)**2) / np.sum((y_test - y_test.mean())**2)
    mse = np.mean((y_test - y_pred)**2)
    rmse = np.sqrt(mse)
    mae = np.mean(np.abs(y_test - y_pred))

    print(f'训练集: {len(X_train)} 条, 测试集(全新模拟用户): {len(X_test)} 条', file=sys.stderr)
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

    # 生成训练数据（一批模拟用户）
    print('正在生成训练数据...', file=sys.stderr)
    X, y = generate_training_data(dishes, USER_PROFILES, samples_per_dish=1)
    print(f'生成 {len(X)} 条训练数据（{len(USER_PROFILES)} 位模拟用户）', file=sys.stderr)

    # 生成测试数据：另一批全新模拟用户（诚实评估，与训练用户完全不重叠）
    test_profiles = make_user_profiles(200, seed=777)
    X_te, y_te = generate_training_data(dishes, test_profiles, samples_per_dish=1)
    print(f'生成 {len(X_te)} 条测试数据（{len(test_profiles)} 位全新模拟用户）', file=sys.stderr)

    # 训练 + 评估
    print('正在训练模型...', file=sys.stderr)
    model, metrics = train_model(X, y, X_te, y_te)

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
            'feature_count': 12,
            'feature_names': FEATURE_NAMES
        }
    }
    model_path = os.path.join(os.path.dirname(__file__), 'recommendation_model.pkl')
    with open(model_path, 'wb') as f:
        pickle.dump(model_data, f)
    print(f'\n模型已保存: {model_path}', file=sys.stderr)

    # 同步写 model_metrics.json / feature_importance.json
    # （管理后台仪表盘读这两个文件；此前没有任何脚本写 model_metrics.json，
    #   导致重训后页面上的 R²/特征重要性一直是旧模型的数字）
    import datetime
    with open(os.path.join(os.path.dirname(__file__), 'model_metrics.json'), 'w', encoding='utf-8') as f:
        json.dump({
            **metrics,
            'feature_count': 12,
            'training_samples': len(X),
            'real_feedback_count': 0,
            'trained_at': datetime.datetime.now().isoformat(),
        }, f, ensure_ascii=False, indent=2)
    with open(os.path.join(os.path.dirname(__file__), 'feature_importance.json'), 'w', encoding='utf-8') as f:
        json.dump({'success': True, 'importance': importance}, f, ensure_ascii=False, indent=2)
    print('已同步 model_metrics.json / feature_importance.json', file=sys.stderr)

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