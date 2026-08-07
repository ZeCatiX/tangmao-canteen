// 修复 admin.html 中的乱码（mojibake）→ 正确中文
// 一次性批量替换，基于上下文恢复原始文本
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'admin.html');
let html = fs.readFileSync(file, 'utf8');

// 统一读取工具显示为乱码的字符。文件实际是 UTF-8，但乱码字符是 U+FFFD 或被双重编码
// 这里根据 grep/read 见到的字面文本做替换
const replacements = [
  // ── 用户管理页 ──
  ['<div class="card-header">Ã—Â¢Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃƒÂ»Ã¯Â¿Â½</div>', '<div class="card-header">全部用户</div>'],
  ['<thead><tr><th>ID</th><th>Ã¯Â¿Â½ÃƒÂ»Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</th><th>Ã—Â¢Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ±Ã¯Â¿Â½Ã¯Â¿Â½</th><th>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‚Â¼</th><th>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</th></tr></thead>',
   '<thead><tr><th>ID</th><th>用户名</th><th>注册时间</th><th>最后登录</th><th>操作</th></tr></thead>'],
  // ── 菜品弹窗 ──
  ['<h5 class="modal-title" id="dishModalTitle">Ã¯Â¿Â½Ã¯Â¿Â½Ã“Â²Ã¯Â¿Â½Ã†Â·</h5>', '<h5 class="modal-title" id="dishModalTitle">添加菜品</h5>'],
  ['<label class="form-label" for="dish-name">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label><input class="form-control" id="dish-name" placeholder="Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½">',
   '<label class="form-label" for="dish-name">菜品名称</label><input class="form-control" id="dish-name" placeholder="请输入菜品名称">'],
  ['<label class="form-label" for="dish-description">Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â·Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label class="form-label" for="dish-description">菜品描述</label>'],
  ['placeholder="Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â·Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ³Ã¯Â¿Â½Ã„Â¡Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‰Â«..."', 'placeholder="请输入菜品描述，如特色、口味等..."'],
  ['<label class="form-label" for="dish-category">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label class="form-label" for="dish-category">分类</label>'],
  ['<option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â·</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‚Â²Ã¯Â¿Â½</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã‰Â«Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã”Â°ÃŠÂ±Ã¯Â¿Â½Ã¯Â¿Â½</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃÂ¡Ã¯Â¿Â½Ã¯Â¿Â½</option>',
   '<option>热菜</option><option>凉菜凉拌</option><option>汤粥糖水</option><option>主食小吃</option><option>甜品饮品</option><option>海鲜水产</option><option>清爽素食</option>'],
  ['<label class="form-label" for="dish-spiciness">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label><select class="form-select" id="dish-spiciness"><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</option><option selected>ÃŽÂ¢Ã¯Â¿Â½Ã¯Â¿Â½</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</option></select>',
   '<label class="form-label" for="dish-spiciness">辣度</label><select class="form-select" id="dish-spiciness"><option>不辣</option><option selected>微辣</option><option>中辣</option><option>特辣</option></select>'],
  ['<label class="form-label" for="dish-price">Ã¯Â¿Â½Ã›Â¸Ã¯Â¿Â½Ã”ÂªÃ¯Â¿Â½Ã¯Â¿Â½</label>', '<label class="form-label" for="dish-price">价格（元）</label>'],
  ['<label class="form-label" for="dish-rating">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label class="form-label" for="dish-rating">评分</label>'],
  ['<label class="form-label" for="dish-saltiness">Ã¯Â¿Â½ÃŒÂµÃ¯Â¿Â½</label><select class="form-select" id="dish-saltiness"><option>Ã¯Â¿Â½Ã¥ÂµÂ­</option><option selected>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</option><option>Ã†Â«Ã¯Â¿Â½Ã¯Â¿Â½</option></select>',
   '<label class="form-label" for="dish-saltiness">咸淡</label><select class="form-select" id="dish-saltiness"><option>偏淡</option><option selected>适中</option><option>偏咸</option></select>'],
  ['<label class="form-label" for="dish-sweetness">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label><select class="form-select" id="dish-sweetness"><option selected>Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂ¶</option><option>Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂ¶</option><option>Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂ¶</option><option>Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</option></select>',
   '<label class="form-label" for="dish-sweetness">甜酸</label><select class="form-select" id="dish-sweetness"><option selected>无味</option><option>微甜</option><option>酸甜</option><option>偏甜</option></select>'],
  ['<label class="form-label">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã”Â´</label>', '<label class="form-label">过敏原</label>'],
  ['<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-seafood" style="margin-right:3px;cursor:pointer;">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-seafood" style="margin-right:3px;cursor:pointer;">海鲜</label>'],
  ['<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-peanut" style="margin-right:3px;cursor:pointer;">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-peanut" style="margin-right:3px;cursor:pointer;">花生</label>'],
  ['<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-egg" style="margin-right:3px;cursor:pointer;">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-egg" style="margin-right:3px;cursor:pointer;">鸡蛋</label>'],
  ['<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-gluten" style="margin-right:3px;cursor:pointer;">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-gluten" style="margin-right:3px;cursor:pointer;">麸质</label>'],
  ['<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-soy" style="margin-right:3px;cursor:pointer;">Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-allergy-soy" style="margin-right:3px;cursor:pointer;">大豆</label>'],
  ['<label class="form-label" style="display:block;">Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ³Ã’ÂªÃ¯Â¿Â½Ã¯Â¿Â½</label>', '<label class="form-label" style="display:block;">饮食要求</label>'],
  ['<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-halal" style="margin-right:3px;cursor:pointer;">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-halal" style="margin-right:3px;cursor:pointer;">清真</label>'],
  ['<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-vegetarian" style="margin-right:3px;cursor:pointer;">Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ³</label>', '<label style="font-size:0.82rem;font-weight:400;"><input type="checkbox" id="dish-vegetarian" style="margin-right:3px;cursor:pointer;">素食</label>'],
  ['<label class="form-label" for="dish-tags">Ã¯Â¿Â½Ã¯Â¿Â½Ã‡Â©Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã…Â·Ã–Â¸Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label class="form-label" for="dish-tags">标签（逗号分隔）</label>'],
  ['placeholder="Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½, ÃŽÂ¢Ã¯Â¿Â½Ã¯Â¿Â½"', 'placeholder="招牌, 微辣"'],
  ['<label class="form-label">Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â·ÃÂ¼Ã†Â¬</label>', '<label class="form-label">菜品图片</label>'],
  ['<button type="button" class="btn btn-sm" id="dish-image-upload" style="background:#b83a2a;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:0.78rem;">Ã¯Â¿Â½ÃÂ´Ã¯Â¿Â½</button>', '<button type="button" class="btn btn-sm" id="dish-image-upload" style="background:#b83a2a;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:0.78rem;">上传</button>'],
  ['<label class="form-label"><input type="checkbox" id="dish-active" checked style="margin-right:6px;cursor:pointer;">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</label>', '<label class="form-label"><input type="checkbox" id="dish-active" checked style="margin-right:6px;cursor:pointer;">上架</label>'],
  ['<i class="bi bi-trash"></i> Ã‰Â¾Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‹Â²Ã¯Â¿Â½Ã†Â·', '<i class="bi bi-trash"></i> 删除菜品'],
  ['<button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" style="border-radius:8px;">ÃˆÂ¡Ã¯Â¿Â½Ã¯Â¿Â½</button>', '<button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" style="border-radius:8px;">取消</button>'],
  ['id="save-dish-btn" style="background:var(--primary);border:none;border-radius:8px;letter-spacing:1px;">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</button>', 'id="save-dish-btn" style="background:var(--primary);border:none;border-radius:8px;letter-spacing:1px;">保存</button>'],
];

let count = 0;
for (const [from, to] of replacements) {
  // 只替换实际存在的
  if (html.includes(from)) {
    html = html.split(from).join(to);
    count++;
  } else {
    console.log('SKIP (not found):', from.slice(0, 60));
  }
}

// 清理文件开头的多重 BOM
const bom = '\uFEFF';
let hadBom = false;
while (html.startsWith(bom)) { html = html.slice(1); hadBom = true; }
// 清理 mojibake 的 BOM (Ã¯Â»Â¿ 是 EF BB BF 被误读)
html = html.replace(/^\u00C3\u00AF\u00C2\u00BB\u00C2\u00BF/, '');

fs.writeFileSync(file, html, 'utf8');
console.log(`已替换 ${count} 处乱码${hadBom ? '，并清理了文件开头的 BOM' : ''}`);
console.log('剩余乱码字符数:', (html.match(/Ã¯Â¿Â½/g) || []).length);