// 唐猫庭院 - PostgreSQL 用户存储模块（bcrypt + JWT 就绪）
const bcrypt = require('bcrypt');
const pool = require('./db');

const SALT_ROUNDS = 10;

// 获取带编码设置的连接
async function getClient() {
  const client = await pool.connect();
  await client.query("SET client_encoding = 'UTF8'");
  return client;
}

// 读取所有用户
async function readUsers() {
  let client;
  try {
    client = await getClient();
    const result = await client.query('SELECT id, username, preferences, favorites, blacklist, rating_history, created_at, last_login FROM users ORDER BY id');
    return result.rows;
  } catch (error) {
    console.error('读取用户数据失败:', error);
    return [];
  } finally {
    if (client) client.release();
  }
}

// 根据用户名查找用户
async function findUserByUsername(username) {
  let client;
  try {
    client = await getClient();
    const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('查找用户失败:', error);
    return null;
  } finally {
    if (client) client.release();
  }
}

// 创建新用户（密码自动加密）
async function createUser(username, password, preferences = {}) {
  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (username, password, preferences, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, username, preferences, created_at`,
      [username, hashedPassword, JSON.stringify(preferences)]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('创建用户失败:', error);
    return null;
  }
}

// 更新用户数据
async function updateUser(username, data) {
  try {
    // 字段名白名单，防止 SQL 注入
    const ALLOWED_KEYS = ['preferences', 'rating_history', 'favorites', 'blacklist', 'password'];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(data)) {
      if (!ALLOWED_KEYS.includes(key)) continue; // 跳过未知字段，防止 SQL 注入
      if (key === 'preferences' || key === 'rating_history') {
        sets.push(`${key} = $${idx}::jsonb`);
        values.push(typeof val === 'string' ? val : JSON.stringify(val));
      } else if (key === 'favorites' || key === 'blacklist') {
        sets.push(`${key} = $${idx}::integer[]`);
        // 确保数组元素都是数字
        const cleanVals = Array.isArray(val) ? val.filter(v => Number.isInteger(Number(v))).map(Number) : [];
        values.push(cleanVals.length > 0 ? `{${cleanVals.join(',')}}` : '{}');
      } else if (key === 'password') {
        if (typeof val !== 'string' || val.length < 6) continue; // 密码长度验证
        sets.push(`${key} = $${idx}`);
        values.push(await bcrypt.hash(val, SALT_ROUNDS));
      }
      idx++;
    }
    if (sets.length === 0) return false; // 没有有效字段要更新
    values.push(username);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE username = $${idx} RETURNING id, username, preferences, favorites, blacklist`,
      values
    );
    return result.rows[0] || false;
  } catch (error) {
    console.error('更新用户失败:', error);
    return false;
  }
}

// 验证登录（bcrypt 比对）
async function validateLogin(username, password) {
  let client;
  try {
    client = await getClient();
    const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return null;
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      await pool.query('UPDATE users SET last_login = NOW() WHERE username = $1', [username]);
      return user;
    }
    return null;
  } catch (error) {
    console.error('验证登录失败:', error);
    return null;
  } finally {
    if (client) client.release();
  }
}

// 删除用户
async function removeUser(username) {
  try {
    await pool.query('DELETE FROM users WHERE username = $1', [username]);
    return true;
  } catch (error) {
    console.error('删除用户失败:', error);
    return false;
  }
}

module.exports = {
  readUsers,
  findUserByUsername,
  createUser,
  updateUser,
  validateLogin,
  removeUser,
};