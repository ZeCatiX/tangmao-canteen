#!/usr/bin/env node
// 菜品图缩略图生成（B6）：uploads/tangmao_*.{jpg,jpeg,png,webp} -> uploads/thumbs/<名>.webp 宽420
// 用法: node scripts/gen_thumbs.js；admin 上传新图时亦会自动生成单张
'use strict';
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const uploads = path.join(root, 'uploads');
const thumbs = path.join(uploads, 'thumbs');
const sharp = require('sharp');

async function makeThumb(src, dst) {
  await sharp(src).rotate().resize({ width: 420, withoutEnlargement: true }).webp({ quality: 78 }).toFile(dst);
}

async function main() {
  fs.mkdirSync(thumbs, { recursive: true });
  let made = 0, skipped = 0;
  for (const f of fs.readdirSync(uploads)) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    const src = path.join(uploads, f);
    const dst = path.join(thumbs, f.replace(/\.[^.]+$/, '') + '.webp');
    if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) { skipped++; continue; }
    try { await makeThumb(src, dst); made++; }
    catch (e) { console.error('跳过', f, e.message); }
  }
  console.log(`缩略图完成: 新生成 ${made}，已最新 ${skipped} -> ${thumbs}`);
}
main().catch(e => { console.error(e); process.exit(1); });
