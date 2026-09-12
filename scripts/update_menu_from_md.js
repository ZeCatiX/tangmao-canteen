// 按 唐猫庭院_完整菜单.md 更新数据库 dishes 表
// 用法: node scripts/update_menu_from_md.js [--dry-run] [--execute]
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ROOT = 'D:/食堂网页';
const MD = path.join(ROOT, '唐猫庭院_完整菜单.md');
const IMG_BASE = path.join(ROOT, '唐猫菜品', '20260728唐猫庭院菜品汇总');
const UPLOADS = path.join(ROOT, 'uploads');

const DRY = !process.argv.includes('--execute');

// 分类映射: .md 章节 → 数据库 category
const CAT_MAP = {
  '主食': '主食',
  '招牌与游西安必打卡': '招牌与游西安必打卡',
  '招牌与必打卡': '招牌与游西安必打卡',
  '陕西小吃': '陕西小吃',
  '特色凉菜': '特色凉菜',
  '热销菜品': '热销菜品',
  '传承陕菜': '传承陕菜',
  '田园时蔬·汤羹': '田园时蔬·汤羹',
  '江湖海鲜': '江湖海鲜',
  '飲品与酒水': '飲品与酒水',
};

// 饮品子分类 emoji
const DRINK_EMOJI = {
  '特调饮品': '🍸', '花酒天地': '🥂', '茶饮': '🍵', '一醉千年': '🏺',
  '葡萄酒': '🍷', '液态面包（啤酒）': '🍺', '缤纷饮品': '🍹',
};

// 别名映射（菜名→图片文件名核心词）
const ALIAS = {
  '嫩豌豆拌核桃仁': '蜜豆桃仁', '清炒时蔬': '清炒油菜苔',
  '唐僧望塔酥': '望塔酥', '大唐妃子笑': '妃子笑',
  '唐猫酸汤锅子鱼': '锅子鱼', '鎮巴山笋炒腊肉': '镇巴山笋炒腊肉', '鎇巴香肠': '镇巴香肠',
  '渭南酒碟子': '渭北酒碟子', '醋泡花生米': '老醋泡花生',
  '油泼香椿鳝丝': '油泼鳝丝', '鮮玉米糕': '玉米糕', '鲜玉米糕': '玉米糕',
  '石锅凉粉': '炒凉粉',
};

// 无图菜品 emoji 映射
const NO_IMG_EMOJI = {
  '五常大米饭': '🍚', '迷你肉夹馍': '🥟', '回坊酸辣汤': '🍲',
  '椰椰肉': '🥥', '镇巴香肠': '🌭', '鎇巴香肠': '🌭', '香辣陕南豆干': '🧆',
};

function parseMd() {
  const txt = fs.readFileSync(MD, 'utf8');
  const lines = txt.split('\n');
  const dishes = [];
  let cat = null, subCat = null;
  for (let line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) { cat = m[1].replace(/^.*?\s/, '').trim(); subCat = null; continue; }
    const sm = line.match(/^###\s+(.+)$/);
    if (sm) { subCat = sm[1].trim(); continue; }
    const cols = line.split('|').map(c=>c.replace(/\*/g,'').trim()).filter((_,i,a)=>i>0 && i<a.length-1);
    if (cols.length >= 2 && cat && CAT_MAP[cat]) {
      const name = cols[0];
      if (name.includes('菜品') || name.includes('---') || name.includes('规格') || name.includes('门店')) continue;
      let price = null, unit = '', note = '';
      for (let i=1;i<cols.length;i++) {
        const pm = cols[i].match(/(\d+(?:\.\d+)?)\s*元\s*(\/[^\s|]*)?/);
        if (pm && price===null) { price = parseFloat(pm[1]); unit = pm[2]||''; }
        else if (cols[i] && !cols[i].match(/^[\d.]+(ml|g|听|瓶|壶|盖碗)$/i) && !note && cols[i]!=='—') { note = cols[i]; }
      }
      if (!price) continue;
      const category = CAT_MAP[cat];
      const isDrink = category === '飲品与酒水';
      const emoji = isDrink ? (subCat && DRINK_EMOJI[subCat] || '🥤') : null;
      dishes.push({ name, price, unit, category, note, isDrink, emoji, subCat });
    }
  }
  return dishes;
}

function findImage(dish) {
  if (dish.isDrink) return null; // 饮品用 emoji
  if (dish.name === '五常大米饭') return null; // 无图
  const core = ALIAS[dish.name] || dish.name.replace(/^(大唐|唐猫|唐僧)/, '');
  // 全局搜所有子目录（菜品图片可能在别的分类子目录）
  const subDirs = fs.existsSync(IMG_BASE) ? fs.readdirSync(IMG_BASE, {withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name) : [];
  let candidates = [];
  for (const sub of subDirs) {
    const dir = path.join(IMG_BASE, sub);
    for (const f of fs.readdirSync(dir)) {
      if (f.includes(core)) candidates.push(path.join(dir, f));
    }
  }
  if (!candidates.length) return null;
  const pref = f => (/-竖/.test(f) ? 0 : /小图/.test(f) ? 1 : /\.png$/i.test(f) ? 2 : 3);
  candidates.sort((a, b) => pref(a) - pref(b));
  return candidates[0];
}

function copyImage(dish, srcPath) {
  if (!srcPath) return null;
  const ext = path.extname(srcPath).toLowerCase();
  const safeName = dish.name.replace(/[\\/:*?"<>|]/g, '_');
  const dest = `tangmao_${safeName}${ext}`;
  const destPath = path.join(UPLOADS, dest);
  if (!fs.existsSync(destPath)) fs.copyFileSync(srcPath, destPath);
  return `/uploads/${dest}`;
}

async function main() {
  const dishes = parseMd();
  console.log(`解析到 ${dishes.length} 道菜（含饮品 ${dishes.filter(d=>d.isDrink).length}）`);

  // 匹配图片
  const report = [];
  for (const d of dishes) {
    const img = findImage(d);
    const imgUrl = d.isDrink ? (d.emoji ? `emoji:${d.emoji}` : null) : (img ? copyImage(d, img) : (NO_IMG_EMOJI[d.name] ? `emoji:${NO_IMG_EMOJI[d.name]}` : null));
    report.push({ ...d, imgSrc: img ? path.basename(img) : (d.isDrink ? `emoji:${d.emoji}` : '无图'), imageUrl: imgUrl });
  }

  console.log('\n=== 匹配报告 ===');
  for (const r of report) {
    console.log(`[${r.category}] ${r.name} ${r.price}元 ${r.note?'('+r.note+')':''} → ${r.imgSrc}`);
  }

  if (DRY) {
    console.log('\n[DRY-RUN] 未执行 SQL。加 --execute 实际更新数据库。');
    const noImg = report.filter(r => !r.imageUrl && !r.isDrink);
    if (noImg.length) console.log('\n无图菜品:', noImg.map(r=>r.name).join(', '));
    return;
  }

  // SQL 执行（事务：DELETE ALL + INSERT 110）
  const pool = new Pool({ host:'localhost', port:5432, database:'tangmao', user:'postgres', password:'TangMao2026!' });
  const client = await pool.connect();
  try {
    // 备份（已存在则跳过）
    const bkExists = await client.query("SELECT to_regclass('dishes_backup_20260824')");
    if (!bkExists.rows[0].to_regclass) {
      await client.query('CREATE TABLE dishes_backup_20260824 AS SELECT * FROM dishes');
      console.log('已备份 dishes → dishes_backup_20260824');
    } else {
      console.log('备份表已存在，跳过');
    }

    await client.query('BEGIN');
    await client.query('ALTER TABLE dishes ADD COLUMN IF NOT EXISTS price_unit VARCHAR(20)');
    await client.query('DELETE FROM dishes');
    for (const d of report) {
      // 饮品 emoji 直接存 image_url（script.js 渲染时判断）
      const imageUrl = d.imageUrl ? (d.imageUrl.startsWith('emoji:') ? d.imageUrl.split(':')[1] : d.imageUrl) : null;
      // 招牌菜 tags 加'招牌'; 饮品 tags 加子分类
      const tags = [];
      if (d.category === '招牌') tags.push('招牌');
      if (d.isDrink && d.subCat) tags.push(d.subCat);
      await client.query(
        `INSERT INTO dishes (name, category, price, price_unit, image_url, spiciness, saltiness, sweetness, religion, is_halal, is_vegetarian, is_active, description, tags)
         VALUES ($1,$2,$3,$4,$5,'不辣','适中','无味','无特殊要求',false,false,true,$6,$7)`,
        [d.name, d.category, d.price, d.unit || null, imageUrl, d.note || null, tags.length?`{${tags.join(',')}}`:'{}']
      );
    }
    await client.query('COMMIT');
    console.log(`已 INSERT ${report.length} 道菜（事务提交）`);

    const cats = await client.query('SELECT category, COUNT(*) FROM dishes GROUP BY category ORDER BY category');
    console.log('\n=== 更新后分类计数 ===');
    cats.rows.forEach(r => console.log(`${r.category}: ${r.count}`));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('事务回滚:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
