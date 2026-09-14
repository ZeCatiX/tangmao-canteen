# -*- coding: utf-8 -*-
"""
基于决策树的校园食堂菜品推荐系统（MVP核心引擎）
严格依据《人工智能课程研讨汇报》第2组文档实现
作者：第二组算法负责人（按文档规范交付）
"""

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, plot_tree
from sklearn.preprocessing import OneHotEncoder, LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.inspection import permutation_importance
import matplotlib.pyplot as plt
import seaborn as sns
import hashlib
import json
import time
import os
import pickle

# 设置 matplotlib 中文支持
plt.rcParams['font.sans-serif'] = ['SimHei']  # 使用黑体
plt.rcParams['axes.unicode_minus'] = False  # 解决负号显示问题

# ——————————————————————————————
# 数据和模型缓存
# ——————————————————————————————

def generate_menu_data(force_regenerate=False):
    """生成或加载菜单数据"""
    if not force_regenerate and os.path.exists('menu_data.pkl'):
        try:
            with open('menu_data.pkl', 'rb') as f:
                print("[加载数据] 从缓存加载菜单数据...")
                return pickle.load(f)
        except:
            pass
    
    # 尝试从新食堂数据_修正版.xlsx加载数据
    if os.path.exists('新食堂数据_修正版.xlsx'):
        try:
            print("[加载数据] 从新食堂数据_修正版.xlsx加载数据...")
            df = pd.read_excel('新食堂数据_修正版.xlsx')
            print(f"[加载数据] 成功加载{len(df)}条新食堂菜品数据")
            
            # 处理列名中的空格
            df.columns = df.columns.str.strip()
            
            # 重命名列名，确保与代码中的列名一致
            if '价格_元' not in df.columns and '价格' in df.columns:
                df.rename(columns={'价格': '价格_元'}, inplace=True)
            
            # 修正明显不合理的辣度标记
            print("[修正数据] 修正不合理的辣度标记...")
            # 定义不应该辣的菜品关键词
            non_spicy_keywords = ['馒头', '粥', '花卷', '包子', '面包', '蛋糕', '油条', '面条', '馄饨', '饺子', '米饭', '汤', '羹', '汁', '糕', '窝窝头']
            # 修正逻辑
            corrected_count = 0
            for i, row in df.iterrows():
                dish_name = row['菜品ID']
                spiciness = row['辣度']
                # 检查是否包含不应该辣的关键词
                is_non_spicy = any(keyword in dish_name for keyword in non_spicy_keywords)
                # 检查是否标记为辣
                is_marked_spicy = spiciness in ['微辣', '中辣', '重辣']
                if is_non_spicy and is_marked_spicy:
                    df.at[i, '辣度'] = '不辣'
                    corrected_count += 1
            if corrected_count > 0:
                print(f"[修正数据] 已修正{corrected_count}条不合理的辣度标记")
            
            # 修正蛋白质异常低的菜品
            print("[修正数据] 修正不合理的蛋白质含量...")
            protein_corrected_count = 0
            for i, row in df.iterrows():
                protein = row['蛋白质_g']
                # 蛋白质含量为0g不符合常识，设置为合理的最小值
                if protein < 1:
                    # 根据菜品类型设置不同的蛋白质最小值
                    dish_name = row['菜品ID']
                    # 蔬菜类菜品
                    vegetable_keywords = ['菜', '瓜', '豆', '菇', '笋', '苔', '苋', '菠菜', '白菜', '青菜', '萝卜', '土豆']
                    staple_keywords = ['饭', '面', '粉', '馒头', '包子', '花卷', '饺子', '馄饨', '粥', '饼']
                    meat_keywords = ['肉', '鸡', '鸭', '鱼', '虾', '牛', '羊', '猪']
                    if any(keyword in dish_name for keyword in vegetable_keywords):
                        df.at[i, '蛋白质_g'] = 1.0  # 蔬菜类至少1g蛋白质
                    elif any(keyword in dish_name for keyword in staple_keywords):
                        df.at[i, '蛋白质_g'] = 2.0  # 主食类至少2g蛋白质
                    elif any(keyword in dish_name for keyword in meat_keywords):
                        df.at[i, '蛋白质_g'] = 5.0  # 肉类至少5g蛋白质
                    else:
                        df.at[i, '蛋白质_g'] = 1.0  # 其他菜品至少1g蛋白质
                    protein_corrected_count += 1
            if protein_corrected_count > 0:
                print(f"[修正数据] 已修正{protein_corrected_count}条不合理的蛋白质含量")
            
            # 修正热量异常的情况
            print("[修正数据] 检查热量值合理性...")
            calorie_corrected_count = 0
            for i, row in df.iterrows():
                calorie = row['热量_kcal']
                # 热量过低或过高的情况
                if calorie < 50:
                    df.at[i, '热量_kcal'] = 50  # 设置最低热量为50kcal
                    calorie_corrected_count += 1
                elif calorie > 500:
                    df.at[i, '热量_kcal'] = 500  # 设置最高热量为500kcal
                    calorie_corrected_count += 1
            if calorie_corrected_count > 0:
                print(f"[修正数据] 已修正{calorie_corrected_count}条不合理的热量值")
            
            # 修正宗教和过敏源标记
            print("[修正数据] 修正不合理的宗教和过敏源标记...")
            religion_corrected_count = 0
            for i, row in df.iterrows():
                dish_name = row['菜品ID']
                
                # 检查素食标记
                if row['宗教_素食'] == 1 or row['饮食_宗教'] == '素食':
                    # 检查是否含肉类关键词
                    meat_keywords = ['肉', '鱼', '虾', '鸡', '鸭', '牛', '羊', '猪']
                    if any(keyword in dish_name for keyword in meat_keywords):
                        df.at[i, '宗教_素食'] = 0
                        if df.at[i, '饮食_宗教'] == '素食':
                            df.at[i, '饮食_宗教'] = '无特殊要求'
                        religion_corrected_count += 1
                
                # 检查清真标记
                if row['宗教_清真'] == 1 or row['饮食_宗教'] == '清真':
                    # 检查是否含猪肉关键词
                    pork_keywords = ['猪', '猪肉', '猪蹄', '猪头', '猪排', '猪肝']
                    if any(keyword in dish_name for keyword in pork_keywords):
                        df.at[i, '宗教_清真'] = 0
                        if df.at[i, '饮食_宗教'] == '清真':
                            df.at[i, '饮食_宗教'] = '无特殊要求'
                        religion_corrected_count += 1
                
                # 检查无猪肉标记
                if row['宗教_无猪肉'] == 1:
                    # 检查是否含猪肉关键词
                    pork_keywords = ['猪', '猪肉', '猪蹄', '猪头', '猪排', '猪肝']
                    if any(keyword in dish_name for keyword in pork_keywords):
                        df.at[i, '宗教_无猪肉'] = 0
                        religion_corrected_count += 1
            if religion_corrected_count > 0:
                print(f"[修正数据] 已修正{religion_corrected_count}条不合理的宗教和过敏源标记")
            
            # 修正咸淡和甜酸标记
            print("[修正数据] 修正不合理的咸淡和甜酸标记...")
            taste_corrected_count = 0
            for i, row in df.iterrows():
                dish_name = row['菜品ID']
                
                # 修正甜酸标记
                # 甜味应该主要用于甜点、饮料等
                sweet_keywords = ['糖', '甜', '蜜', '冰淇淋', '蛋糕', '饼干', '巧克力', '布丁', '糖水', '甜汤']
                # 酸味应该主要用于酸辣、酸菜等
                sour_keywords = ['酸', '醋', '酸菜', '酸辣', '酸汤']
                # 酸甜应该主要用于糖醋等
                sweet_sour_keywords = ['糖醋', '酸甜', '荔枝', '梅子']
                
                # 修正甜酸
                current_sweet_sour = row['甜酸']
                new_sweet_sour = current_sweet_sour
                
                # 检查是否应该是甜味
                if any(keyword in dish_name for keyword in sweet_keywords):
                    new_sweet_sour = '甜味'
                # 检查是否应该是酸味
                elif any(keyword in dish_name for keyword in sour_keywords):
                    new_sweet_sour = '酸味'
                # 检查是否应该是酸甜
                elif any(keyword in dish_name for keyword in sweet_sour_keywords):
                    new_sweet_sour = '酸甜'
                # 其他菜品默认无味
                else:
                    new_sweet_sour = '无味'
                
                if new_sweet_sour != current_sweet_sour:
                    df.at[i, '甜酸'] = new_sweet_sour
                    taste_corrected_count += 1
                
                # 修正咸淡标记
                # 清淡应该主要用于汤、蔬菜等
                light_keywords = ['汤', '蔬菜', '清炒', '白灼', '清蒸', '水煮']
                # 偏咸应该主要用于卤味、咸菜等
                salty_keywords = ['卤', '咸菜', '咸鱼', '腊肉', '腌肉']
                
                # 修正咸淡
                current_salty = row['咸淡']
                new_salty = current_salty
                
                # 检查是否应该是清淡
                if any(keyword in dish_name for keyword in light_keywords):
                    new_salty = '清淡'
                # 检查是否应该是偏咸
                elif any(keyword in dish_name for keyword in salty_keywords):
                    new_salty = '偏咸'
                # 其他菜品默认适中
                else:
                    new_salty = '适中'
                
                if new_salty != current_salty:
                    df.at[i, '咸淡'] = new_salty
                    taste_corrected_count += 1
            if taste_corrected_count > 0:
                print(f"[修正数据] 已修正{taste_corrected_count}条不合理的咸淡和甜酸标记")
            
            # 检查是否缺少必要的列
            required_columns = ['菜品ID', '辣度', '咸淡', '甜酸', '热量_kcal', '蛋白质_g', 
                              '蔬菜占比', '价格_元', '过敏源_海鲜', '过敏源_花生', '过敏源_鸡蛋', 
                              '过敏源_麸质', '过敏源_大豆', '宗教_清真', '宗教_素食', '宗教_无猪肉', '评分']
            
            # 检查是否缺少菜系列，如果缺少则添加
            has_cuisine_data = False
            if '菜系' not in df.columns:
                print("[警告] 新食堂数据缺少'菜系'列，添加默认菜系")
                df['菜系'] = '食堂菜'
                has_cuisine_data = False
            else:
                # 检查是否有实际的菜系数据
                unique_cuisines = df['菜系'].unique()
                if len(unique_cuisines) > 1 or (len(unique_cuisines) == 1 and unique_cuisines[0] != '食堂菜'):
                    has_cuisine_data = True
                    print(f"[加载数据] 检测到{len(unique_cuisines)}种不同的菜系")
                else:
                    has_cuisine_data = False
                    print("[警告] 菜系列数据单一，不使用菜系推荐功能")
            
            # 添加标志列，指示是否有实际的菜系数据
            df['has_cuisine_data'] = has_cuisine_data
            
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                print(f"[警告] 缺少必要的列: {missing_columns}")
            else:
                # 保存数据到缓存
                with open('menu_data.pkl', 'wb') as f:
                    pickle.dump(df, f)
                print("[保存数据] 新食堂菜单数据已缓存")
                return df
        except Exception as e:
            print(f"[加载数据] 新食堂数据_修正版.xlsx加载失败: {e}")
    
    # 尝试从修正后的meituan_chengdu_dishes_fixed.csv加载数据
    if os.path.exists('meituan_chengdu_dishes_fixed.csv'):
        try:
            print("[加载数据] 从修正后的meituan_chengdu_dishes_fixed.csv加载数据...")
            df = pd.read_csv('meituan_chengdu_dishes_fixed.csv', encoding='utf-8-sig')
            print(f"[加载数据] 成功加载{len(df)}条修正后的菜品数据")
            
            # 检查是否缺少必要的列
            required_columns = ['菜品ID', '菜系', '辣度', '咸淡', '甜酸', '热量_kcal', '蛋白质_g', 
                              '蔬菜占比', '价格_元', '过敏源_海鲜', '过敏源_花生', '过敏源_鸡蛋', 
                              '过敏源_麸质', '过敏源_大豆', '宗教_清真', '宗教_素食', '宗教_无猪肉', '评分']
            
            # 检查是否有实际的菜系数据
            has_cuisine_data = False
            if '菜系' in df.columns:
                unique_cuisines = df['菜系'].unique()
                if len(unique_cuisines) > 1 or (len(unique_cuisines) == 1 and unique_cuisines[0] != '食堂菜'):
                    has_cuisine_data = True
                    print(f"[加载数据] 检测到{len(unique_cuisines)}种不同的菜系")
                else:
                    has_cuisine_data = False
                    print("[警告] 菜系列数据单一，不使用菜系推荐功能")
            else:
                has_cuisine_data = False
                print("[警告] 数据缺少'菜系'列，不使用菜系推荐功能")
            
            # 添加标志列，指示是否有实际的菜系数据
            df['has_cuisine_data'] = has_cuisine_data
            
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                print(f"[警告] 缺少必要的列: {missing_columns}")
            else:
                # 保存数据到缓存
                with open('menu_data.pkl', 'wb') as f:
                    pickle.dump(df, f)
                print("[保存数据] 修正后的菜单数据已缓存")
                return df
        except Exception as e:
            print(f"[加载数据] 修正后的CSV文件加载失败: {e}")
    
    # 尝试从原meituan_chengdu_dishes.csv加载数据
    if os.path.exists('meituan_chengdu_dishes.csv'):
        try:
            print("[加载数据] 从原meituan_chengdu_dishes.csv加载数据...")
            df = pd.read_csv('meituan_chengdu_dishes.csv', encoding='utf-8-sig')
            print(f"[加载数据] 成功加载{len(df)}条菜品数据")
            
            # 检查是否缺少必要的列
            required_columns = ['菜品ID', '菜系', '辣度', '咸淡', '甜酸', '热量_kcal', '蛋白质_g', 
                              '蔬菜占比', '价格_元', '过敏源_海鲜', '过敏源_花生', '过敏源_鸡蛋', 
                              '过敏源_麸质', '过敏源_大豆', '宗教_清真', '宗教_素食', '宗教_无猪肉', '评分']
            
            # 检查是否有实际的菜系数据
            has_cuisine_data = False
            if '菜系' in df.columns:
                unique_cuisines = df['菜系'].unique()
                if len(unique_cuisines) > 1 or (len(unique_cuisines) == 1 and unique_cuisines[0] != '食堂菜'):
                    has_cuisine_data = True
                    print(f"[加载数据] 检测到{len(unique_cuisines)}种不同的菜系")
                else:
                    has_cuisine_data = False
                    print("[警告] 菜系列数据单一，不使用菜系推荐功能")
            else:
                has_cuisine_data = False
                print("[警告] 数据缺少'菜系'列，不使用菜系推荐功能")
            
            # 添加标志列，指示是否有实际的菜系数据
            df['has_cuisine_data'] = has_cuisine_data
            
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                print(f"[警告] 缺少必要的列: {missing_columns}")
            else:
                # 保存数据到缓存
                with open('menu_data.pkl', 'wb') as f:
                    pickle.dump(df, f)
                print("[保存数据] 菜单数据已缓存")
                return df
        except Exception as e:
            print(f"[错误] 加载meituan_chengdu_dishes.csv失败: {e}")
    
    # 如果加载失败，使用原来的随机生成逻辑
    print("[生成数据] 生成菜单数据...")
    # 基于文档P.12功能模块及P.16输出需求，构建12道典型菜品（含真实营养值与属性）
    np.random.seed(42)
    n_samples = 500
    data = {
        '菜品ID': [f'D{i:03d}' for i in range(1, n_samples+1)],
        '菜系': np.random.choice(['川菜','粤菜','湘菜','鲁菜','浙菜','苏菜'], n_samples),
        '辣度': np.random.choice(['不辣','微辣','中辣','重辣'], n_samples, p=[0.2,0.3,0.3,0.2]),
        '咸淡': np.random.choice(['清淡','适中','偏咸'], n_samples, p=[0.3,0.4,0.3]),
        '甜酸': np.random.choice(['甜味','酸味','酸甜'], n_samples, p=[0.4,0.3,0.3]),
        '热量_kcal': np.random.normal(450, 120, n_samples).astype(int),
        '蛋白质_g': np.random.normal(22, 8, n_samples).astype(int),
        '蔬菜占比': np.random.choice(['少菜','适量','多蔬菜'], n_samples, p=[0.25,0.5,0.25]),
        '价格_元': np.random.normal(15, 4, n_samples).astype(int),
        '过敏源_海鲜': (np.random.rand(n_samples) > 0.7).astype(int),
        '过敏源_花生': (np.random.rand(n_samples) > 0.8).astype(int),
        '过敏源_鸡蛋': (np.random.rand(n_samples) > 0.75).astype(int),
        '过敏源_麸质': (np.random.rand(n_samples) > 0.6).astype(int),
        '过敏源_大豆': (np.random.rand(n_samples) > 0.85).astype(int),
        '宗教_清真': (np.random.rand(n_samples) > 0.9).astype(int),
        '宗教_素食': (np.random.rand(n_samples) > 0.88).astype(int),
        '宗教_无猪肉': (np.random.rand(n_samples) > 0.92).astype(int),
        '评分': np.random.beta(5, 2, n_samples) * 5  # 1-5分
    }
    df = pd.DataFrame(data)
    
    # 随机生成的数据有多种菜系，设置has_cuisine_data为True
    df['has_cuisine_data'] = True
    print("[加载数据] 生成的数据包含多种菜系，使用菜系推荐功能")

    # 【补充】根据数值特征生成分类特征（与user_profile结构对应）
    # 营养_热量分类
    def classify_calories(kcal):
        if kcal < 350: return '低卡'
        elif kcal < 550: return '适中'
        else: return '高能量'

    # 营养_蛋白分类  
    def classify_protein(protein):
        if protein < 15: return '低脂'
        elif protein < 30: return '高蛋白'
        else: return '均衡'

    # 价格区间分类
    def classify_price(price):
        if price < 12: return '经济型（<12元）'
        elif price < 20: return '标准型（12-20元）'
        else: return '品质型（20元以上）'

    # 宗教分类（从二进制列合并）
    def classify_religion(row):
        if row['宗教_清真'] == 1: return '清真'
        elif row['宗教_素食'] == 1: return '素食'
        elif row['宗教_无猪肉'] == 1: return '无猪肉'
        else: return '无特殊要求'

    df['营养_热量'] = df['热量_kcal'].apply(classify_calories)
    df['营养_蛋白'] = df['蛋白质_g'].apply(classify_protein)
    df['营养_蔬菜'] = df['蔬菜占比']  # 直接复用
    df['价格区间'] = df['价格_元'].apply(classify_price)
    df['饮食_宗教'] = df.apply(classify_religion, axis=1)

    # 【文档P.13】添加目标变量：喜欢度（模拟历史订单点击/好评）
    # 构造逻辑：高评分 + 符合偏好 → 更高喜欢度（0-5分）
    def simulate_user_preference(row):
        score = row['评分']
        # 偏好匹配加分项（简化版，实际可用规则引擎）
        match_score = 0
        if row['辣度'] in ['中辣','重辣']: match_score += 1
        if row['咸淡'] == '适中': match_score += 1
        if row['甜酸'] in ['酸味','酸甜']: match_score += 1
        if row['菜系'] == '川菜': match_score += 2
        if row['蛋白质_g'] >= 20: match_score += 1
        if row['蔬菜占比'] == '多蔬菜': match_score += 1
        if 12 <= row['价格_元'] <= 25: match_score += 1
        # 综合得分 → 0-5分喜欢度
        total = score * 2 + match_score
        # 将总分映射到0-5分范围
        like_score = min(5, max(0, total / 4))
        return round(like_score, 1)

    df['喜欢度'] = df.apply(simulate_user_preference, axis=1)
    
    # 保存数据
    with open('menu_data.pkl', 'wb') as f:
        pickle.dump(df, f)
    print("[保存数据] 菜单数据已缓存")
    
    return df

def train_model(df, force_retrain=False):
    """训练或加载模型"""
    if not force_retrain and os.path.exists('recommendation_model.pkl'):
        try:
            with open('recommendation_model.pkl', 'rb') as f:
                print("[加载模型] 从缓存加载推荐模型...")
                model_data = pickle.load(f)
                # 检查是否包含测试数据
                if 'X_test' in model_data and 'y_test' in model_data:
                    return model_data['model'], model_data['ohe'], model_data['le_dict'], model_data['scaler'], model_data['X_test'], model_data['y_test']
                else:
                    # 如果没有测试数据，重新训练
                    print("[加载模型] 缓存中缺少测试数据，重新训练...")
        except:
            pass
    
    print("[训练模型] 开始训练推荐模型...")
    
    # 检查是否有实际的菜系数据
    has_cuisine_data = df.get('has_cuisine_data', False).any()
    print(f"[训练模型] 检测到{'有' if has_cuisine_data else '无'}实际的菜系数据")
    
    # 特征列定义（对应文档P.12输入维度）
    if has_cuisine_data:
        feature_cols = [
            '菜系', '辣度', '咸淡', '甜酸', '营养_热量', '营养_蛋白', '营养_蔬菜',
            '饮食_过敏源', '饮食_宗教', '价格区间', '热量_kcal', '蛋白质_g', '价格_元'
        ]
        # 只包含可以One-Hot编码的分类特征
        cat_cols_ohe = ['菜系', '饮食_宗教']
    else:
        feature_cols = [
            '辣度', '咸淡', '甜酸', '营养_热量', '营养_蛋白', '营养_蔬菜',
            '饮食_过敏源', '饮食_宗教', '价格区间', '热量_kcal', '蛋白质_g', '价格_元'
        ]
        # 只包含可以One-Hot编码的分类特征（不包含菜系）
        cat_cols_ohe = ['饮食_宗教']
    
    # 注意：过敏源和宗教在原始df中已展开为二进制列，此处仅保留原始逻辑结构

    # Step 1: One-Hot编码（离散无序特征）
    ohe = OneHotEncoder(drop='first', sparse_output=False, handle_unknown='ignore')

    # Step 2: 标签编码（有序离散特征）
    le_dict = {}
    ord_cols = ['辣度', '咸淡', '甜酸', '营养_热量', '营养_蛋白', '营养_蔬菜', '价格区间']
    for col in ord_cols:
        le = LabelEncoder()
        # 按文档顺序定义类别（确保编码一致）
        if col == '辣度': classes = ['不辣','微辣','中辣','重辣']
        elif col == '咸淡': classes = ['清淡','适中','偏咸']
        elif col == '甜酸': classes = ['甜味','酸味','酸甜']
        elif col == '营养_热量': classes = ['低卡','适中','高能量']
        elif col == '营养_蛋白': classes = ['低脂','高蛋白','均衡']
        elif col == '营养_蔬菜': classes = ['少菜','适量','多蔬菜']
        elif col == '价格区间': classes = ['经济型（<12元）','标准型（12-20元）','品质型（20元以上）']
        le.fit(classes)
        le_dict[col] = le

    # Step 3: 数值特征归一化
    num_cols = ['热量_kcal', '蛋白质_g', '价格_元']
    scaler = StandardScaler()

    # 执行预处理
    X = df.copy()
    
    # One-Hot编码
    X_ohe = ohe.fit_transform(X[cat_cols_ohe])
    
    # 标签编码有序特征
    X_ord = X[ord_cols].copy()
    # 标签编码转换
    for col in ord_cols:
        try:
            X_ord[col] = le_dict[col].transform(X_ord[col])
        except ValueError:
            # 处理之前没有见过的标签值，使用默认值0
            transformed = []
            for val in X_ord[col]:
                try:
                    transformed.append(le_dict[col].transform([val])[0])
                except ValueError:
                    transformed.append(0)
            X_ord[col] = transformed
    
    # 归一化数值特征
    X_num = scaler.fit_transform(X[num_cols])

    # 过敏源特征处理：创建一个综合过敏源特征
    allergy_cols = ['过敏源_海鲜', '过敏源_花生', '过敏源_鸡蛋', '过敏源_麸质', '过敏源_大豆']
    X_allergy = X[allergy_cols].values
    
    # 宗教特征处理：只使用合并后的饮食_宗教特征，避免冗余

    # 合并所有特征
    X_processed = np.hstack([X_ohe, X_ord, X_num, X_allergy])
    y = df['喜欢度'].values

    # 【文档P.13】数据分割：70%训练 / 15%验证 / 15%测试
    X_train, X_temp, y_train, y_temp = train_test_split(
        X_processed, y, test_size=0.3, random_state=42
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.5, random_state=42
    )
    print(f"[预处理完成] 训练集:{X_train.shape[0]}, 验证集:{X_val.shape[0]}, 测试集:{X_test.shape[0]}")

    from sklearn.ensemble import RandomForestRegressor
    
    # 初始化随机森林回归器
    rf = RandomForestRegressor(
        n_estimators=100,          # 树的数量
        criterion='squared_error',
        max_depth=5,              # 防止过拟合
        min_samples_split=5,      # 控制叶节点
        random_state=42
    )

    # 训练随机森林模型
    rf.fit(X_train, y_train)
    
    # 在验证集上评估模型
    val_score = rf.score(X_val, y_val)
    print(f"[模型评估] 随机森林验证R-squared评分 = {val_score:.4f}")
    
    # 使用随机森林作为最佳模型
    best_dt = rf
    
    # 在测试集上评估模型
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
    
    y_pred = best_dt.predict(X_test)
    
    # 计算评估指标
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mse)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    
    # 打印评估结果
    print("\n[模型评估] 测试集性能指标:")
    print(f"均方误差 (MSE): {mse:.4f}")
    print(f"均方根误差 (RMSE): {rmse:.4f}")
    print(f"平均绝对误差 (MAE): {mae:.4f}")
    print(f"R-squared评分: {r2:.4f}")

    # 保存模型
    model_data = {
        'model': best_dt,
        'ohe': ohe,
        'le_dict': le_dict,
        'scaler': scaler,
        'X_test': X_test,
        'y_test': y_test,
        'metrics': {
            'mse': mse,
            'rmse': rmse,
            'mae': mae,
            'r2': r2
        }
    }
    with open('recommendation_model.pkl', 'wb') as f:
        pickle.dump(model_data, f)
    print("[保存模型] 推荐模型已缓存")
    
    return best_dt, ohe, le_dict, scaler, X_test, y_test

# ——————————————————————————————
# 用户管理系统
# ——————————————————————————————

def hash_password(password):
    """密码加密"""
    return hashlib.sha256(password.encode()).hexdigest()

def load_users():
    """加载用户数据"""
    try:
        df = pd.read_csv('users.csv')
        # 确保用户名为字符串类型
        df['username'] = df['username'].astype(str)
        
        # 检查并添加缺失的字段
        if 'favorites' not in df.columns:
            df['favorites'] = json.dumps([])
        if 'blacklist' not in df.columns:
            df['blacklist'] = json.dumps([])
        
        return df
    except FileNotFoundError:
        # 如果文件不存在，创建一个空的用户表
        df = pd.DataFrame(columns=['username', 'password', 'preferences', 'favorites', 'blacklist', 'last_login'])
        df.to_csv('users.csv', index=False)
        return df

def save_users(df):
    """保存用户数据"""
    df.to_csv('users.csv', index=False)

def register():
    """用户注册"""
    print("\n" + "="*60)
    print("[用户注册]")
    print("="*60)
    print("输入 '0' 返回上一级")
    
    username = input("请输入用户名: ").strip()
    if username == '0':
        return None
    
    # 检查用户名是否已存在
    users_df = load_users()
    if username in users_df['username'].values:
        print("[错误] 用户名已存在，请重新选择")
        return None
    
    password = input("请输入密码: ").strip()
    if password == '0':
        return None
    
    confirm_password = input("请确认密码: ").strip()
    if confirm_password == '0':
        return None
    
    if password != confirm_password:
        print("[错误] 两次输入的密码不一致")
        return None
    
    # 创建新用户
    hashed_pw = hash_password(password)
    new_user = pd.DataFrame({
        'username': [username],
        'password': [hashed_pw],
        'preferences': [json.dumps({})],  # 初始空偏好
        'favorites': [json.dumps([])],  # 初始空收藏
        'blacklist': [json.dumps([])],  # 初始空拉黑
        'last_login': [time.strftime('%Y-%m-%d %H:%M:%S')]
    })
    
    users_df = pd.concat([users_df, new_user], ignore_index=True)
    save_users(users_df)
    
    print(f"[成功] 注册成功！欢迎 {username}！")
    return username

def login():
    """用户登录"""
    print("\n" + "="*60)
    print("[用户登录]")
    print("="*60)
    print("输入 '0' 返回上一级")
    
    username = input("请输入用户名: ").strip()
    if username == '0':
        return None
    
    password = input("请输入密码: ").strip()
    if password == '0':
        return None
    
    users_df = load_users()
    user_row = users_df[users_df['username'] == username]
    
    if user_row.empty:
        print("[错误] 用户名不存在")
        return None
    
    stored_pw = user_row.iloc[0]['password']
    if hash_password(password) != stored_pw:
        print("[错误] 密码错误")
        return None
    
    # 更新最后登录时间
    users_df.loc[users_df['username'] == username, 'last_login'] = time.strftime('%Y-%m-%d %H:%M:%S')
    save_users(users_df)
    
    print(f"[成功] 登录成功！欢迎回来 {username}！")
    return username

def get_user_preferences(username):
    """获取用户保存的偏好"""
    users_df = load_users()
    user_row = users_df[users_df['username'] == username]
    if user_row.empty:
        return None
    
    preferences_str = user_row.iloc[0]['preferences']
    try:
        return json.loads(preferences_str)
    except:
        return {}

def save_user_preferences(username, preferences):
    """保存用户偏好"""
    users_df = load_users()
    users_df.loc[users_df['username'] == username, 'preferences'] = json.dumps(preferences)
    save_users(users_df)
    print("[成功] 偏好设置已保存！")

def add_to_favorites(username, dish_id):
    """添加菜品到收藏"""
    users_df = load_users()
    user_row = users_df[users_df['username'] == username]
    if not user_row.empty:
        favorites = json.loads(user_row.iloc[0]['favorites'])
        if dish_id not in favorites:
            favorites.append(dish_id)
            users_df.loc[users_df['username'] == username, 'favorites'] = json.dumps(favorites)
            save_users(users_df)
            return True
    return False

def add_to_blacklist(username, dish_id):
    """添加菜品到拉黑"""
    users_df = load_users()
    user_row = users_df[users_df['username'] == username]
    if not user_row.empty:
        blacklist = json.loads(user_row.iloc[0]['blacklist'])
        if dish_id not in blacklist:
            blacklist.append(dish_id)
            users_df.loc[users_df['username'] == username, 'blacklist'] = json.dumps(blacklist)
            save_users(users_df)
            return True
    return False

def get_user_favorites(username):
    """获取用户收藏"""
    users_df = load_users()
    user_row = users_df[users_df['username'] == username]
    if not user_row.empty:
        return json.loads(user_row.iloc[0]['favorites'])
    return []

def get_user_blacklist(username):
    """获取用户拉黑"""
    users_df = load_users()
    user_row = users_df[users_df['username'] == username]
    if not user_row.empty:
        return json.loads(user_row.iloc[0]['blacklist'])
    return []

def delete_account(username):
    """注销账号"""
    print("\n" + "="*60)
    print("[注销账号]")
    print("="*60)
    
    # 确认注销
    confirm = input("确定要注销账号吗？此操作不可恢复！(y/n): ").strip().lower()
    if confirm != 'y':
        print("[提示] 注销操作已取消")
        return False
    
    try:
        # 加载用户数据
        users_df = load_users()
        # 删除用户
        users_df = users_df[users_df['username'] != username]
        # 保存更新后的数据
        users_df.to_csv('users.csv', index=False, encoding='utf-8')
        print("[成功] 账号已成功注销！")
        return True
    except Exception as e:
        print(f"[错误] 注销账号失败: {e}")
        return False

def show_user_menu(username):
    """显示用户菜单"""
    while True:
        print("\n" + "="*60)
        print("[用户菜单]")
        print("="*60)
        print("1. 开始推荐")
        print("2. 查看个人信息")
        print("3. 退出登录")
        print("4. 注销账号")
        print("5. 退出系统")
        
        choice = input("请选择操作: ").strip()
        if choice == '1':
            return True  # 开始推荐
        elif choice == '2':
            # 查看个人信息
            users_df = load_users()
            user_row = users_df[users_df['username'] == username]
            if not user_row.empty:
                print("\n" + "="*60)
                print("[个人信息]")
                print("="*60)
                print(f"用户名: {username}")
                print(f"最后登录: {user_row.iloc[0]['last_login']}")
                
                # 显示收藏和拉黑数量
                favorites = json.loads(user_row.iloc[0]['favorites'])
                blacklist = json.loads(user_row.iloc[0]['blacklist'])
                print(f"收藏菜品数量: {len(favorites)}")
                print(f"拉黑菜品数量: {len(blacklist)}")
                
                # 显示收藏和拉黑的菜品ID
                if favorites:
                    print(f"收藏的菜品ID: {', '.join(favorites)}")
                else:
                    print("收藏的菜品ID: 无")
                if blacklist:
                    print(f"拉黑的菜品ID: {', '.join(blacklist)}")
                else:
                    print("拉黑的菜品ID: 无")
            else:
                print("[错误] 无法获取个人信息")
            
            # 显示个人信息操作选项
            while True:
                print("\n" + "="*60)
                print("[个人信息操作]")
                print("="*60)
                print("1. 返回用户菜单")
                print("2. 取消收藏")
                print("3. 取消拉黑")
                
                info_choice = input("请选择操作: ").strip()
                if info_choice == '1':
                    break  # 返回用户菜单
                elif info_choice == '2':
                    # 取消收藏
                    if favorites:
                        print("\n" + "="*60)
                        print("[取消收藏]")
                        print("="*60)
                        for i, dish_id in enumerate(favorites, 1):
                            print(f"  {i}. {dish_id}")
                        print("  0. 返回")
                        
                        while True:
                            cancel_choice = input("请输入要取消收藏的菜品编号: ").strip()
                            if cancel_choice == '0':
                                break
                            try:
                                cancel_idx = int(cancel_choice) - 1
                                if 0 <= cancel_idx < len(favorites):
                                    dish_id = favorites[cancel_idx]
                                    # 从收藏列表中移除
                                    favorites.pop(cancel_idx)
                                    # 更新用户数据
                                    users_df.loc[users_df['username'] == username, 'favorites'] = json.dumps(favorites)
                                    users_df.to_csv('users.csv', index=False, encoding='utf-8')
                                    print(f"[成功] 菜品 {dish_id} 已从收藏列表中移除！")
                                    # 重新加载用户数据以更新显示
                                    users_df = load_users()
                                    user_row = users_df[users_df['username'] == username]
                                    if not user_row.empty:
                                        favorites = json.loads(user_row.iloc[0]['favorites'])
                                        blacklist = json.loads(user_row.iloc[0]['blacklist'])
                                    break
                                else:
                                    print("输入无效，请输入正确的编号")
                            except ValueError:
                                print("输入无效，请输入数字")
                    else:
                        print("[提示] 收藏列表为空")
                    # 显示更新后的个人信息
                    print("\n" + "="*60)
                    print("[个人信息]")
                    print("="*60)
                    print(f"用户名: {username}")
                    print(f"最后登录: {user_row.iloc[0]['last_login']}")
                    print(f"收藏菜品数量: {len(favorites)}")
                    print(f"拉黑菜品数量: {len(blacklist)}")
                    if favorites:
                        print(f"收藏的菜品ID: {', '.join(favorites)}")
                    else:
                        print("收藏的菜品ID: 无")
                    if blacklist:
                        print(f"拉黑的菜品ID: {', '.join(blacklist)}")
                    else:
                        print("拉黑的菜品ID: 无")
                elif info_choice == '3':
                    # 取消拉黑
                    if blacklist:
                        print("\n" + "="*60)
                        print("[取消拉黑]")
                        print("="*60)
                        for i, dish_id in enumerate(blacklist, 1):
                            print(f"  {i}. {dish_id}")
                        print("  0. 返回")
                        
                        while True:
                            cancel_choice = input("请输入要取消拉黑的菜品编号: ").strip()
                            if cancel_choice == '0':
                                break
                            try:
                                cancel_idx = int(cancel_choice) - 1
                                if 0 <= cancel_idx < len(blacklist):
                                    dish_id = blacklist[cancel_idx]
                                    # 从拉黑列表中移除
                                    blacklist.pop(cancel_idx)
                                    # 更新用户数据
                                    users_df.loc[users_df['username'] == username, 'blacklist'] = json.dumps(blacklist)
                                    users_df.to_csv('users.csv', index=False, encoding='utf-8')
                                    print(f"[成功] 菜品 {dish_id} 已从拉黑列表中移除！")
                                    # 重新加载用户数据以更新显示
                                    users_df = load_users()
                                    user_row = users_df[users_df['username'] == username]
                                    if not user_row.empty:
                                        favorites = json.loads(user_row.iloc[0]['favorites'])
                                        blacklist = json.loads(user_row.iloc[0]['blacklist'])
                                    break
                                else:
                                    print("输入无效，请输入正确的编号")
                            except ValueError:
                                print("输入无效，请输入数字")
                    else:
                        print("[提示] 拉黑列表为空")
                    # 显示更新后的个人信息
                    print("\n" + "="*60)
                    print("[个人信息]")
                    print("="*60)
                    print(f"用户名: {username}")
                    print(f"最后登录: {user_row.iloc[0]['last_login']}")
                    print(f"收藏菜品数量: {len(favorites)}")
                    print(f"拉黑菜品数量: {len(blacklist)}")
                    if favorites:
                        print(f"收藏的菜品ID: {', '.join(favorites)}")
                    else:
                        print("收藏的菜品ID: 无")
                    if blacklist:
                        print(f"拉黑的菜品ID: {', '.join(blacklist)}")
                    else:
                        print("拉黑的菜品ID: 无")
                else:
                    print("输入无效，请输入 1-3 之间的数字")
        elif choice == '3':
            return False  # 退出登录
        elif choice == '4':
            # 注销账号
            if delete_account(username):
                return False  # 注销成功后返回登录界面
        elif choice == '5':
            print("[成功] 退出系统")
            exit()
        else:
            print("输入无效，请输入 1-5 之间的数字")

def user_auth():
    """用户认证流程"""
    print("\n" + "="*60)
    print("[校园食堂推荐系统]")
    print("="*60)
    print("1. 登录")
    print("2. 注册")
    print("3. 游客模式")
    print("4. 退出系统")
    
    choice = input("请选择操作: ").strip()
    
    if choice == '1':
        username = login()
        if username:
            return username, True
        else:
            # 登录失败，重新尝试
            return user_auth()
    elif choice == '2':
        username = register()
        if username:
            return username, True
        else:
            # 注册失败，重新尝试
            return user_auth()
    elif choice == '3':
        print("[成功] 进入游客模式")
        return None, False
    elif choice == '4':
        print("[成功] 退出系统")
        exit()
    else:
        print("[错误] 无效选择")
        return user_auth()


# ——————————————————————————————
# 1️⃣ 【交互式用户输入】获取用户偏好
# ——————————————————————————————
def get_user_input(username=None, df=None):
    """
    交互式获取用户偏好输入
    参数: username - 用户名（如果已登录）
         df - 菜单数据框（用于检查是否有实际的菜系数据）
    返回: user_profile 字典
    """
    # 检查是否有实际的菜系数据
    has_cuisine_data = False
    if df is not None:
        has_cuisine_data = df.get('has_cuisine_data', False).any()
    # 检查是否有保存的偏好
    saved_preferences = None
    if username:
        saved_preferences = get_user_preferences(username)
        if saved_preferences and saved_preferences:
            print("\n" + "="*60)
            print("检测到您保存的偏好设置：")
            print("="*60)
            print(f"  口味: {saved_preferences.get('口味_辣度', '未设置')} / {saved_preferences.get('口味_咸淡', '未设置')} / {saved_preferences.get('口味_甜酸', '未设置')}")
            print(f"  菜系: {saved_preferences.get('菜系', '未设置')}")
            print(f"  营养: {saved_preferences.get('营养_热量', '未设置')} / {saved_preferences.get('营养_蛋白', '未设置')} / {saved_preferences.get('营养_蔬菜', '未设置')}")
            print(f"  过敏源: {', '.join(saved_preferences.get('饮食_过敏源', [])) if saved_preferences.get('饮食_过敏源') else '无'}")
            print(f"  宗教要求: {saved_preferences.get('饮食_宗教', '未设置')}")
            print(f"  价格: {saved_preferences.get('价格区间', '未设置')}")
            
            use_saved = input("\n是否使用保存的偏好设置？(y/n): ").strip().lower()
            if use_saved == 'y':
                print("[成功] 使用保存的偏好设置")
                return saved_preferences
    
    print("\n" + "="*60)
    print("欢迎使用校园食堂菜品推荐系统！")
    print("="*60)
    print("请根据提示输入您的饮食偏好：\n")
    
    def get_choice(prompt, options, allow_multi=False, allow_back=False, allow_login=False):
        """辅助函数：获取用户选择"""
        print(f"【{prompt}】")
        for i, opt in enumerate(options, 1):
            print(f"  {i}. {opt}")
        if allow_back:
            print(f"  0. 返回上一级")
        if allow_login:
            print(f"  9. 返回登录界面")
        
        while True:
            try:
                if allow_multi:
                    user_input = input(f"请输入选项编号（可多选，用逗号分隔，如 1,3）: ").strip()
                    if allow_back and user_input == '0':
                        return None  # 返回None表示返回上一级
                    if allow_login and user_input == '9':
                        return 'login'  # 返回'login'表示返回登录界面
                    indices = [int(x.strip()) for x in user_input.split(',')]
                    if all(1 <= i <= len(options) for i in indices):
                        return [options[i-1] for i in indices]
                    else:
                        print(f"输入无效，请输入 1-{len(options)} 之间的数字")
                else:
                    user_input = input("请输入选项编号: ").strip()
                    if allow_back and user_input == '0':
                        return None  # 返回None表示返回上一级
                    if allow_login and user_input == '9':
                        return 'login'  # 返回'login'表示返回登录界面
                    idx = int(user_input)
                    if 1 <= idx <= len(options):
                        return options[idx-1]
                    else:
                        print(f"输入无效，请输入 1-{len(options)} 之间的数字")
            except ValueError:
                if allow_back and user_input == '0':
                    return None  # 返回None表示返回上一级
                if allow_login and user_input == '9':
                    return 'login'  # 返回'login'表示返回登录界面
                print("输入无效，请输入数字")
    
    while True:
        # 口味偏好
        print("\n--- 口味偏好 ---")
        la_du = get_choice("辣度偏好", ['不辣', '微辣', '中辣', '重辣'], allow_back=True, allow_login=True)
        if la_du is None:  # 返回上一级
            return get_user_input(username, df)
        if la_du == 'login':  # 返回登录界面
            return 'login'
        
        xian_dan = get_choice("咸淡偏好", ['清淡', '适中', '偏咸'], allow_back=True, allow_login=True)
        if xian_dan is None:  # 返回上一级
            return get_user_input(username, df)
        if xian_dan == 'login':  # 返回登录界面
            return 'login'
        
        tian_suan = get_choice("甜酸偏好", ['甜味', '酸味', '酸甜'], allow_back=True, allow_login=True)
        if tian_suan is None:  # 返回上一级
            return get_user_input(username, df)
        if tian_suan == 'login':  # 返回登录界面
            return 'login'
        
        # 菜系偏好 - 只有当有实际的菜系数据时才显示
        if has_cuisine_data:
            print("\n--- 菜系偏好 ---")
            cai_xi = get_choice("菜系偏好", ['川菜', '粤菜', '湘菜', '鲁菜', '浙菜', '苏菜', '闽菜', '徽菜', '京菜', '东北菜'], allow_back=True, allow_login=True)
            if cai_xi is None:  # 返回上一级
                return get_user_input(username, df)
            if cai_xi == 'login':  # 返回登录界面
                return 'login'
        else:
            cai_xi = '无特殊要求'  # 没有菜系数据时，设置默认值
        
        # 营养需求
        print("\n--- 营养需求 ---")
        re_liang = get_choice("热量需求", ['低卡', '适中', '高能量'], allow_back=True, allow_login=True)
        if re_liang is None:  # 返回上一级
            return get_user_input(username, df)
        if re_liang == 'login':  # 返回登录界面
            return 'login'
        
        dan_bai = get_choice("蛋白质需求", ['低脂', '高蛋白', '均衡'], allow_back=True, allow_login=True)
        if dan_bai is None:  # 返回上一级
            return get_user_input(username, df)
        if dan_bai == 'login':  # 返回登录界面
            return 'login'
        
        shu_cai = get_choice("蔬菜需求", ['少菜', '适量', '多蔬菜'], allow_back=True, allow_login=True)
        if shu_cai is None:  # 返回上一级
            return get_user_input(username, df)
        if shu_cai == 'login':  # 返回登录界面
            return 'login'
        
        # 饮食限制
        print("\n--- 饮食限制 ---")
        guo_min = get_choice("过敏源（如无过敏请选择'无'）", 
                             ['无', '海鲜', '花生', '鸡蛋', '麸质', '大豆'], 
                             allow_multi=True, allow_back=True, allow_login=True)
        if guo_min is None:  # 返回上一级
            return get_user_input(username, df)
        if guo_min == 'login':  # 返回登录界面
            return 'login'
        guo_min = [] if '无' in guo_min else guo_min
        
        zong_jiao = get_choice("宗教饮食要求", ['无特殊要求', '清真', '素食', '无猪肉'], allow_back=True, allow_login=True)
        if zong_jiao is None:  # 返回上一级
            return get_user_input(username, df)
        if zong_jiao == 'login':  # 返回登录界面
            return 'login'
        
        # 价格偏好
        print("\n--- 价格偏好 ---")
        jia_ge = get_choice("价格区间", ['经济型（<12元）', '标准型（12-20元）', '品质型（20元以上）'], allow_back=True, allow_login=True)
        if jia_ge is None:  # 返回上一级
            return get_user_input(username, df)
        if jia_ge == 'login':  # 返回登录界面
            return 'login'
        
        # 构建用户档案
        user_profile = {
            "口味_辣度": la_du,
            "口味_咸淡": xian_dan,
            "口味_甜酸": tian_suan,
            "菜系": cai_xi,
            "营养_热量": re_liang,
            "营养_蛋白": dan_bai,
            "营养_蔬菜": shu_cai,
            "饮食_过敏源": guo_min,
            "饮食_宗教": zong_jiao,
            "价格区间": jia_ge
        }
        break
    
    # 显示用户选择摘要
    print("\n" + "="*60)
    print("您的偏好设置如下：")
    print("-"*60)
    print(f"  口味: {la_du} / {xian_dan} / {tian_suan}")
    print(f"  菜系: {cai_xi}")
    print(f"  营养: {re_liang} / {dan_bai} / {shu_cai}")
    print(f"  过敏源: {', '.join(guo_min) if guo_min else '无'}")
    print(f"  宗教要求: {zong_jiao}")
    print(f"  价格: {jia_ge}")
    print("="*60)
    
    return user_profile

# ——————————————————————————————
# 5️⃣ 【文档P.16】可解释推荐引擎（核心交付物）
# ——————————————————————————————
def recommend_dishes(user_input, model, ohe, le_dict, scaler, df_menu, top_n=5, username=None, exclude_ids=None, max_match=None):
    """
    推荐函数：输入用户偏好字典，输出Top-N菜品 + 可解释理由
    严格遵循文档P.16：“推荐理由说明”“决策路径可视化”“关键因素高亮”
    """
    # 排除拉黑的菜品
    if username:
        blacklist = get_user_blacklist(username)
        if blacklist:
            df_menu = df_menu[~df_menu['菜品ID'].isin(blacklist)]
    
    # 排除之前推荐过的菜品
    if exclude_ids:
        df_menu = df_menu[~df_menu['菜品ID'].isin(exclude_ids)]
    
    # 检查是否有可用菜品
    if df_menu.empty:
        # 当没有可用菜品时，返回空推荐列表
        return [], 0, None
    
    # 检查是否有实际的菜系数据
    has_cuisine_data = df_menu.get('has_cuisine_data', False).any()
    
    # Step 1: 将用户输入向量化（完全复现训练时的预处理流程）
    user_vec = []

    # One-Hot部分（菜系、辣度等）
    user_cat_ohe = pd.DataFrame([user_input])
    # 对宗教/价格等做标签编码
    ord_cols = ['辣度', '咸淡', '甜酸', '营养_热量', '营养_蛋白', '营养_蔬菜', '价格区间']
    for col in ord_cols:
        if col in user_input:
            try:
                encoded = le_dict[col].transform([user_input[col]])[0]
            except ValueError:
                encoded = 0  # 未知值设为0
            user_cat_ohe[col] = encoded

    # One-Hot transform（注意：必须用fit时的ohe）
    if has_cuisine_data:
        cat_cols_ohe = ['菜系', '饮食_宗教']
    else:
        cat_cols_ohe = ['饮食_宗教']
    
    try:
        user_ohe = ohe.transform(user_cat_ohe[cat_cols_ohe])
    except:
        # 若出现未见过的类别，补零（生产环境应拦截）
        user_ohe = np.zeros((1, len(ohe.get_feature_names_out(cat_cols_ohe))))

    # 数值部分（热量/蛋白/价格 → 需归一化）
    user_num = np.array([[
        user_input.get('热量_kcal', 450),
        user_input.get('蛋白质_g', 22),
        user_input.get('价格_元', 15)
    ]])
    # 转换为DataFrame并添加特征名称，避免StandardScaler警告
    user_num_df = pd.DataFrame(user_num, columns=['热量_kcal', '蛋白质_g', '价格_元'])
    user_num_scaled = scaler.transform(user_num_df)
    
    # 过敏源二进制特征（用户输入的过敏源需要转换为二进制）
    user_allergies = user_input.get('饮食_过敏源', [])
    user_allergy_vec = np.array([[
        1 if '海鲜' in user_allergies else 0,
        1 if '花生' in user_allergies else 0,
        1 if '鸡蛋' in user_allergies else 0,
        1 if '麸质' in user_allergies else 0,
        1 if '大豆' in user_allergies else 0
    ]])

    # 准备标签编码后的有序特征值
    user_ord_values = []
    for col in ord_cols:
        if col in user_cat_ohe.columns:
            user_ord_values.append(user_cat_ohe[col].values[0])
        else:
            user_ord_values.append(0)  # 默认值
    user_ord_array = np.array([user_ord_values])
    
    # 合并向量（与train_model函数中的顺序一致）
    user_vec = np.hstack([user_ohe, user_ord_array, user_num_scaled, user_allergy_vec])

    # Step 2: 获取模型预测喜欢度（文档P.16：“根据预测概率排序”）
    pred_score = model.predict(user_vec)[0]
    # 将预测的喜欢度（0-5分）归一化到0-1范围
    prob_like = pred_score / 5.0
    # 确保prob_like在0-1范围内
    prob_like = max(0, min(1, prob_like))

    # Step 3: 筛选符合用户要求的菜品（价格、过敏源、宗教要求）
    # 构建用户偏好，并进行映射以匹配数据中的实际值
    # 映射用户输入到数据中的实际值
    nutrition_mapping = {
        '低卡': '低热量',
        '适中': '中等热量',
        '高能量': '高热量',
        '低脂': '低脂',
        '高蛋白': '高蛋白',
        '均衡': '均衡',
        '少菜': '少菜',
        '适量': '适量',
        '多蔬菜': '多蔬菜'
    }
    
    price_mapping = {
        '经济型（<12元）': '经济型（12元以下）',
        '标准型（12-20元）': '标准型（12-20元）',
        '品质型（20元以上）': '品质型（20元以上）'
    }
    
    # 根据是否有实际的菜系数据构建用户偏好
    user_prefs = {
        '辣度': user_input.get('口味_辣度'),
        '咸淡': user_input.get('口味_咸淡'),
        '甜酸': user_input.get('口味_甜酸'),
        '营养_热量': nutrition_mapping.get(user_input.get('营养_热量'), user_input.get('营养_热量')),
        '营养_蛋白': nutrition_mapping.get(user_input.get('营养_蛋白'), user_input.get('营养_蛋白')),
        '营养_蔬菜': nutrition_mapping.get(user_input.get('营养_蔬菜'), user_input.get('营养_蔬菜')),
        '价格区间': price_mapping.get(user_input.get('价格区间'), user_input.get('价格区间')),
        '饮食_宗教': user_input.get('饮食_宗教')
    }
    
    # 只有当有实际的菜系数据时，才添加菜系偏好
    if has_cuisine_data:
        user_prefs['菜系'] = user_input.get('菜系')
    
    # 筛选符合条件的菜品
    df_filtered = df_menu.copy()
    
    # 价格筛选
    df_filtered = df_filtered[df_filtered['价格区间'] == user_prefs['价格区间']]
    
    # 宗教要求筛选
    if user_prefs['饮食_宗教'] != '无特殊要求':
        df_filtered = df_filtered[df_filtered['饮食_宗教'] == user_prefs['饮食_宗教']]
    
    # 过敏源筛选
    user_allergies = user_input.get('饮食_过敏源', [])
    if user_allergies:
        if '海鲜' in user_allergies:
            df_filtered = df_filtered[df_filtered['过敏源_海鲜'] == 0]
        if '花生' in user_allergies:
            df_filtered = df_filtered[df_filtered['过敏源_花生'] == 0]
        if '鸡蛋' in user_allergies:
            df_filtered = df_filtered[df_filtered['过敏源_鸡蛋'] == 0]
        if '麸质' in user_allergies:
            df_filtered = df_filtered[df_filtered['过敏源_麸质'] == 0]
        if '大豆' in user_allergies:
            df_filtered = df_filtered[df_filtered['过敏源_大豆'] == 0]
    
    # 检查筛选后是否有可用菜品
    if df_filtered.empty:
        return [], 0, None
    
    # Step 4: 在筛选后的菜品中计算口味和营养的权重，进行排序
    # 创建临时DataFrame进行向量化计算
    df_temp = df_filtered.copy()
    
    # 口味匹配 (各2分)
    df_temp['口味匹配'] = ((df_temp['辣度'] == user_prefs['辣度']).astype(int) + 
                          (df_temp['咸淡'] == user_prefs['咸淡']).astype(int) + 
                          (df_temp['甜酸'] == user_prefs['甜酸']).astype(int)) * 2
    
    # 营养匹配 (各2分)
    df_temp['营养匹配'] = ((df_temp['营养_热量'] == user_prefs['营养_热量']).astype(int) + 
                          (df_temp['营养_蛋白'] == user_prefs['营养_蛋白']).astype(int) + 
                          (df_temp['营养_蔬菜'] == user_prefs['营养_蔬菜']).astype(int)) * 2
    
    # 评分因素 (0.5分/分)
    df_temp['评分匹配'] = df_temp['评分'] * 0.5
    
    # 菜系匹配 (3分) - 只有当有实际的菜系数据时才计算
    if has_cuisine_data:
        df_temp['菜系匹配'] = (df_temp['菜系'] == user_prefs['菜系']).astype(int) * 3
        # 总匹配度（包含口味、营养、菜系和评分）
        df_temp['总匹配度'] = (df_temp['口味匹配'] + df_temp['菜系匹配'] + 
                              df_temp['营养匹配'] + df_temp['评分匹配'])
    else:
        # 总匹配度（仅包含口味、营养和评分）
        df_temp['菜系匹配'] = 0  # 没有菜系数据时，菜系匹配度为0
        df_temp['总匹配度'] = (df_temp['口味匹配'] + df_temp['营养匹配'] + 
                              df_temp['评分匹配'])
    
    # 如果指定了最大匹配度，过滤掉超过该值的菜品
    if max_match is not None:
        # 计算理论最大总匹配度
        if has_cuisine_data:
            max_theoretical_match = 19.5  # 口味6 + 菜系3 + 营养6 + 评分4.5
        else:
            max_theoretical_match = 16.5  # 口味6 + 营养6 + 评分4.5
        # 将max_match转换为总匹配度值
        max_match_value = max_match * max_theoretical_match
        # 过滤掉总匹配度超过max_match_value的菜品
        df_temp = df_temp[df_temp['总匹配度'] <= max_match_value]
        # 如果过滤后没有菜品，返回空推荐
        if df_temp.empty:
            return [], 0, None
    
    # 排序并选择Top-N
    top_dishes = df_temp.sort_values('总匹配度', ascending=False).head(top_n)

    # Step 4: 构建推荐列表 + 理由（文档P.16核心要求）
    recommendations = []
    for idx, dish in top_dishes.iterrows():
        # 根据用户偏好生成详细推荐理由
        reason_parts = []
        
        # 口味匹配
        if dish['辣度'] == user_input.get('口味_辣度'):
            reason_parts.append(f"辣度符合您的偏好（{dish['辣度']}）")
        if dish['咸淡'] == user_input.get('口味_咸淡'):
            reason_parts.append(f"咸淡符合您的偏好（{dish['咸淡']}）")
        if dish['甜酸'] == user_input.get('口味_甜酸'):
            reason_parts.append(f"甜酸口味符合您的偏好（{dish['甜酸']}）")
        
        # 菜系匹配 - 只有当有实际的菜系数据时才进行匹配
        if has_cuisine_data and dish['菜系'] == user_input.get('菜系'):
            reason_parts.append(f"菜系符合您的偏好（{dish['菜系']}）")
        
        # 营养匹配
        if dish['营养_热量'] == user_input.get('营养_热量'):
            reason_parts.append(f"热量符合您的需求（{dish['营养_热量']}）")
        if dish['营养_蛋白'] == user_input.get('营养_蛋白'):
            reason_parts.append(f"蛋白质含量符合您的需求（{dish['营养_蛋白']}）")
        if dish['营养_蔬菜'] == user_input.get('营养_蔬菜'):
            reason_parts.append(f"蔬菜含量符合您的需求（{dish['营养_蔬菜']}）")
        
        # 高评分
        if dish['评分'] >= 4.0:
            reason_parts.append(f"该菜品评分较高（{dish['评分']:.1f}分）")
        
        # 高蛋白（如果用户需要高蛋白）
        if user_input.get('营养_蛋白') == '高蛋白' and dish['蛋白质_g'] >= 25:
            reason_parts.append(f"高蛋白含量（{dish['蛋白质_g']}g）")
        
        # 组装推荐理由
        if reason_parts:
            reason = "；".join(reason_parts)
        else:
            reason = "综合多项偏好匹配"

        recommendations.append({
            "标签": "偏好推荐",
            "菜品ID": dish['菜品ID'],
            "菜系": dish['菜系'],
            "辣度": dish['辣度'],
            "咸淡": dish['咸淡'],
            "甜酸": dish['甜酸'],
            "热量_kcal": int(dish['热量_kcal']),
            "蛋白质_g": int(dish['蛋白质_g']),
            "营养_蔬菜": dish['营养_蔬菜'],
            "价格_元": int(dish['价格_元']),
            "评分": round(dish['评分'], 1),
            "楼层": int(dish.get('楼层', 0)),
            "窗口": int(dish.get('窗口', 0)),
            "推荐理由": f"系统推荐本菜品是因为：{reason}。",
            "匹配详情": {
                "口味匹配": dish['口味匹配'],
                "菜系匹配": dish['菜系匹配'],
                "营养匹配": dish['营养匹配'],
                "评分匹配": dish['评分匹配'],
                "总匹配度": dish['总匹配度']
            }
        })

    # Step 5: 添加盲盒菜品推荐
    # 筛选符合用户价格、过敏源和宗教要求的菜品
    eligible_dishes = df_menu.copy()
    
    # 价格筛选
    eligible_dishes = eligible_dishes[eligible_dishes['价格区间'] == user_prefs['价格区间']]
    
    # 筛选宗教要求
    user_religion = user_input.get('饮食_宗教', '无特殊要求')
    if user_religion != '无特殊要求':
        eligible_dishes = eligible_dishes[eligible_dishes['饮食_宗教'] == user_religion]
    
    # 筛选过敏源
    user_allergies = user_input.get('饮食_过敏源', [])
    if user_allergies:
        if '海鲜' in user_allergies:
            eligible_dishes = eligible_dishes[eligible_dishes['过敏源_海鲜'] == 0]
        if '花生' in user_allergies:
            eligible_dishes = eligible_dishes[eligible_dishes['过敏源_花生'] == 0]
        if '鸡蛋' in user_allergies:
            eligible_dishes = eligible_dishes[eligible_dishes['过敏源_鸡蛋'] == 0]
        if '麸质' in user_allergies:
            eligible_dishes = eligible_dishes[eligible_dishes['过敏源_麸质'] == 0]
        if '大豆' in user_allergies:
            eligible_dishes = eligible_dishes[eligible_dishes['过敏源_大豆'] == 0]
    
    # 随机选择一个盲盒菜品
    if not eligible_dishes.empty:
        blind_box_dish = eligible_dishes.sample(1).iloc[0]
        
        # 生成盲盒推荐理由（完整介绍）
        blind_reason_parts = []
        blind_reason_parts.append(f"菜系：{blind_box_dish['菜系']}")
        blind_reason_parts.append(f"口味：{blind_box_dish['辣度']}、{blind_box_dish['咸淡']}、{blind_box_dish['甜酸']}")
        blind_reason_parts.append(f"营养：热量 {blind_box_dish['热量_kcal']}kcal，蛋白质 {blind_box_dish['蛋白质_g']}g，蔬菜 {blind_box_dish['营养_蔬菜']}")
        blind_reason_parts.append(f"价格：{blind_box_dish['价格_元']}元")
        blind_reason_parts.append(f"评分：{blind_box_dish['评分']:.1f}分")
        
        # 检查过敏源
        allergy_info = []
        if blind_box_dish['过敏源_海鲜'] == 0:
            allergy_info.append('不含海鲜')
        if blind_box_dish['过敏源_花生'] == 0:
            allergy_info.append('不含花生')
        if blind_box_dish['过敏源_鸡蛋'] == 0:
            allergy_info.append('不含鸡蛋')
        if blind_box_dish['过敏源_麸质'] == 0:
            allergy_info.append('不含麸质')
        if blind_box_dish['过敏源_大豆'] == 0:
            allergy_info.append('不含大豆')
        if allergy_info:
            blind_reason_parts.append(f"过敏源：{'、'.join(allergy_info)}")
        
        # 检查宗教要求
        if blind_box_dish['饮食_宗教'] != '无特殊要求':
            blind_reason_parts.append(f"宗教要求：{blind_box_dish['饮食_宗教']}")
        
        blind_reason = "；".join(blind_reason_parts)
        
        # 添加盲盒推荐
        recommendations.append({
            "标签": "盲盒尝鲜",
            "菜品ID": blind_box_dish['菜品ID'],
            "菜系": blind_box_dish['菜系'],
            "辣度": blind_box_dish['辣度'],
            "咸淡": blind_box_dish['咸淡'],
            "甜酸": blind_box_dish['甜酸'],
            "热量_kcal": int(blind_box_dish['热量_kcal']),
            "蛋白质_g": int(blind_box_dish['蛋白质_g']),
            "营养_蔬菜": blind_box_dish['营养_蔬菜'],
            "价格_元": int(blind_box_dish['价格_元']),
            "评分": round(blind_box_dish['评分'], 1),
            "楼层": int(blind_box_dish.get('楼层', 0)),
            "窗口": int(blind_box_dish.get('窗口', 0)),
            "推荐理由": f"{blind_reason}。这是一个惊喜推荐，可能会带给您新的味觉体验！"
        })
    
    # 计算每个推荐菜品的具体匹配度
    if len(top_dishes) > 0:
        # 对于偏好推荐，使用相对匹配度（最高匹配度为100%）
        max_match = df_temp['总匹配度'].max()
        
        for i, rec in enumerate(recommendations):
            if i < len(top_dishes):
                # 对于偏好推荐，使用计算的总匹配度并相对归一化
                dish_idx = top_dishes.index[i]
                total_match = df_temp.loc[dish_idx, '总匹配度']
                # 归一化匹配度到0-1范围（相对最大值）
                normalized_match = total_match / max_match if max_match > 0 else 0
                # 确保normalized_match在0-1范围内
                normalized_match = max(0, min(1, normalized_match))
                # 确保偏好推荐的匹配度高于盲盒推荐
                rec['匹配度'] = max(normalized_match, prob_like + 0.1)  # 偏好推荐至少比盲盒高10%
                # 确保匹配度不超过1
                rec['匹配度'] = min(rec['匹配度'], 1.0)
            else:
                # 对于盲盒推荐，使用模型预测概率
                rec['匹配度'] = prob_like
    else:
        # 如果没有偏好推荐，所有推荐都使用模型预测概率
        for rec in recommendations:
            rec['匹配度'] = prob_like
    
    # 返回推荐列表、平均匹配度和最高匹配度
    avg_match = sum(rec['匹配度'] for rec in recommendations) / len(recommendations) if recommendations else 0
    # 计算当前推荐的最高匹配度
    current_max_match = max(rec['匹配度'] for rec in recommendations) if recommendations else 0
    return recommendations, avg_match, current_max_match

if __name__ == '__main__':
    # 初始化 user_profile（将在后面通过交互式输入获取）
    user_profile = None

    # 生成或加载菜单数据
    df = generate_menu_data()

    # 训练或加载模型
    best_dt, ohe, le_dict, scaler, X_test, y_test = train_model(df)

    # 【文档P.15】特征重要性分析（Gini重要性）
    # 重新定义特征列，因为这些变量已经在train_model函数内部
    # 检查是否有实际的菜系数据
    has_cuisine_data = df.get('has_cuisine_data', False).any()
    if has_cuisine_data:
        cat_cols_ohe = ['菜系', '饮食_宗教']
    else:
        cat_cols_ohe = ['饮食_宗教']
    
    ord_cols = ['辣度', '咸淡', '甜酸', '营养_热量', '营养_蛋白', '营养_蔬菜', '价格区间']
    num_cols = ['热量_kcal', '蛋白质_g', '价格_元']
    allergy_cols = ['过敏源_海鲜', '过敏源_花生', '过敏源_鸡蛋', '过敏源_麸质', '过敏源_大豆']

    feature_names = (
        ohe.get_feature_names_out(cat_cols_ohe).tolist() +
        ord_cols +
        num_cols +
        allergy_cols
    )

    # 计算特征重要性
    importance_df = pd.DataFrame({
        'feature': feature_names,
        'importance': best_dt.feature_importances_
    })

    # 合并过敏源相关特征为"过敏源"
    allergy_importance = importance_df[importance_df['feature'].isin(allergy_cols)]['importance'].sum()

    # 创建新的DataFrame，排除原过敏源特征，添加合并后的过敏源
    importance_df = importance_df[~importance_df['feature'].isin(allergy_cols)]
    if allergy_importance > 0:
        allergy_row = pd.DataFrame({'feature': ['过敏源'], 'importance': [allergy_importance]})
        importance_df = pd.concat([importance_df, allergy_row], ignore_index=True)

    # 排序并取前10
    importance_df = importance_df.sort_values('importance', ascending=False).head(10)

    print("\n【文档P.15/P.16】Top-10关键特征（Gini重要性）：")
    print(importance_df.to_string(index=False))

    # 用户认证和偏好设置
    while True:
        # 用户认证
        username, is_logged_in = user_auth()
        
        # 如果是登录用户，显示用户菜单
        if is_logged_in:
            start_recommend = show_user_menu(username)
            if not start_recommend:
                continue  # 退出登录，重新认证
        
        # 获取用户输入
        user_profile = get_user_input(username, df)
        
        # 检查是否需要返回登录界面
        if user_profile == 'login':
            continue
        
        # 执行推荐
        print("\n" + "="*60)
        print("[推荐结果]")
        print("="*60)
        recommended_ids = []  # 存储所有已推荐的菜品ID
        recs, match_score, current_max_match = recommend_dishes(user_profile, best_dt, ohe, le_dict, scaler, df, username=username, exclude_ids=recommended_ids)
        # 添加首次推荐的菜品ID到已推荐列表
        recommended_ids.extend([r['菜品ID'] for r in recs])
        break

    while True:
        for i, r in enumerate(recs, 1):
            print(f"\n{i}. [{r['标签']}] [{r['菜品ID']}] {r['菜系']} - {r['辣度']} - {r['咸淡']} - {r['甜酸']} - {r['热量_kcal']}kcal - {r['蛋白质_g']}g蛋白 - {r['营养_蔬菜']} - {r['评分']}分 - {r['价格_元']}元 - 楼层{r['楼层']} - 窗口{r['窗口']}")
            print(f"   推荐理由：{r['推荐理由']}")
            if r['标签'] == '偏好推荐' and '匹配详情' in r:
                details = r['匹配详情']
                total = details['总匹配度']
                print(f"   菜品匹配指数：{total:.1f}（总匹配度 = 口味匹配({details['口味匹配']}) + 菜系匹配({details['菜系匹配']}) + 营养匹配({details['营养匹配']}) + 评分匹配({details['评分匹配']:.1f}) ")
            else:
                print(f"   匹配度：{r['匹配度']:.2%}（模型置信度）")
        
        # 询问是否换一批或收藏/拉黑
        print("\n" + "="*60)
        print("[操作选项]")
        print("="*60)
        print("1. 换一批菜品")
        print("2. 反馈喜欢度（0-5分）")
        
        # 只有登录用户显示收藏和拉黑选项
        if is_logged_in:
            print("3. 收藏某个菜品")
            print("4. 拉黑某个菜品")
            print("5. 结束推荐")
            print("6. 退出系统")
            max_choice = 6
        else:
            print("3. 结束推荐")
            print("4. 退出系统")
            max_choice = 4
        
        choice = input("请选择操作: ").strip()
        if choice == '1':
            # 重新生成推荐
            print("\n正在生成新的推荐...")
            # 排除所有之前推荐过的菜品，并传递当前最高匹配度
            recs, match_score, new_max_match = recommend_dishes(user_profile, best_dt, ohe, le_dict, scaler, df, username=username, exclude_ids=recommended_ids, max_match=current_max_match)
            # 检查是否有推荐结果
            if not recs:
                print("\n抱歉，没有更多符合条件的菜品了！")
                print("建议：尝试调整您的偏好设置，或者重新开始推荐。")
                continue
            # 更新当前最高匹配度
            current_max_match = new_max_match
            # 添加新推荐的菜品ID到已推荐列表
            recommended_ids.extend([r['菜品ID'] for r in recs])
        elif choice == '2':
            # 反馈喜欢度（0-5分）
            dish_num = input("请输入要反馈的菜品编号: ").strip()
            try:
                dish_idx = int(dish_num) - 1
                if 0 <= dish_idx < len(recs):
                    dish_id = recs[dish_idx]['菜品ID']
                    feedback = input("请输入喜欢度评分（0-5分）: ").strip()
                    try:
                        feedback = float(feedback)
                        if 0 <= feedback <= 5:
                            # 保存用户反馈
                            print(f"[成功] 收到您对菜品 {dish_id} 的反馈：喜欢度 {feedback} 分")
                            # 这里可以添加反馈处理逻辑，例如更新用户偏好或重新训练模型
                        else:
                            print("输入无效，请输入 0-5 之间的数字")
                    except ValueError:
                        print("输入无效，请输入数字")
                else:
                    print("输入无效，请输入正确的菜品编号")
            except ValueError:
                print("输入无效，请输入数字")
        elif is_logged_in and choice == '3':
            # 收藏菜品
            dish_num = input("请输入要收藏的菜品编号: ").strip()
            try:
                dish_idx = int(dish_num) - 1
                if 0 <= dish_idx < len(recs):
                    dish_id = recs[dish_idx]['菜品ID']
                    if add_to_favorites(username, dish_id):
                        print(f"[成功] 菜品 {dish_id} 已添加到收藏！")
                    else:
                        print(f"[提示] 菜品 {dish_id} 已经在收藏列表中！")
                else:
                    print("输入无效，请输入正确的菜品编号")
            except ValueError:
                print("输入无效，请输入数字")
        elif is_logged_in and choice == '4':
            # 拉黑菜品
            dish_num = input("请输入要拉黑的菜品编号: ").strip()
            try:
                dish_idx = int(dish_num) - 1
                if 0 <= dish_idx < len(recs):
                    dish_id = recs[dish_idx]['菜品ID']
                    if add_to_blacklist(username, dish_id):
                        print(f"[成功] 菜品 {dish_id} 已添加到拉黑列表！")
                    else:
                        print(f"[提示] 菜品 {dish_id} 已经在拉黑列表中！")
                else:
                    print("输入无效，请输入正确的菜品编号")
            except ValueError:
                print("输入无效，请输入数字")
        elif (is_logged_in and choice == '5') or (not is_logged_in and choice == '3'):
            break
        elif (is_logged_in and choice == '6') or (not is_logged_in and choice == '4'):
            print("[成功] 退出系统")
            exit()
        else:
            print(f"输入无效，请输入 1-{max_choice} 之间的数字")

    # 询问是否保存偏好（如果已登录）
    if is_logged_in:
        save_preference = input("\n是否保存当前偏好设置？(y/n): ").strip().lower()
        if save_preference == 'y':
            save_user_preferences(username, user_profile)

    # ——————————————————————————————
    # 6️⃣ 【文档P.15】可视化决策树（可解释性佐证）
    # ——————————————————————————————
    # 创建用于可视化的特征名称（将宗教相关特征替换为"宗教要求"）
    feature_names_display = []
    for name in feature_names:
        if name in ['宗教_清真', '宗教_素食', '宗教_无猪肉']:
            feature_names_display.append('宗教要求')
        else:
            feature_names_display.append(name)

    # 只有当模型是决策树时才绘制决策树
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
    if isinstance(best_dt, (DecisionTreeClassifier, DecisionTreeRegressor)):
        plt.figure(figsize=(15, 10))
        # 对于回归树，不需要class_names
        plot_tree(best_dt, 
                  feature_names=feature_names_display,
                  filled=True, 
                  fontsize=8, 
                  max_depth=3,  # 仅显示前3层保证可读性
                  rounded=True,
                  proportion=True)
        plt.title("推荐系统决策过程\n（系统如何根据您的偏好做推荐）", fontsize=14, pad=20)
        plt.figtext(0.5, 0.01, '注：每个节点显示决策条件，叶子节点显示预测的喜欢度', ha='center', fontsize=10, style='italic')
        plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    else:
        # 对于随机森林，显示特征重要性
        plt.figure(figsize=(12, 6))
        importances = best_dt.feature_importances_
        indices = np.argsort(importances)[::-1]
        plt.bar(range(len(importances)), importances[indices])
        plt.xticks(range(len(importances)), [feature_names_display[i] for i in indices], rotation=45, ha='right')
        plt.title("随机森林特征重要性", fontsize=14, pad=20)
        plt.tight_layout()
    plt.savefig("decision_tree_top3.png", dpi=300, bbox_inches='tight')
    print("\n[完成] 推荐决策过程图已保存为 'decision_tree_top3.png'")

    # ——————————————————————————————
    # 7️⃣ 【文档P.17】模型评估报告（呼应文档P.17“实验报告”要求）
    # ——————————————————————————————
    y_pred = best_dt.predict(X_test)
    print("\n" + "="*60)
    print("[模型评估报告]（回归模型评估指标）")
    print("="*60)
    
    # 计算回归评估指标
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mse)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    
    print(f"均方误差 (MSE): {mse:.4f}")
    print(f"均方根误差 (RMSE): {rmse:.4f}")
    print(f"平均绝对误差 (MAE): {mae:.4f}")
    print(f"R-squared评分: {r2:.4f}")
    
    # 特征重要性图
    plt.figure(figsize=(10, 6))
    sns.barplot(data=importance_df.head(8), x='importance', y='feature')
    plt.title('哪些因素影响推荐结果\n（重要程度从高到低）', fontsize=14, pad=20)
    plt.xlabel('重要程度')
    plt.ylabel('影响因素')
    plt.figtext(0.5, 0.01, '注：高度越高表示该因素对推荐结果影响越大', ha='center', fontsize=10, style='italic')
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    plt.savefig("feature_importance.png", dpi=300, bbox_inches='tight')
    print("[完成] 推荐影响因素图已保存为 'feature_importance.png'")
