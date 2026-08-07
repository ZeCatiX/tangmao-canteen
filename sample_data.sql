-- 唐猫庭院 - 示例数据
-- 在空数据库上运行此脚本创建表结构和示例数据

-- 创建表结构
CREATE TABLE IF NOT EXISTS dishes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  spiciness VARCHAR(50) DEFAULT '不辣',
  saltiness VARCHAR(50) DEFAULT '适中',
  sweetness VARCHAR(50) DEFAULT '无味',
  price NUMERIC,
  rating NUMERIC,
  cooking_time INTEGER DEFAULT 5,
  serving VARCHAR(50),
  calorie VARCHAR(50),
  description TEXT,
  allergies JSONB DEFAULT '{}'::JSONB,
  religion VARCHAR(50) DEFAULT '无特殊要求',
  is_halal BOOLEAN DEFAULT FALSE,
  is_vegetarian BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(200),
  preferences JSONB DEFAULT '{}'::JSONB,
  favorites INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  blacklist INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  rating_history JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  dish_id INTEGER NOT NULL,
  rating NUMERIC,
  user_preferences JSONB DEFAULT '{}'::JSONB,
  user_id VARCHAR(100),
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100),
  items JSONB DEFAULT '[]'::JSONB,
  total_price NUMERIC DEFAULT 0,
  dish_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  table_number VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendation_log (
  id SERIAL PRIMARY KEY,
  user_type VARCHAR(50) DEFAULT 'guest',
  user_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preference_log (
  id SERIAL PRIMARY KEY,
  spiciness VARCHAR(50),
  saltiness VARCHAR(50),
  sweetness VARCHAR(50),
  price VARCHAR(50),
  religion VARCHAR(50),
  allergies TEXT[],
  user_id VARCHAR(100),
  recommendation_mode VARCHAR(50),
  calorie VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 添加外键约束和索引（增强数据完整性）
ALTER TABLE feedback ADD CONSTRAINT fk_feedback_dish FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_feedback_dish_id ON feedback(dish_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_recommendation_log_user_id ON recommendation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_preference_log_user_id ON preference_log(user_id);
CREATE INDEX IF NOT EXISTS idx_dishes_category ON dishes(category);
CREATE INDEX IF NOT EXISTS idx_dishes_is_active ON dishes(is_active);

-- 示例用户
INSERT INTO users (username, password, preferences, created_at) VALUES
('admin', '$2b$10$DummyHashForAdmin', '{"spiciness":"微辣","saltiness":"适中","sweetness":"酸甜"}', NOW()),
('demo', '$2b$10$DummyHashForDemo', '{"spiciness":"不辣","saltiness":"清淡","sweetness":"无味"}', NOW());

-- 示例反馈
INSERT INTO feedback (dish_id, rating, user_id, created_at) VALUES
(1, 4.5, 'demo', NOW()),
(2, 4.0, 'demo', NOW() - INTERVAL '1 day'),
(3, 5.0, 'demo', NOW() - INTERVAL '2 days');