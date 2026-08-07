# -*- coding: utf-8 -*-
"""
轻量级模型评估指标获取脚本
"""
import sys
import os
import json

def get_metrics():
    """获取模型评估指标"""
    # 首先尝试加载轻量级的JSON文件
    if os.path.exists('model_metrics.json'):
        try:
            with open('model_metrics.json', 'r', encoding='utf-8') as f:
                metrics = json.load(f)
            print(json.dumps(metrics, ensure_ascii=False))
            return
        except Exception as e:
            print(f"[警告] 加载JSON失败: {e}", file=sys.stderr)

    # 如果JSON文件不存在或加载失败，尝试从完整的pickle文件加载
    try:
        import pickle
        with open('recommendation_model.pkl', 'rb') as f:
            model_data = pickle.load(f)

        if 'metrics' in model_data:
            metrics = model_data['metrics']
            print(json.dumps(metrics, ensure_ascii=False))
            return

    except Exception as e:
        print(f"[错误] 加载模型失败: {e}", file=sys.stderr)

    print(json.dumps({'error': 'No metrics available', 'mse': 0, 'rmse': 0, 'mae': 0, 'r2': 0}))

if __name__ == '__main__':
    get_metrics()