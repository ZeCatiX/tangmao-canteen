# -*- coding: utf-8 -*-
"""
推荐效果报告 —— 回答一个问题：ML 有没有打过规则匹配？

原理：feedback 表里每条记录都带「用户当时的偏好」和「实际评分」。
      拿这条偏好，分别算：
        · 规则分  = compute_score（与线上 computeDishMatch 同逻辑）
        · ML 分   = recommendation_model.pkl 的预测
      然后看**谁的分数与用户真实评分更相关**（Spearman 秩相关）。
      ML 相关性更高 = ML 赢了；规则更高 = ML 还不如规则。

输出 recommendation_effect.json（供后台仪表盘读取）。
样本少于 30 条时结论不可靠，会明确标注。
"""
import json, os, sys, pickle
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_restaurant_model import (encode_dish, compute_score, load_dishes_from_db,
                                    ORD_MAPPINGS, parse_tags)

MIN_SAMPLES = 30
OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'recommendation_effect.json')  # 项目根, server 从根读


def load_feedback_from_db():
    """取带偏好的反馈（与重训脚本同一口径：只认能关联到菜品的）"""
    import psycopg2
    conn = psycopg2.connect(host='localhost', port=5432, database='tangmao',
                            user='postgres', password=os.environ.get('PG_PASSWORD', ''))
    cur = conn.cursor()
    cur.execute('''
        SELECT f.dish_id, f.rating, f.user_preferences, f.created_at
        FROM feedback f JOIN dishes d ON f.dish_id = d.id
        WHERE f.user_preferences IS NOT NULL
          AND f.user_preferences != '{}'::jsonb
          AND f.dish_id > 0 AND d.is_active = TRUE
        ORDER BY f.created_at DESC
    ''')
    rows = cur.fetchall()
    conn.close()
    return rows


def prefs_to_user_pref(prefs):
    """把 feedback.user_preferences(前端英文/中文混合键) 归一成 encode_dish 要的键"""
    def pick(*keys, default='无'):
        for k in keys:
            v = prefs.get(k)
            if v:
                return v
        return default
    return {
        '辣度': pick('辣度', 'spiciness'),
        '咸淡': pick('咸淡', 'saltiness'),
        '甜酸': pick('甜酸', 'sweetness'),
        'calorie': pick('calorie', '热量'),
        '价格': pick('价格区间', 'price', '价格'),
    }


def spearman(a, b):
    ra = np.argsort(np.argsort(np.asarray(a, dtype=float))).astype(float)
    rb = np.argsort(np.argsort(np.asarray(b, dtype=float))).astype(float)
    ra -= ra.mean(); rb -= rb.mean()
    den = np.sqrt((ra ** 2).sum() * (rb ** 2).sum())
    return float((ra * rb).sum() / den) if den else 0.0


def main():
    report = {
        'generated_at': __import__('datetime').datetime.now().isoformat(),
        'sample_size': 0, 'rule': None, 'ml': None,
        'verdict': 'insufficient',
        'note': f'样本不足 {MIN_SAMPLES} 条，结论不可靠 —— 先攒真实用户评分',
    }
    try:
        dishes = load_dishes_from_db()
        by_id = {d[0]: d for d in dishes}

        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'recommendation_model.pkl'), 'rb') as f:
            model = pickle.load(f)['model']

        rows = load_feedback_from_db()
        actual, rule_scores, ml_scores = [], [], []
        for dish_id, rating, prefs, _ts in rows:
            dish = by_id.get(dish_id)
            if not dish or rating is None:
                continue
            user_pref = prefs_to_user_pref(prefs if isinstance(prefs, dict) else {})
            try:
                X, _name, is_sig, price_val, rating_val, category = encode_dish(dish, user_pref)
            except Exception:
                continue
            rule = compute_score(X, is_sig, price_val, rating_val, category)   # 规则分(0.1~1.0)
            ml = float(model.predict([X])[0])                                   # ML 分(同量纲)
            actual.append(float(rating) / 5.0)     # 真实评分也归一到 0~1，便于比较
            rule_scores.append(float(rule))
            ml_scores.append(ml)

        n = len(actual)
        report['sample_size'] = n
        if n < MIN_SAMPLES:
            return report

        report['rule'] = {
            'spearman': round(spearman(rule_scores, actual), 4),
            'mae': round(float(np.mean(np.abs(np.array(rule_scores) - np.array(actual)))), 4),
        }
        report['ml'] = {
            'spearman': round(spearman(ml_scores, actual), 4),
            'mae': round(float(np.mean(np.abs(np.array(ml_scores) - np.array(actual)))), 4),
        }
        diff = report['ml']['spearman'] - report['rule']['spearman']
        if abs(diff) < 0.05:
            report['verdict'] = 'tie'
            report['note'] = f'两者相关性接近（差 {diff:+.3f}），ML 还没有明显优势'
        elif diff > 0:
            report['verdict'] = 'ml'
            report['note'] = f'ML 相关性高 {diff:+.3f} —— 真实数据里学到了规则没编码的东西'
        else:
            report['verdict'] = 'rule'
            report['note'] = f'规则相关性高 {-diff:+.3f} —— ML 目前还不如规则，继续攒反馈再训'
        # 小样本下相关系数本身波动很大，差异 0.05 的门槛挡不住噪声，必须提示
        if n < 100:
            report['caveat'] = f'样本仅 {n} 条，相关系数波动大，结论仅供参考（建议 ≥100 条再定论）'
    except Exception as e:
        report['note'] = f'生成失败: {e}'
    return report


if __name__ == '__main__':
    r = main()
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(r, f, ensure_ascii=False, indent=2)
    print(json.dumps(r, ensure_ascii=False))
