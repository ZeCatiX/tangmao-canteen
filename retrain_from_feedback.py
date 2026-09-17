# -*- coding: utf-8 -*-
"""
唐猫庭院 - 从真实反馈数据增量训练模型
从PostgreSQL读取feedback表，结合真实反馈微调模型
"""
import pickle, json, sys, os, random
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
sys.stdout.reconfigure(encoding='utf-8')

ORD_MAPPINGS = {
    '辣度': {'无': 0, '不辣': 1, '微辣': 2, '中辣': 3, '重辣': 4},
    '咸淡': {'无': 0, '清淡': 1, '适中': 2, '偏咸': 3},
    '甜酸': {'无': 0, '无味': 1, '偏甜': 2, '偏酸': 3, '甜酸': 4},
    '热量': {'无': 0, '低': 1, '中': 2, '高': 3},
    '价格区间': {'经济': 1, '适中': 2, '品质': 3, '无': 0},
}
FEATURE_NAMES = ['辣度', '咸淡', '甜酸', '热量', '价格', '招牌', '评分',
                 '用户辣度', '用户咸淡', '用户甜酸', '用户价格', '用户热量']

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'recommendation_model.pkl')


def load_feedback_from_db():
    """从PostgreSQL加载真实反馈数据"""
    import psycopg2
    conn = psycopg2.connect(
        host='localhost', port=5432, database='tangmao',
        user='postgres', password=os.environ.get('PG_PASSWORD', '')
    )
    cur = conn.cursor()
    # 获取有user_preferences的反馈，同时关联菜品数据
    cur.execute('''
        SELECT f.dish_id, f.rating, f.user_preferences, f.created_at,
               d.spiciness, d.saltiness, d.sweetness, d.price, d.rating as dish_rating, d.tags, d.calorie
        FROM feedback f
        JOIN dishes d ON f.dish_id = d.id
        WHERE f.user_preferences IS NOT NULL
          AND f.user_preferences != '{}'::jsonb
        ORDER BY f.created_at DESC
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


def encode_feedback(fb_row):
    """将一条反馈数据编码为11维特征 + 目标值（特征顺序/映射须与线上模型 train_restaurant_model.py 的 encode_dish 严格一致）"""
    dish_id, rating, user_prefs, created_at, spiciness, saltiness, sweetness, price, dish_rating, tags, calorie = fb_row
    tags_list = parse_tags(tags)
    is_sig = 1.0 if '招牌' in tags_list else 0.0
    price_val = float(price) if price and float(price) > 0 else 20.0
    dish_rating_val = float(dish_rating) if dish_rating and float(dish_rating) > 0 else 3.5  # 与 serve 侧一致（见 server.js loadDishData）
    cal_val = calorie if calorie else '中'

    # 解析user_preferences JSON
    if isinstance(user_prefs, str):
        import json as j
        prefs = j.loads(user_prefs)
    else:
        prefs = user_prefs

    X = np.zeros(12)
    X[0] = ORD_MAPPINGS['辣度'].get(spiciness, 1)
    X[1] = ORD_MAPPINGS['咸淡'].get(saltiness, 1)
    X[2] = ORD_MAPPINGS['甜酸'].get(sweetness, 1)
    X[3] = ORD_MAPPINGS['热量'].get(cal_val, 2)
    X[4] = price_val / 100
    X[5] = is_sig
    X[6] = dish_rating_val / 5

    # 用户偏好（从user_preferences中提取）
    user_spice = prefs.get('spiciness') or prefs.get('辣度', '无')
    user_salty = prefs.get('saltiness') or prefs.get('咸淡', '无')
    user_sweet = prefs.get('sweetness') or prefs.get('甜酸', '无')
    user_price = prefs.get('价格区间') or prefs.get('price') or prefs.get('价格', '无')
    user_cal = prefs.get('calorie') or prefs.get('热量', '无')
    X[7] = ORD_MAPPINGS['辣度'].get(user_spice, 1)
    X[8] = ORD_MAPPINGS['咸淡'].get(user_salty, 1)
    X[9] = ORD_MAPPINGS['甜酸'].get(user_sweet, 1)
    X[10] = ORD_MAPPINGS['价格区间'].get(user_price, 0)
    X[11] = ORD_MAPPINGS['热量'].get(user_cal, 0)

    # 目标值：评分映射到0.1~1.0
    y = max(0.1, min(1.0, float(rating) / 5))
    return X, y


def main():
    print('加载现有模型...', file=sys.stderr)
    try:
        with open(MODEL_PATH, 'rb') as f:
            model_data = pickle.load(f)
        model = model_data['model']
        print(f'  现有模型: {type(model).__name__}, {model.n_features_in_}维', file=sys.stderr)
    except FileNotFoundError:
        print('  未找到现有模型，创建新模型', file=sys.stderr)
        model = HistGradientBoostingRegressor(random_state=42)  # 与 train_restaurant_model.py fit_model 对齐（2026-09-17 迁移 HistGB）
        model_data = {'model': model, 'ohe': None, 'le_dict': {}, 'scaler': None}

    # 加载真实反馈
    print('加载真实反馈数据...', file=sys.stderr)
    feedbacks = load_feedback_from_db()
    print(f'  找到 {len(feedbacks)} 条有偏好的反馈', file=sys.stderr)

    if len(feedbacks) == 0:
        print('没有可用的反馈数据，退出', file=sys.stderr)
        return

    # 编码反馈数据
    X_fb, y_fb = [], []
    for fb in feedbacks:
        try:
            X, y = encode_feedback(fb)
            X_fb.append(X)
            y_fb.append(y)
        except Exception as e:
            print(f'  编码失败: {e}', file=sys.stderr)

    X_fb = np.array(X_fb)
    y_fb = np.array(y_fb)
    print(f'  编码 {len(X_fb)} 条有效反馈', file=sys.stderr)

    # 用真实反馈数据微调模型
    # 方法：用现有模型预测作为基础，结合真实反馈做增量训练
    if hasattr(model, 'predict'):
        y_pred_base = model.predict(X_fb)
        errors = np.abs(y_fb - y_pred_base)
        print(f'  当前模型在反馈数据上的平均误差: {np.mean(errors):.4f}', file=sys.stderr)

    # 合并训练：生成合成数据 + 真实反馈数据
    from train_restaurant_model import generate_training_data, load_dishes_from_db, USER_PROFILES

    dishes = load_dishes_from_db()
    X_syn, y_syn = generate_training_data(dishes, USER_PROFILES, samples_per_dish=1)

    # 将真实反馈数据附加到合成数据中
    # 原式只保证「反馈总量≈合成数据的10%」，反馈只有几条时会把每行复制成百上千份，
    # 导致单条反馈就能带偏模型（刚上线/反馈稀少时尤其严重）。加每行上限：
    # 反馈影响力随证据量增长，条数少时自然只占小权重。
    REPEAT_CAP = 10
    repeat_factor = min(max(1, len(X_syn) // (len(X_fb) * 10)), REPEAT_CAP)
    X_fb_weighted = np.repeat(X_fb, repeat_factor, axis=0)
    y_fb_weighted = np.repeat(y_fb, repeat_factor, axis=0)

    X_combined = np.vstack([X_syn, X_fb_weighted])
    y_combined = np.concatenate([y_syn, y_fb_weighted])

    print(f'\n合并训练数据: {len(X_combined)} 条', file=sys.stderr)
    print(f'  合成数据: {len(X_syn)} 条', file=sys.stderr)
    print(f'  真实反馈(加权): {len(X_fb_weighted)} 条 (原始{len(X_fb)}条×{repeat_factor}倍)', file=sys.stderr)

    # 重新训练
    model.fit(X_combined, y_combined)

    # 评估
    y_pred = model.predict(X_fb)
    ss_tot = np.sum((y_fb - y_fb.mean())**2)
    # 反馈样本过少或评分全相同时 ss_tot=0，除法会得 -inf 污染指标；此时 R² 无意义，记 0
    r2 = (1 - np.sum((y_fb - y_pred)**2) / ss_tot) if ss_tot > 1e-12 else 0.0
    mse = np.mean((y_fb - y_pred)**2)
    print(f'\n微调后在反馈数据上的表现:', file=sys.stderr)
    print(f'  R²: {r2:.4f}, MSE: {mse:.6f}', file=sys.stderr)

    # 更新模型数据
    model_data['model'] = model
    model_data['metrics'] = {
        'r2': float(r2), 'mse': float(mse),
        'rmse': float(np.sqrt(mse)),
        'mae': float(np.mean(np.abs(y_fb - y_pred))),
        'real_feedback_count': len(feedbacks),
        'training_samples': len(X_combined),
        'feature_count': 12,
        'feature_names': FEATURE_NAMES,
    }

    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(model_data, f)
    print(f'\n模型已更新: {MODEL_PATH}', file=sys.stderr)
    print(f'  真实反馈数: {len(feedbacks)}', file=sys.stderr)

    # 输出特征重要性
    imp = model.feature_importances_
    importance = [{'feature': FEATURE_NAMES[i], 'importance': round(float(imp[i]), 4)}
                  for i in range(len(FEATURE_NAMES))]
    importance.sort(key=lambda x: -x['importance'])

    # 用「另一批全新模拟用户」给模型打诚实的分，并同步 metrics/重要性文件
    # （反馈只有几条时，在反馈上算 R² 毫无意义；口径与 train_restaurant_model 一致。
    #   另外：管理后台读的就是这两个文件，以前没人写 → 页面一直显示旧模型的数字）
    try:
        from train_restaurant_model import make_user_profiles
        import datetime
        _test = make_user_profiles(200, seed=777)
        X_te, y_te = generate_training_data(dishes, _test, samples_per_dish=1)
        yp_te = model.predict(X_te)
        _r2 = 1 - np.sum((y_te - yp_te) ** 2) / np.sum((y_te - y_te.mean()) ** 2)
        _mse = float(np.mean((y_te - yp_te) ** 2))
        _dir = os.path.dirname(__file__)
        with open(os.path.join(_dir, 'model_metrics.json'), 'w', encoding='utf-8') as f:
            json.dump({
                'r2': float(_r2), 'mse': _mse, 'rmse': float(np.sqrt(_mse)),
                'mae': float(np.mean(np.abs(y_te - yp_te))),
                'feature_count': 12,
                'training_samples': len(X_combined),
                'real_feedback_count': len(feedbacks),
                'trained_at': datetime.datetime.now().isoformat(),
            }, f, ensure_ascii=False, indent=2)
        with open(os.path.join(_dir, 'feature_importance.json'), 'w', encoding='utf-8') as f:
            json.dump({'success': True, 'importance': importance}, f, ensure_ascii=False, indent=2)
        print(f'  诚实 R²(全新模拟用户 200 人): {_r2:.4f}', file=sys.stderr)
        print('  已同步 model_metrics.json / feature_importance.json', file=sys.stderr)
    except Exception as e:
        print(f'  同步 metrics 文件失败: {e}', file=sys.stderr)

    print(json.dumps({'success': True, 'importance': importance}, ensure_ascii=False))


if __name__ == '__main__':
    main()