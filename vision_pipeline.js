// 唐猫庭院 - 综合视觉分析流水线
// 集成了 sharp + puppeteer + pixelmatch + tesseract.js + image-size
// 提供全面的图像分析、截图、对比、OCR 和元数据提取能力
// 使用方式: node vision_pipeline.js [command] [options]

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const sizeOf = require('image-size');

// 延迟加载（非核心依赖）
let puppeteer, pixelmatch, Tesseract, PNG;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const REPORTS_DIR = path.join(__dirname, 'vision_reports');
const SCREENSHOTS_DIR = path.join(__dirname, 'vision_screenshots');

// 确保目录存在
[REPORTS_DIR, SCREENSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ========== 工具函数 ==========

function bytesToSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function log(message, type = 'INFO') {
  console.log(`[${new Date().toLocaleTimeString()}] [${type}] ${message}`);
}

// ========== 1. 图片元数据全面分析 ==========

async function analyzeMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'].includes(ext)) {
    return null;
  }

  const stats = fs.statSync(filePath);
  const metadata = {};
  
  try {
    // 使用 sharp 获取详细元数据
    const sharpMeta = await sharp(filePath).metadata();
    metadata.sharp = {
      width: sharpMeta.width,
      height: sharpMeta.height,
      format: sharpMeta.format,
      size: sharpMeta.size || stats.size,
      channels: sharpMeta.channels,
      hasAlpha: sharpMeta.hasAlpha || false,
      space: sharpMeta.space || 'unknown',
      density: sharpMeta.density || 72,
      chromaSubsampling: sharpMeta.chromaSubsampling || 'unknown',
      isProgressive: sharpMeta.isProgressive || false,
    };
  } catch (e) {
    metadata.sharpError = e.message;
  }

  try {
    // 使用 image-size 获取尺寸
    const dims = sizeOf(filePath);
    metadata.dimensions = { width: dims.width, height: dims.height, type: dims.type };
  } catch (e) {
    metadata.dimensionsError = e.message;
  }

  metadata.file = {
    name: path.basename(filePath),
    path: filePath,
    size: stats.size,
    sizeHuman: bytesToSize(stats.size),
    created: stats.birthtime,
    modified: stats.mtime,
    extension: path.extname(filePath).toLowerCase(),
  };

  // 计算宽高比和方向
  if (metadata.sharp && !metadata.sharpError) {
    const w = metadata.sharp.width;
    const h = metadata.sharp.height;
    metadata.aspectRatio = (w / h).toFixed(4);
    metadata.orientation = w > h ? 'landscape' : w < h ? 'portrait' : 'square';
    metadata.megapixels = ((w * h) / 1000000).toFixed(2);
  }

  return metadata;
}

async function analyzeAllImages() {
  log('开始全面图片分析...');
  
  const files = fs.readdirSync(UPLOADS_DIR).filter(f => 
    /\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/i.test(f)
  );
  
  log(`发现 ${files.length} 张图片`);
  
  const results = [];
  let totalSize = 0;
  
  for (const file of files) {
    const filePath = path.join(UPLOADS_DIR, file);
    const meta = await analyzeMetadata(filePath);
    if (meta) {
      results.push(meta);
      totalSize += meta.file.size;
    }
  }

  // 生成统计报告
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: results.length,
      totalSize: totalSize,
      totalSizeHuman: bytesToSize(totalSize),
      averageSize: results.length > 0 ? bytesToSize(totalSize / results.length) : '0 B',
    },
    distribution: {
      byFormat: {},
      byOrientation: { landscape: 0, portrait: 0, square: 0 },
      bySize: { small: 0, medium: 0, large: 0, huge: 0 },
      byResolution: { sd: 0, hd: 0, fullHd: 0, ultraHd: 0 },
    },
    oversized: [],
    images: results.map(r => ({
      name: r.file.name,
      size: r.file.sizeHuman,
      rawSize: r.file.size,
      dimensions: r.sharp ? `${r.sharp.width}x${r.sharp.height}` : 'unknown',
      format: r.sharp?.format || r.dimensions?.type || 'unknown',
      orientation: r.orientation || 'unknown',
      aspectRatio: r.aspectRatio || 'unknown',
      megapixels: r.megapixels || 'unknown',
      density: r.sharp?.density || 72,
      hasAlpha: r.sharp?.hasAlpha || false,
    })),
  };

  // 统计分布
  results.forEach(r => {
    if (r.sharp) {
      // 格式
      report.distribution.byFormat[r.sharp.format] = (report.distribution.byFormat[r.sharp.format] || 0) + 1;
      // 方向
      if (report.distribution.byOrientation[r.orientation] !== undefined) {
        report.distribution.byOrientation[r.orientation]++;
      }
      // 大小
      const sizeKB = r.file.size / 1024;
      if (sizeKB < 100) report.distribution.bySize.small++;
      else if (sizeKB < 500) report.distribution.bySize.medium++;
      else if (sizeKB < 1000) report.distribution.bySize.large++;
      else report.distribution.bySize.huge++;
      // 分辨率
      const maxDim = Math.max(r.sharp.width, r.sharp.height);
      if (maxDim < 720) report.distribution.byResolution.sd++;
      else if (maxDim < 1280) report.distribution.byResolution.hd++;
      else if (maxDim < 1920) report.distribution.byResolution.fullHd++;
      else report.distribution.byResolution.ultraHd++;
      // 超大图片
      if (sizeKB > 500) {
        report.oversized.push({ name: r.file.name, size: r.file.sizeHuman, dimensions: `${r.sharp.width}x${r.sharp.height}` });
      }
    }
  });

  // 保存报告
  const reportFile = path.join(REPORTS_DIR, `vision_analysis_${timestamp()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  log(`分析报告已保存: ${reportFile}`);

  // 打印摘要
  console.log('\n' + '='.repeat(60));
  console.log('  图片分析摘要');
  console.log('='.repeat(60));
  console.log(`  总文件数: ${report.summary.totalFiles}`);
  console.log(`  总大小: ${report.summary.totalSizeHuman}`);
  console.log(`  平均大小: ${report.summary.averageSize}`);
  console.log(`\n  格式分布: ${JSON.stringify(report.distribution.byFormat)}`);
  console.log(`  方向分布: ${JSON.stringify(report.distribution.byOrientation)}`);
  console.log(`  大小分布: 小(${report.distribution.bySize.small}) 中(${report.distribution.bySize.medium}) 大(${report.distribution.bySize.large}) 超大(${report.distribution.bySize.huge})`);
  console.log(`  分辨率分布: SD(${report.distribution.byResolution.sd}) HD(${report.distribution.byResolution.hd}) FullHD(${report.distribution.byResolution.fullHd}) UltraHD(${report.distribution.byResolution.ultraHd})`);
  if (report.oversized.length > 0) {
    console.log(`\n  ⚠ 超大图片 (${report.oversized.length}张):`);
    report.oversized.forEach(o => console.log(`    - ${o.name} (${o.size}, ${o.dimensions})`));
  }
  console.log('='.repeat(60));

  return report;
}

// ========== 2. 图片压缩和优化 ==========

async function optimizeImage(inputPath, options = {}) {
  const {
    width = null,
    height = null,
    quality = 80,
    format = null,
    outputDir = null,
  } = options;

  const ext = path.extname(inputPath).toLowerCase();
  const basename = path.basename(inputPath, ext);
  const outDir = outputDir || path.join(__dirname, 'uploads_optimized');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let pipeline = sharp(inputPath);

  // 调整大小
  if (width || height) {
    pipeline = pipeline.resize(width, height, { fit: 'inside', withoutEnlargement: true });
  }

  // 格式转换
  const outExt = format ? `.${format}` : ext;
  const outputPath = path.join(outDir, `${basename}_optimized${outExt}`);

  switch (format || ext.slice(1)) {
    case 'jpg':
    case 'jpeg':
      await pipeline.jpeg({ quality, mozjpeg: true }).toFile(outputPath);
      break;
    case 'png':
      await pipeline.png({ compressionLevel: 9, palette: true }).toFile(outputPath);
      break;
    case 'webp':
      await pipeline.webp({ quality }).toFile(outputPath);
      break;
    case 'avif':
      await pipeline.avif({ quality }).toFile(outputPath);
      break;
    default:
      await pipeline.jpeg({ quality }).toFile(outputPath);
  }

  const originalSize = fs.statSync(inputPath).size;
  const optimizedSize = fs.statSync(outputPath).size;
  const savings = ((1 - optimizedSize / originalSize) * 100).toFixed(1);

  log(`优化完成: ${path.basename(inputPath)} -> ${path.basename(outputPath)} (节省 ${savings}%)`);
  
  return { inputPath, outputPath, originalSize, optimizedSize, savings: `${savings}%` };
}

async function batchOptimize(options = {}) {
  log('开始批量图片优化...');
  
  const files = fs.readdirSync(UPLOADS_DIR).filter(f => 
    /\.(jpg|jpeg|png|gif|webp)$/i.test(f)
  );
  
  const results = [];
  for (const file of files.slice(0, 50)) { // 限制批处理数量
    const result = await optimizeImage(path.join(UPLOADS_DIR, file), options);
    results.push(result);
  }
  
  const totalSavings = results.reduce((sum, r) => sum + parseFloat(r.savings), 0);
  const avgSavings = results.length > 0 ? (totalSavings / results.length).toFixed(1) : 0;
  
  log(`批量优化完成: ${results.length} 张图片, 平均节省 ${avgSavings}%`);
  return results;
}

// ========== 3. 图片对比 (pixelmatch) ==========

async function compareImages(img1Path, img2Path, outputPath = null) {
  try {
    pixelmatch = pixelmatch || require('pixelmatch');
    PNG = PNG || require('pngjs').PNG;
  } catch (e) {
    log('pixelmatch 或 pngjs 未安装，请运行: npm install pixelmatch pngjs', 'ERROR');
    return null;
  }

  // 读取并统一尺寸
  const img1 = sharp(img1Path);
  const img2 = sharp(img2Path);
  const meta1 = await img1.metadata();
  const meta2 = await img2.metadata();

  const maxW = Math.max(meta1.width, meta2.width);
  const maxH = Math.max(meta1.height, meta2.height);

  const buf1 = await img1.resize(maxW, maxH).raw().toBuffer();
  const buf2 = await img2.resize(maxW, maxH).raw().toBuffer();
  const diff = new PNG({ width: maxW, height: maxH });

  const numDiffPixels = pixelmatch(buf1, buf2, diff.data, maxW, maxH, {
    threshold: 0.1,
    includeAA: true,
    alpha: 0.5,
    diffColor: [255, 0, 0],
  });

  const diffPercent = ((numDiffPixels / (maxW * maxH)) * 100).toFixed(2);

  if (outputPath) {
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    // 保存差异图
    const diffPng = await sharp(diff.data, { raw: { width: maxW, height: maxH, channels: 4 } })
      .png()
      .toBuffer();
    fs.writeFileSync(outputPath, diffPng);
    log(`差异图已保存: ${outputPath}`);
  }

  log(`图片对比: ${diffPercent}% 像素不同 (${numDiffPixels}/${maxW * maxH})`);
  
  return {
    image1: path.basename(img1Path),
    image2: path.basename(img2Path),
    width: maxW,
    height: maxH,
    numDiffPixels,
    diffPercent: `${diffPercent}%`,
    totalPixels: maxW * maxH,
  };
}

// ========== 4. OCR 文字识别 ==========

async function recognizeText(imagePath, options = {}) {
  const { lang = 'chi_sim+eng' } = options;

  try {
    Tesseract = Tesseract || require('tesseract.js');
  } catch (e) {
    log('tesseract.js 未安装', 'ERROR');
    return null;
  }

  log(`开始 OCR 识别: ${path.basename(imagePath)} (语言: ${lang})`);
  
  const startTime = Date.now();
  const { data } = await Tesseract.recognize(imagePath, lang, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r  识别进度: ${(m.progress * 100).toFixed(0)}%`);
      }
    },
  });
  process.stdout.write('\n');
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const result = {
    image: path.basename(imagePath),
    text: data.text,
    confidence: data.confidence,
    words: data.words?.length || 0,
    lines: data.lines?.length || 0,
    paragraphs: data.paragraphs?.length || 0,
    elapsed: `${elapsed}s`,
    blocks: data.blocks?.map(b => ({
      text: b.text,
      confidence: b.confidence,
      bbox: b.bbox,
      lines: b.lines?.map(l => ({ text: l.text, confidence: l.confidence })),
    })) || [],
  };

  log(`OCR 完成: ${data.words?.length || 0} 个词, 置信度 ${data.confidence?.toFixed(1) || 0}% (耗时 ${elapsed}s)`);
  
  if (data.text.trim()) {
    console.log('\n识别文本:');
    console.log('-'.repeat(40));
    console.log(data.text.trim().slice(0, 500));
    console.log('-'.repeat(40));
  }

  return result;
}

// ========== 5. 网页截图 (puppeteer) ==========

async function captureScreenshot(url, outputPath = null, options = {}) {
  const { width = 1280, height = 720, fullPage = false, type = 'png' } = options;

  try {
    puppeteer = puppeteer || require('puppeteer');
  } catch (e) {
    log('puppeteer 未安装', 'ERROR');
    return null;
  }

  log(`开始截图: ${url}`);
  
  const isDocker = process.env.NODE_ENV === 'production' || process.env.LOCAL !== 'true';
  const browser = await puppeteer.launch({
    headless: true,
    args: isDocker ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  const outPath = outputPath || path.join(SCREENSHOTS_DIR, `screenshot_${timestamp()}.${type}`);
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  await page.screenshot({ path: outPath, fullPage, type });
  await browser.close();

  const fileSize = fs.statSync(outPath).size;
  log(`截图完成: ${path.basename(outPath)} (${bytesToSize(fileSize)})`);

  return { url, outputPath: outPath, size: fileSize, sizeHuman: bytesToSize(fileSize), width, height };
}

// ========== 6. 生成视觉报告 (HTML) ==========

function generateHtmlReport(analysisReport, outputPath = null) {
  const outPath = outputPath || path.join(REPORTS_DIR, `vision_report_${timestamp()}.html`);
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const formatRows = Object.entries(analysisReport.distribution.byFormat)
    .map(([fmt, count]) => `<tr><td>${fmt.toUpperCase()}</td><td>${count}</td></tr>`).join('');

  const orientationRows = Object.entries(analysisReport.distribution.byOrientation)
    .map(([dir, count]) => `<tr><td>${dir}</td><td>${count}</td></tr>`).join('');

  const oversizedRows = (analysisReport.oversized || [])
    .map(o => `<tr><td>${o.name}</td><td>${o.size}</td><td>${o.dimensions}</td></tr>`).join('');

  const imagesTable = analysisReport.images.map(img => `
    <tr>
      <td>${img.name}</td>
      <td>${img.dimensions}</td>
      <td>${img.format}</td>
      <td>${img.size}</td>
      <td>${img.orientation}</td>
      <td>${img.megapixels}MP</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>唐猫庭院 - 视觉分析报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #c0392b; border-bottom: 3px solid #c0392b; padding-bottom: 10px; margin-bottom: 20px; }
    h2 { color: #e67e22; margin: 20px 0 10px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    .card .value { font-size: 28px; font-weight: bold; color: #c0392b; }
    .card .label { font-size: 14px; color: #666; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    th, td { padding: 10px 15px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #c0392b; color: white; font-weight: 600; }
    tr:hover { background: #fdf2f2; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .timestamp { color: #999; font-size: 12px; margin-top: 20px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 唐猫庭院 - 视觉分析报告</h1>
    <p>生成时间: ${new Date(analysisReport.generatedAt).toLocaleString('zh-CN')}</p>

    <h2>📈 概要统计</h2>
    <div class="summary">
      <div class="card"><div class="value">${analysisReport.summary.totalFiles}</div><div class="label">图片总数</div></div>
      <div class="card"><div class="value">${analysisReport.summary.totalSizeHuman}</div><div class="label">总大小</div></div>
      <div class="card"><div class="value">${analysisReport.summary.averageSize}</div><div class="label">平均大小</div></div>
    </div>

    <h2>📐 格式分布</h2>
    <table><thead><tr><th>格式</th><th>数量</th></tr></thead><tbody>${formatRows}</tbody></table>

    <h2>🧭 方向分布</h2>
    <table><thead><tr><th>方向</th><th>数量</th></tr></thead><tbody>${orientationRows}</tbody></table>

    ${analysisReport.oversized.length > 0 ? `
    <h2>⚠️ 超大图片 (>500KB)</h2>
    <table><thead><tr><th>文件名</th><th>大小</th><th>尺寸</th></tr></thead><tbody>${oversizedRows}</tbody></table>
    ` : ''}

    <h2>🖼️ 所有图片详情</h2>
    <table>
      <thead><tr><th>文件名</th><th>尺寸</th><th>格式</th><th>大小</th><th>方向</th><th>像素</th></tr></thead>
      <tbody>${imagesTable}</tbody>
    </table>

    <div class="timestamp">唐猫庭院视觉分析系统 | ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;

  fs.writeFileSync(outPath, html);
  log(`HTML 报告已生成: ${outPath}`);
  return outPath;
}

// ========== 主函数 ==========

async function main() {
  const command = process.argv[2] || 'analyze';
  
  switch (command) {
    case 'analyze':
      // 全面分析图片
      const report = await analyzeAllImages();
      generateHtmlReport(report);
      break;

    case 'optimize':
      // 批量优化图片
      await batchOptimize({
        quality: parseInt(process.argv[3]) || 80,
        format: process.argv[4] || null,
      });
      break;

    case 'compare':
      // 对比两张图片
      if (!process.argv[3] || !process.argv[4]) {
        console.log('用法: node vision_pipeline.js compare <图片1> <图片2> [输出路径]');
        process.exit(1);
      }
      await compareImages(
        path.join(UPLOADS_DIR, process.argv[3]),
        path.join(UPLOADS_DIR, process.argv[4]),
        process.argv[5] || null
      );
      break;

    case 'ocr':
      // OCR 识别
      if (!process.argv[3]) {
        console.log('用法: node vision_pipeline.js ocr <图片路径> [语言]');
        process.exit(1);
      }
      const inputPath = path.resolve(process.argv[3]);
      // 限制路径必须在项目目录内
      if (!inputPath.startsWith(__dirname)) {
        console.log('❌ 路径必须在项目目录内');
        process.exit(1);
      }
      await recognizeText(
        inputPath,
        { lang: process.argv[4] || 'chi_sim+eng' }
      );
      break;

    case 'screenshot':
      // 网页截图
      const url = process.argv[3] || 'http://localhost:3000';
      // 仅允许 HTTP/HTTPS 协议
      if (!/^https?:\/\//i.test(url)) {
        console.log('❌ 仅支持 HTTP/HTTPS 协议的 URL');
        process.exit(1);
      }
      await captureScreenshot(url, process.argv[4]);
      break;

    case 'full':
      // 全流程运行
      log('开始全流程视觉分析...');
      const fullReport = await analyzeAllImages();
      generateHtmlReport(fullReport);
      
      // 对前3张最大图片进行 OCR（按原始字节数排序）
      const sortedImages = [...fullReport.images].sort((a, b) => {
        const sizeA = a.rawSize || 0;
        const sizeB = b.rawSize || 0;
        return sizeB - sizeA;
      });
      
      for (const img of sortedImages.slice(0, 3)) {
        const imgPath = path.join(UPLOADS_DIR, img.name);
        if (fs.existsSync(imgPath)) {
          try {
            await recognizeText(imgPath, { lang: 'chi_sim' });
          } catch (e) {
            log(`OCR 失败: ${img.name} - ${e.message}`, 'WARN');
          }
        }
      }
      
      log('全流程视觉分析完成!');
      break;

    default:
      console.log(`
用法: node vision_pipeline.js <command> [options]

命令:
  analyze                 全面分析所有图片元数据并生成报告
  optimize [质量] [格式]  批量优化图片 (质量: 1-100, 默认80)
  compare <图1> <图2>     对比两张图片
  ocr <图片路径> [语言]     OCR 文字识别 (语言: chi_sim, eng, chi_sim+eng)
  screenshot [url] [路径]  网页截图
  full                    全流程运行 (分析+报告+OCR)

示例:
  node vision_pipeline.js analyze
  node vision_pipeline.js optimize 85 webp
  node vision_pipeline.js compare dish1.jpg dish2.jpg
  node vision_pipeline.js ocr uploads/tangmao_葫芦鸡.png chi_sim
  node vision_pipeline.js screenshot http://localhost:3000
  node vision_pipeline.js full
`);
  }
}

main().catch(err => {
  console.error('\n❌ 错误:', err.message);
  process.exit(1);
});