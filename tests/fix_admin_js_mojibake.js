// 修复 admin.html JS 中的乱码
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'admin.html');
let html = fs.readFileSync(file, 'utf8');

const replacements = [
  // ── 统计卡片标签 ──
  ["label: 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â¼Ã¯Â¿Â½'", "label: '今日推荐'"],
  ["label: 'Ã¯Â¿Â½ÃŽÂ¿Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â¼Ã¯Â¿Â½'", "label: '游客推荐'"],
  ["label: 'Ã¯Â¿Â½ÃƒÂ»Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â¼Ã¯Â¿Â½'", "label: '用户推荐'"],
  ["label: 'Ã¯Â¿Â½ÃœÂ·Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'", "label: '总反馈'"],
  ["label: 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã›Â²Ã¯Â¿Â½Ã†Â·'", "label: '总菜品'"],
  // ── 图表标签 "分" ──
  [".rating + 'Ã¯Â¿Â½Ã¯Â¿Â½'", ".rating + '分'"],
  ["label: 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã–Â·Ã–Â²Ã¯Â¿Â½'", "label: '评分分布'"],
  ["return val + 'Ã¯Â¿Â½Ã¯Â¿Â½ (' + pct + '%)'", "return val + '分 (' + pct + '%)'"],
  ["ctx.fillText(val + 'Ã¯Â¿Â½Ã¯Â¿Â½', bar.x, bar.y - 6)", "ctx.fillText(val + '分', bar.x, bar.y - 6)"],
  // ── 图表标签 ──
  ["{ label: 'Ã¯Â¿Â½ÃŽÂ¿Ã¯Â¿Â½'", "{ label: '游客'"],
  ["{ label: 'Ã¯Â¿Â½ÃƒÂ»Ã¯Â¿Â½'", "{ label: '用户'"],
  ["{ label: 'Ã¯Â¿Â½ÃœÂ¼Ã¯Â¿Â½'", "{ label: '总计'"],
  ["{ label: 'Ã¯Â¿Â½Ã¯Â¿Â½Ã”Â¾Ã¯Â¿Â½ÃƒÂ»Ã¯Â¿Â½'", "{ label: '活跃用户'"],
  ["const labels_cn = {'spiciness':'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½','saltiness':'Ã¯Â¿Â½ÃŒÂµÃ¯Â¿Â½','sweetness':'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'}", "const labels_cn = {'spiciness':'辣度','saltiness':'咸淡','sweetness':'甜酸'}"],
  ["if (k === 'Ã¯Â¿Â½Ã¯Â¿Â½' || k === 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂ½') continue", "if (k === '无' || k === '无特殊要求') continue"],
  // ── 偏好统计标签 ──
  ["const labels = {'spiciness':'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½','saltiness':'Ã¯Â¿Â½ÃŒÂµÃ¯Â¿Â½','sweetness':'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½','price':'Ã¯Â¿Â½Ã›Â¸Ã¯Â¿Â½','calorie':'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½','religion':'Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ³Ã’ÂªÃ¯Â¿Â½Ã¯Â¿Â½'}", 
   "const labels = {'spiciness':'辣度','saltiness':'咸淡','sweetness':'甜酸','price':'价格','calorie':'热量','religion':'饮食宗教'}"],
  ["if (entries.length === 0) { el.innerHTML = '<div style=\"color:#8b7a6a;font-size:0.85rem;padding:8px;\">Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½</div>'; return; }", 
   "if (entries.length === 0) { el.innerHTML = '<div style=\"color:#8b7a6a;font-size:0.85rem;padding:8px;\">暂无数据</div>'; return; }"],
  ["esc(e[0] === 'Ã¯Â¿Â½Ã¯Â¿Â½' ? 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂ½' : e[0])", "esc(e[0] === '无' ? '无特殊要求' : e[0])"],
  // ── 菜品表格状态 ──
  ["${x.is_active===false?'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‚Â¼Ã¯Â¿Â½':'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'}", "${x.is_active===false?'已下架':'已上架'}"],
  ["<i class=\"bi bi-pencil\"></i> Ã¯Â¿Â½Ã Â¼Â­", "<i class=\"bi bi-pencil\"></i> 编辑"],
  // ── 编辑菜品弹窗 ──
  ["document.getElementById('dish-spiciness').value = dish.spiciness || 'ÃŽÂ¢Ã¯Â¿Â½Ã¯Â¿Â½'", "document.getElementById('dish-spiciness').value = dish.spiciness || '微辣'"],
  ["document.getElementById('dish-saltiness').value = dish.saltiness || 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'", "document.getElementById('dish-saltiness').value = dish.saltiness || '适中'"],
  ["document.getElementById('dish-sweetness').value = dish.sweetness || 'Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂ¶'", "document.getElementById('dish-sweetness').value = dish.sweetness || '无味'"],
  ["document.getElementById('dishModalTitle').textContent = 'Ã¯Â¿Â½Ã Â¼Â­Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â·'", "document.getElementById('dishModalTitle').textContent = '编辑菜品'"],
  ["document.getElementById('dish-category').value = 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'", "document.getElementById('dish-category').value = '热菜'"],
  ["document.getElementById('dish-spiciness').value = 'ÃŽÂ¢Ã¯Â¿Â½Ã¯Â¿Â½'", "document.getElementById('dish-spiciness').value = '微辣'"],
  ["document.getElementById('dishModalTitle').textContent = 'Ã¯Â¿Â½Ã¯Â¿Â½Ã“Â²Ã¯Â¿Â½Ã†Â·'", "document.getElementById('dishModalTitle').textContent = '添加菜品'"],
  // ── Alert 消息 ──
  ["alert('Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‘Â¡Ã¯Â¿Â½Ã¯Â¿Â½ÃÂ¼Ã†Â¬Ã¯Â¿Â½Ã„Â¼Ã¯Â¿Â½')", "alert('请先选择图片文件')"],
  ["alert('Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃˆÂ±Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã†Â·Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃÂ¢Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃÂ´Ã¯Â¿Â½ÃÂ¼Ã†Â¬')", "alert('请先保存菜品信息再上传图片')"],
  ["alert('ÃÂ¼Ã†Â¬Ã¯Â¿Â½ÃÂ´Ã¯Â¿Â½Ã¯Â¿Â½Ã‰Â¹Ã¯Â¿Â½')", "alert('图片上传成功')"],
  ["alert('Ã¯Â¿Â½ÃÂ´Ã¯Â¿Â½ÃŠÂ§Ã¯Â¿Â½Ã¯Â¿Â½: ' + (data.error || 'ÃŽÂ´Ã–ÂªÃ¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½')", "alert('上传失败: ' + (data.error || '未知错误')"],
  ["alert('Ã¯Â¿Â½ÃÂ´Ã¯Â¿Â½ÃŠÂ§Ã¯Â¿Â½Ã¯Â¿Â½: ' + e.message)", "alert('上传失败: ' + e.message)"],
  ["if (!name) { alert('Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂªÃ¯Â¿Â½Ã¯Â¿Â½')", "if (!name) { alert('菜品名称不能为空'"],
  ["if (price === '' || isNaN(priceNum) || priceNum < 0) { alert('Ã¯Â¿Â½Ã›Â¸Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂªÃ¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃšÂµÃ¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½0Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½')", "if (price === '' || isNaN(priceNum) || priceNum < 0) { alert('价格不能为空且不能小于0'"],
  ["if (rating === '' || isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) { alert('Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã–Â±Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½0-5Ã–Â®Ã¯Â¿Â½Ã¯Â¿Â½')", "if (rating === '' || isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) { alert('评分必须在0-5之间'"],
  ["if (rating.indexOf('.') >= 0 && rating.split('.')[1].length > 1) { alert('Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã Â±Â£Ã¯Â¿Â½Ã¯Â¿Â½Ã’Â»ÃŽÂ»ÃÂ¡Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ 4.5Ã¯Â¿Â½Ã¯Â¿Â½')", "if (rating.indexOf('.') >= 0 && rating.split('.')[1].length > 1) { alert('评分最多保留一位小数，如 4.5'"],
  ["if (price.indexOf('.') >= 0 && price.split('.')[1].length > 1) { alert('Ã¯Â¿Â½Ã›Â¸Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã Â±Â£Ã¯Â¿Â½Ã¯Â¿Â½Ã’Â»ÃŽÂ»ÃÂ¡Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ 28.5Ã¯Â¿Â½Ã¯Â¿Â½')", "if (price.indexOf('.') >= 0 && price.split('.')[1].length > 1) { alert('价格最多保留一位小数，如 28.5'"],
  ["if (!confirm('ÃˆÂ·Ã¯Â¿Â½Ã¯Â¿Â½Ã’ÂªÃ¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‰Â¾Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‹Â²Ã¯Â¿Â½Ã†Â·Ã¯Â¿Â½Ã°Â£Â¿Â´Ã‹Â²Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‰Â»Ã–Â¸Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'))", "if (!confirm('确定要永久删除此菜品吗？删除后不可恢复。'))"],
  // ── 登录错误消息 ──
  ["if (!user || !pass) { errEl.textContent = 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‹ÂºÃ…ÂºÃ¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'", "if (!user || !pass) { errEl.textContent = '请输入用户名和密码'"],
  ["errEl.textContent = d.error || 'Ã¯Â¿Â½Ã¯Â¿Â½Ã‚Â¼ÃŠÂ§Ã¯Â¿Â½Ã¯Â¿Â½'", "errEl.textContent = d.error || '登录失败'"],
  ["errEl.textContent = 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'", "errEl.textContent = '网络连接失败，请检查网络'"],
  // ── 监控系统 ──
  ["document.getElementById('monitor-r2-trend').textContent = ({ stable: 'Ã¯Â¿Â½ÃˆÂ¶Ã¯Â¿Â½', improving: 'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½', declining: 'Ã¯Â¿Â½Ã‚Â½Ã¯Â¿Â½' })[m.r2Trend] || '-'", 
   "document.getElementById('monitor-r2-trend').textContent = ({ stable: '稳定', improving: '提升中', declining: '下降' })[m.r2Trend] || '-'"],
  ["document.getElementById('monitor-r2-history').textContent = 'R2Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ·: ' + history.map(h => h.r2.toFixed(4)).join(' -> ')", 
   "document.getElementById('monitor-r2-history').textContent = 'R2历史: ' + history.map(h => h.r2.toFixed(4)).join(' -> ')"],
  // ── 模型对比 ──
  ["if (!d.success) { console.warn('[model-compare] APIÃ¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ§Ã¯Â¿Â½Ã¯Â¿Â½'); return; }", 
   "if (!d.success) { console.warn('[model-compare] API请求失败'); return; }"],
  ["}).catch(e => console.warn('[model-compare] Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ§Ã¯Â¿Â½Ã¯Â¿Â½:', e))", 
   "}).catch(e => console.warn('[model-compare] 请求失败:', e))"],
  // ── 重训练 ──
  ["status.textContent = '训练完成' + (d.message || 'Ã¯Â¿Â½Ã¯Â¿Â½Ã‘ÂµÃ¯Â¿Â½Ã¯Â¿Â½ÃŠÂ§Ã¯Â¿Â½Ã¯Â¿Â½')", "status.textContent = '训练完成' + (d.message || '')"],
  // ── 用户管理 ──
  ["+ (u.last_login ? new Date(u.last_login).toLocaleString() : 'Ã¯Â¿Â½Ã¯Â¿Â½ÃŽÂ´Ã¯Â¿Â½Ã¯Â¿Â½Ã‚Â¼')", "+ (u.last_login ? new Date(u.last_login).toLocaleString() : '从未登录')"],
  ["border-radius:4px;\">Ã‰Â¾Ã¯Â¿Â½Ã¯Â¿Â½</button></td></tr>'", 
   "border-radius:4px;\">删除</button></td></tr>'"],
  ["if (!confirm('ÃˆÂ·Ã¯Â¿Â½Ã¯Â¿Â½Ã’ÂªÃ‰Â¾Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃƒÂ»Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'))", "if (!confirm('确定要删除此用户吗？'))"],
  ["if (d.success) { loadUsers(); alert('Ã¯Â¿Â½ÃƒÂ»Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‰Â¾Ã¯Â¿Â½Ã¯Â¿Â½'); }", "if (d.success) { loadUsers(); alert('用户已删除'); }"],
  // ── 导出 ──
  ["if (!token) { alert('Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃˆÂµÃ¯Â¿Â½Ã‚Â¼'); return; }", "if (!token) { alert('请先登录'); return; }"],
  [".then(r => { if (!r.ok) throw new Error('Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ§Ã¯Â¿Â½Ã¯Â¿Â½'); return r.text(); })", ".then(r => { if (!r.ok) throw new Error('导出失败'); return r.text(); })"],
  [".catch(e => alert('Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½ÃŠÂ§Ã¯Â¿Â½Ã¯Â¿Â½: ' + e.message))", ".catch(e => alert('导出失败: ' + e.message))"],
  // ── 通知 ──
  ["+ (safeLink ? '<a href=\"' + esc(safeLink) + '\" style=\"margin-left:auto;color:inherit;text-decoration:underline;\">Ã¯Â¿Â½Ã©Â¿Â´</a>' : '')", 
   "+ (safeLink ? '<a href=\"' + esc(safeLink) + '\" style=\"margin-left:auto;color:inherit;text-decoration:underline;\">查看</a>' : '')"],
  // ── 反馈列表 ──
  ["esc(x.dish_name||'ÃŽÂ´Ã–Âª')", "esc(x.dish_name||'未知')"],
  // ── 菜品表格 ──
  ["<td>${x.is_active===false?'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã‚Â¼Ã¯Â¿Â½':'Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½'}</td>", "<td>${x.is_active===false?'已下架':'已上架'}</td>"],
  ["<i class=\"bi bi-pencil\"></i> Ã¯Â¿Â½Ã Â¼Â­</button></td></tr>`", 
   "<i class=\"bi bi-pencil\"></i> 编辑</button></td></tr>`"],
  // ── 推荐日志 ──
  ["+ (x.rating ? '<span class=\"badge bg-success\" style=\"border-radius:4px;\">' + esc(x.rating) + 'Ã¯Â¿Â½Ã¯Â¿Â½</span>' : '-') + '</td></tr>'", 
   "+ (x.rating ? '<span class=\"badge bg-success\" style=\"border-radius:4px;\">' + esc(x.rating) + '分</span>' : '-') + '</td></tr>'"],
  // ── 热门菜品价格 ──
  ["Ã”Âª</td>", "元</td>"],
  // ── 模型状态 ──
  ["+ (h.isCurrent ? '?' : '') + '</td></tr>'", "+ (h.isCurrent ? '当前' : '') + '</td></tr>'"],
  ["+ (v.isCurrent ? '?' : '') + '</td></tr>'", "+ (v.isCurrent ? '当前' : '') + '</td></tr>'"],
];

let count = 0;
for (const [from, to] of replacements) {
  if (html.includes(from)) {
    html = html.split(from).join(to);
    count++;
  } else {
    console.log('SKIP:', from.slice(0, 70));
  }
}

fs.writeFileSync(file, html, 'utf8');
const remaining = (html.match(/Ã¯Â¿Â½/g) || []).length;
console.log(`已替换 ${count} 处 JS 乱码`);
console.log(`剩余乱码字符数: ${remaining}`);
console.log(remaining === 0 ? '✅ 全部修复完成！' : '⚠️ 还有剩余乱码（主要是注释行）');