# -*- coding: utf-8 -*-
# ✅ 唯一规范训练脚本（12维特征）。旧脚本 train_ml_model.py / rgzn.py 已移至 deprecated/ 并加防误运行守卫，勿误用。
"""
唐猫庭院 - 菜品推荐模型训练脚本 v2
基于10维特征（辣度、咸淡、甜酸、热量、价格、招牌、评分、用户辣度、用户咸淡、用户甜酸）
训练随机森林回归模型，从PostgreSQL加载数据，生成合成训练集
"""
import pickle, json, sys, os, random, itertools
import numpy as np
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
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
# 偏好各维度的全部取值（与 index.html 的下拉框一一对应）
# 注意「无」= 无所谓，而且 UI 里**它就是每个下拉框的默认选项**（value="无" selected）
PREF_DIMS = {
    '辣度':    ['无', '不辣', '微辣', '中辣', '重辣'],
    '咸淡':    ['无', '清淡', '适中', '偏咸'],
    '甜酸':    ['无', '无味', '偏甜', '偏酸', '甜酸'],
    'calorie': ['无', '低', '中', '高'],
    '价格':    ['无', '经济', '适中', '品质'],
}


def make_user_profiles(n=None, seed=20260101):
    """生成模拟用户偏好组合 —— 系统性覆盖整个输入空间。

    枚举 5 个维度的**完整笛卡尔积**（5×4×5×4×4 = 1600 种），而不是随机采样。
    旧版只随机采"每维都有具体偏好"的组合（432 种、全不含「无」），
    而 UI 里每个维度的**默认值就是「无所谓」** —— 用户不改直接提交是最常见路径，
    模型却从没见过这类输入，只能外推（实测会把招牌菜打低分，与规则完全相反）。
    """
    keys = list(PREF_DIMS)
    combos = list(itertools.product(*(PREF_DIMS[k] for k in keys)))
    profs = [dict(zip(keys, c)) for c in combos]
    random.Random(seed).shuffle(profs)   # 打散，避免同一维度的值聚在一起
    if n is not None and n < len(profs):
        profs = profs[:n]
    return profs


USER_PROFILES = make_user_profiles()   # 全量 1600 种组合


# ═══════════════════════════════════════════════
# 2. 从数据库加载真实菜品数据
# ═══════════════════════════════════════════════
def load_dishes_from_db():
    """从PostgreSQL加载菜品数据"""
    import psycopg2
    conn = psycopg2.connect(
        host=os.environ.get('PG_HOST', 'localhost'),
        port=int(os.environ.get('PG_PORT', '5432')),
        database=os.environ.get('PG_DATABASE', 'tangmao'),
        user=os.environ.get('PG_USER', 'postgres'),
        password=os.environ.get('PG_PASSWORD', '')
    )
    cur = conn.cursor()
    cur.execute('''
        SELECT id, name, category, spiciness, saltiness, sweetness,
               price, rating, tags, is_halal, is_vegetarian, is_active, calorie
        FROM dishes
        WHERE is_active = TRUE
          AND category NOT IN ('飲品与酒水','主食')
        ORDER BY id
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
    rating_val = float(rating) if rating and float(rating) > 0 else 3.5  # 缺失评分兜底 3.5，与 server.js loadDishData 给前端的值一致（否则 train/serve 特征值不同）
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
    # 辣度：菜比用户辣→-2(重罚)；精确→+2；差1级→+1；差2级以上→-2；无偏好→+2
    if X[7] == 0:        # 用户无辣度偏好
        taste += 2
    elif X[0] > X[7]:    # 菜比用户偏好辣
        taste -= 2
    else:
        d = X[7] - X[0]
        taste += 2 if d == 0 else (1 if d == 1 else -2)
    # 咸淡：精确→+3；差1级→+1；差2级以上→-2；无偏好→+2 (2026-09-19: exact +2→+3 适量加权,收窄上线前权重差距)
    if X[8] == 0:
        taste += 2
    else:
        d = abs(X[1] - X[8])
        taste += 3 if d == 0 else (1 if d == 1 else -2)
    # 甜酸：精确→+2；不匹配→-1；无偏好→+2
    if X[9] == 0:
        taste += 2
    else:
        taste += 2 if X[2] == X[9] else -1

    # ── 菜系 cuisine：招牌→+1.0，无→0 ──
    # 原为 +1.5，但那会压过明确的口味偏好（差一级的匹配只有 +1），
    # 导致「不管用户要什么，前几名永远是那 4 道招牌菜」。降到 1.0 后：
    # 精确匹配(+2) 能赢过「差一级(+1) + 招牌(1.0)」，招牌只在同等匹配时打破平局。
    # 注意：改这里必须同步改 script.js 的 computeDishMatch / fallback，否则训练与线上脱节。
    cuisine = 1.0 if is_sig else 0.0

    # ── 热量 calorie：精确→+3；差1级→+1；差2级以上→-2；无偏好→+1 (2026-09-19: exact +2→+3 适量加权) ──
    if X[11] == 0:       # 用户无热量偏好
        calorie = 1.0
    else:
        d = abs(X[3] - X[11])
        calorie = 3.0 if d == 0 else (1.0 if d == 1 else -2.0)

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

    # ── 总分 → matchRate（与 computeDishMatch 的 total/15 同口径;2026-09-19: /14→/15 配合咸淡/热量 exact+3）──
    total = taste + cuisine + calorie + price + rating
    match_rate = total / 15.0
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
    # 「口不对心」用户比例：声明辣度 ≠ 真实口味。保留一点真实感，
    # 但它会**磨平辣度惩罚** —— 实测 10% 时模型对规则的复现相关性从 0.73 掉到 0.45
    # （「不辣」用户那组从 0.77 掉到 0.01，等于学不会"别给不吃辣的人推辣菜"），故压到 3%。
    REBEL_RATE = 0.03
    for up in user_profiles:
        rebel = np.random.random() < REBEL_RATE
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
def fit_model(X, y):
    """拟合 HistGradientBoosting（2026-09-17:替代随机森林——R² 持平 0.9665 vs 0.9674,pkl 从 1.9GB 降到 <1MB）"""
    model = HistGradientBoostingRegressor(random_state=42)
    model.fit(X, y)
    return model


def evaluate(model, X_test, y_test):
    """在给定数据上算指标"""
    y_pred = model.predict(X_test)
    r2 = 1 - np.sum((y_test - y_pred)**2) / np.sum((y_test - y_test.mean())**2)
    mse = float(np.mean((y_test - y_pred)**2))
    return {'r2': float(r2), 'mse': mse, 'rmse': float(np.sqrt(mse)),
            'mae': float(np.mean(np.abs(y_test - y_pred)))}


def train_model(X_train, y_train, X_test, y_test):
    """训练 + 评估。
    X_test/y_test 必须是模型**没见过的偏好组合**（按组合划分，不是把同一批数据随机切），
    否则同一"用户×菜品"的样本会同时进训练和测试，R² 虚高。
    """
    model = fit_model(X_train, y_train)
    metrics = evaluate(model, X_test, y_test)
    print(f'训练集: {len(X_train)} 条, 留出集(没见过的偏好组合): {len(X_test)} 条', file=sys.stderr)
    print(f"R²: {metrics['r2']:.4f}, MSE: {metrics['mse']:.6f}, RMSE: {metrics['rmse']:.4f}, MAE: {metrics['mae']:.4f}", file=sys.stderr)
    return model, metrics


# ═══════════════════════════════════════════════
# 5. 导出特征重要性
# ═══════════════════════════════════════════════
def export_feature_importance(model, X, y):
    """导出特征重要性JSON（HistGB 无原生 feature_importances_,改用置换重要性并归一化为相对占比）"""
    if len(X) > 50000:
        idx = np.random.RandomState(42).choice(len(X), 50000, replace=False)
        Xs, ys = X[idx], y[idx]
    else:
        Xs, ys = X, y
    perm = permutation_importance(model, Xs, ys, n_repeats=5, random_state=42)
    raw = np.maximum(perm.importances_mean, 0)
    total = raw.sum()
    result = [{'feature': FEATURE_NAMES[i], 'importance': round(float(raw[i] / total), 4) if total > 0 else 0.0}
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

    # 偏好组合全量 1600 种，按**组合**划分 80% 训练 / 20% 留出：
    # 留出集是模型没见过的组合，R² 才是真实泛化能力（不是把同一批数据随机切）
    split = len(USER_PROFILES) * 4 // 5
    train_profiles, holdout_profiles = USER_PROFILES[:split], USER_PROFILES[split:]

    print('正在生成训练数据...', file=sys.stderr)
    X, y = generate_training_data(dishes, train_profiles, samples_per_dish=1)
    X_ho, y_ho = generate_training_data(dishes, holdout_profiles, samples_per_dish=1)
    print(f'训练 {len(X)} 条（{len(train_profiles)} 种偏好组合）', file=sys.stderr)
    print(f'留出 {len(X_ho)} 条（{len(holdout_profiles)} 种模型没见过的组合）', file=sys.stderr)

    # 训练 + 诚实评估
    print('正在训练模型...', file=sys.stderr)
    model, metrics = train_model(X, y, X_ho, y_ho)

    # 上线用的模型：用**全量组合**再拟合一次，覆盖 UI 能产生的每一种偏好输入
    # （留出集只用于给出诚实指标；上线模型不该对 20% 的用户是盲区）
    print('用全量偏好组合重训上线模型...', file=sys.stderr)
    X_all = np.vstack([X, X_ho])
    y_all = np.concatenate([y, y_ho])
    model = fit_model(X_all, y_all)

    # 特征重要性
    importance = export_feature_importance(model, X_all, y_all)
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
            'training_samples': len(X_all),
            'feature_count': 12,
            'feature_names': FEATURE_NAMES
        }
    }
    model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'recommendation_model.pkl')  # 项目根(脚本已迁 ml/), worker 从根读
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
            'training_samples': len(X_all),
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
        'training_samples': len(X_all),
        'feature_count': 12,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()