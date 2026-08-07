// 唐猫庭院 - 视觉分析工具
// 使用 sharp 分析菜品图片的详细信息
// 使用方式: node vision_analyze.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const UPLOADS_DIR = path.join(__dirname, 'uploads');

async function analyzeImages() {
  console.log('='.repeat(60));
  console.log('  唐猫庭院 - 菜品图片视觉分析');
  console.log('='.repeat(60));
  
  const files = fs.readdirSync(UPLOADS_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  console.log(`\n📸 共发现 ${files.length} 张菜品图片\n`);
  
  const results = [];
  let totalSize = 0;
  
  for (const file of files) {
    const filePath = path.join(UPLOADS_DIR, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    
    try {
      const metadata = await sharp(filePath).metadata();
      results.push({
        filename: file,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        sizeKB: Math.round(stats.size / 1024),
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha || false,
        space: metadata.space || 'unknown',
        density: metadata.density || 72,
      });
    } catch (err) {
      results.push({
        filename: file,
        error: err.message,
        sizeKB: Math.round(stats.size / 1024),
      });
    }
  }
  
  // 按文件大小排序
  results.sort((a, b) => (b.sizeKB || 0) - (a.sizeKB || 0));
  
  console.log('📊 图片文件统计');
  console.log('-'.repeat(40));
  console.log(`  总文件数: ${files.length}`);
  console.log(`  总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  平均大小: ${files.length > 0 ? Math.round(totalSize / 1024 / files.length) : 0} KB/张\n`);
  
  console.log('📊 图片尺寸分布');
  console.log('-'.repeat(60));
  console.log('  # | 文件名                        | 尺寸          | 格式  | 大小    | 色深');
  console.log('-'.repeat(60));
  
  results.forEach((r, i) => {
    const num = String(i + 1).padStart(2);
    const name = (r.filename.length > 30 ? r.filename.slice(0, 27) + '...' : r.filename).padEnd(30);
    if (r.error) {
      console.log(`  ${num} | ${name} | ❌ ${r.error}`);
    } else {
      const dims = `${r.width}x${r.height}`.padEnd(12);
      const fmt = (r.format || '').padEnd(5);
      const size = `${r.sizeKB}KB`.padEnd(7);
      const ch = r.hasAlpha ? `${r.channels}ch+α` : `${r.channels}ch`;
      console.log(`  ${num} | ${name} | ${dims} | ${fmt} | ${size} | ${ch}`);
    }
  });
  
  // 统计
  const landscape = results.filter(r => r.width && r.height && r.width > r.height).length;
  const portrait = results.filter(r => r.width && r.height && r.width < r.height).length;
  const square = results.filter(r => r.width && r.height && r.width === r.height).length;
  const large = results.filter(r => (r.width || 0) >= 1920 || (r.height || 0) >= 1920).length;
  
  console.log('\n📊 统计摘要');
  console.log('-'.repeat(40));
  console.log(`  横图: ${landscape} 张`);
  console.log(`  竖图: ${portrait} 张`);
  console.log(`  方图: ${square} 张`);
  console.log(`  高清(≥1920px): ${large} 张`);
  
  // 格式分布
  const formats = {};
  results.forEach(r => { if (r.format) formats[r.format] = (formats[r.format] || 0) + 1; });
  console.log('\n📊 格式分布');
  Object.entries(formats).forEach(([fmt, count]) => {
    console.log(`  ${fmt}: ${count} 张`);
  });
  
  // 图片优化建议
  const oversized = results.filter(r => r.sizeKB > 500);
  if (oversized.length > 0) {
    console.log('\n💡 优化建议');
    console.log('-'.repeat(40));
    console.log(`  以下 ${oversized.length} 张图片超过 500KB，建议压缩:`);
    oversized.forEach(r => console.log(`  - ${r.filename} (${r.sizeKB}KB)`));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('  分析完成!');
  console.log('='.repeat(60));
}

analyzeImages().catch(err => {
  console.error('分析失败:', err.message);
  process.exit(1);
});