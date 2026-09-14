const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const outDir = path.join(dir, 'icons');
fs.mkdirSync(outDir, { recursive: true });

const SRC = path.join(dir, 'logo-mark.svg');
const PNG_SIZES = [16, 32, 48, 180, 512];

// ICO = 目录头(6) + 条目(16) + PNG 数据（Vista+ PNG 内嵌格式）
function writeIco(pngBuf, size) {
  const hdr = Buffer.alloc(6 + 16);
  hdr.writeUInt16LE(0, 0);   // reserved
  hdr.writeUInt16LE(1, 2);   // type: 1 = ICO
  hdr.writeUInt16LE(1, 4);   // image count
  hdr.writeUInt8(size, 6);   // width (256 → 0)
  hdr.writeUInt8(size, 7);   // height
  hdr.writeUInt8(0, 8);      // palette
  hdr.writeUInt8(0, 9);      // reserved
  hdr.writeUInt16LE(1, 10);  // planes
  hdr.writeUInt16LE(32, 12); // bpp
  hdr.writeUInt32LE(pngBuf.length, 14);
  hdr.writeUInt32LE(22, 18); // data offset
  fs.writeFileSync(path.join(outDir, 'favicon.ico'), Buffer.concat([hdr, pngBuf]));
}

(async () => {
  for (const s of PNG_SIZES) {
    await sharp(SRC).resize(s, s).png({ compressionLevel: 9 })
      .toFile(path.join(outDir, `icon-${s}x${s}.png`));
  }
  const buf32 = await sharp(SRC).resize(32, 32).png().toBuffer();
  writeIco(buf32, 32);
  console.log('icons ->', fs.readdirSync(outDir).join(', '));
})();

