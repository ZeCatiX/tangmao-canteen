# 弃用脚本

这些脚本是旧版 9 维特征格式的训练脚本，**已弃用**。运行它们会生成 9 维模型并覆盖当前 12 维模型（`recommendation_model.pkl`），导致 `predict_worker.py` 形状错误或静默失败。

## 唯一规范脚本

使用根目录的 `train_restaurant_model.py`（12 维，1600 种用户组合，对齐线上规则）。

## 防误运行守卫

每个弃用脚本顶部都加了守卫：直接运行会立即退出并提示。如确需运行（调试旧格式），加 `--allow-deprecated`：

```bash
python deprecated/train_ml_model.py --allow-deprecated
python deprecated/rgzn.py --allow-deprecated
```

| 脚本 | 维度 | 甜酸映射 | 用户组合 | 状态 |
|------|------|----------|----------|------|
| `train_restaurant_model.py`（根目录） | 12 | 无/无味/偏甜/偏酸/甜酸 | 1600 | ✅ 规范 |
| `train_ml_model.py` | 9 | 无/无味/微甜/酸甜/偏酸/偏甜 | 10 | ❌ 弃用 |
| `rgzn.py` | 9 | 同 train_ml_model | 10 | ❌ 弃用 |
