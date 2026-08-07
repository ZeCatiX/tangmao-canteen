// 鍞愮尗搴�櫌 - 鏁版嵁杩佺Щ鑴氭湰锛欽SON 鏂囦欢 鈫?PostgreSQL
const fs = require('fs');
const path = require('path');
const pool = require('./db');

// 甯?BOM 鍓ョ�鐨?JSON 鏂囦欢璇诲彇
function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function migrate() {
  console.log('寮€濮嬭縼绉绘暟鎹?..');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 杩佺Щ鐢ㄦ埛鏁版嵁
  const usersPath = path.join(__dirname, 'users.json');
  if (fs.existsSync(usersPath)) {
    const users = readJSON(usersPath);
    console.log(`鎵惧埌 ${users.length} 涓�敤鎴穈);
    for (const u of users) {
      try {
        const favs = (u.favorites || []).length > 0 ? `{${u.favorites.join(',')}}` : '{}';
        const blks = (u.blacklist || []).length > 0 ? `{${u.blacklist.join(',')}}` : '{}';
        await client.query(
          `INSERT INTO users (username, password, preferences, favorites, blacklist, created_at, last_login)
           VALUES ($1, $2, $3::jsonb, $4::integer[], $5::integer[], $6, $7)
           ON CONFLICT (username) DO NOTHING`,
          [
            u.username,
            u.password || '',
            JSON.stringify(u.preferences || {}),
            favs,
            blks,
            u.createdAt || new Date().toISOString(),
            u.lastLogin || null,
          ]
        );
      } catch (e) {
        console.error(`  杩佺Щ鐢ㄦ埛 ${u.username} 澶辫触:`, e.message);
      }
    }
    console.log(`  宸茶縼绉?${users.length} 涓�敤鎴穈);
  }

  // 2. 杩佺Щ鍙嶉�鏁版嵁
  const fbPath = path.join(__dirname, 'feedback_data.json');
  if (fs.existsSync(fbPath)) {
    const feedbacks = readJSON(fbPath);
    console.log(`鎵惧埌 ${feedbacks.length} 鏉″弽棣坄);
    for (const f of feedbacks) {
      try {
        await client.query(
          `INSERT INTO feedback (dish_id, user_id, rating, user_preferences, created_at, processed)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
          [
            f.dishId || 0,
            f.user_id || null,
            f.rating || 0,
            JSON.stringify(f.user_preferences || {}),
            f.timestamp || new Date().toISOString(),
            f.processed || false,
          ]
        );
      } catch (e) {
        console.error(`  杩佺Щ鍙嶉�澶辫触:`, e.message);
      }
    }
    console.log(`  宸茶縼绉?${feedbacks.length} 鏉″弽棣坄);
  }

  // 3. 杩佺Щ鐢ㄦ埛鍋忓ソ
  const prefPath = path.join(__dirname, 'user_preferences.json');
  if (fs.existsSync(prefPath)) {
    const prefs = readJSON(prefPath);
    const entries = Object.entries(prefs);
    console.log(`鎵惧埌 ${entries.length} 涓�敤鎴峰亸濂絗);
    for (const [userId, p] of entries) {
      try {
        await client.query(
          `INSERT INTO user_preferences (user_id, taste_preferences, nutrition_preferences, price_preference, rating_history, updated_at)
           VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::jsonb, $6)
           ON CONFLICT (user_id) DO UPDATE SET
             taste_preferences = $2::jsonb,
             nutrition_preferences = $3::jsonb,
             price_preference = $4,
             rating_history = $5::jsonb,
             updated_at = $6`,
          [
            userId,
            JSON.stringify(p.taste_preferences || {}),
            JSON.stringify(p.nutrition_preferences || {}),
            p.price_preference || null,
            JSON.stringify(p.rating_history || []),
            p.lastUpdated || new Date().toISOString(),
          ]
        );
      } catch (e) {
        console.error(`  杩佺Щ鍋忓ソ ${userId} 澶辫触:`, e.message);
      }
    }
  }

  await client.query('COMMIT');
  console.log('\n迁移完成!');
  client.release();
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (e2) {}
    client.release();
    throw e;
  }
}

migrate().catch(e => { console.error('迁移失败:', e); process.exit(1); });