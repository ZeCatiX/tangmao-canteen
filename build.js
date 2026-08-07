// 唐猫庭院 - 构建脚本
// 将 js/ 目录下的模块文件合并为 script.js
const fs = require('fs');
const path = require('path');

const files = [
  'js/globals.js',
  'js/core.js',
  'js/recommendation.js',
  'js/init.js',
];

let output = [];
files.forEach(f => {
  try {
    const content = fs.readFileSync(f, 'utf8');
    output.push(`// ─── ${f} ───`);
    output.push(content);
  } catch(e) {
    console.error(`✗ 读取文件失败: ${f} - ${e.message}`);
    process.exit(1);
  }
});

const combined = output.join('\n');

// 处理重复的函数声明（保留最后一个定义，删除前面的重复定义）
// 匹配 function name( 或 async function name( 模式
const functionRegex = /(?:async\s+)?function\s+(\w+)\s*\(/g;
const functionNames = [];
let match;
while ((match = functionRegex.exec(combined)) !== null) {
  functionNames.push({ name: match[1], index: match.index });
}

// 从后往前找，记录每个函数名第一次出现的位置（从后往前算就是最后一次出现的位置）
const seen = new Set();
const duplicates = [];
for (let i = functionNames.length - 1; i >= 0; i--) {
  const fn = functionNames[i];
  if (seen.has(fn.name)) {
    duplicates.push(fn);
  }
  seen.add(fn.name);
}

let result = combined;
// 从后往前删除重复的函数定义（从前往后删除会改变索引）
const duplicateNames = [...new Set(duplicates.map(d => d.name))];
for (const name of duplicateNames) {
  // 找到所有出现的位置（除了最后一个）
  const positions = [];
  const regex = new RegExp(`((async\\s+)?function\\s+${name}\\s*\\()`, 'g');
  let m;
  while ((m = regex.exec(result)) !== null) {
    positions.push(m.index);
  }
  // 保留最后一个，删除前面的
  for (let i = positions.length - 2; i >= 0; i--) {
    const start = positions[i];
    // 找到函数体的开始（第一个 {）
    const bodyStart = result.indexOf('{', start);
    if (bodyStart === -1) continue;
    // 找到匹配的结束 }（处理嵌套的大括号，跳过字符串和正则表达式中的 {}）
    let depth = 1;
    let end = bodyStart + 1;
    let inString = false, stringChar = null, inRegex = false;
    while (depth > 0 && end < result.length) {
      const ch = result[end];
      const prev = end > 0 ? result[end - 1] : '';
      // 处理字符串
      if (!inString && !inRegex && (ch === '"' || ch === "'" || ch === '`')) {
        inString = true; stringChar = ch;
      } else if (inString && ch === stringChar && prev !== '\\') {
        inString = false; stringChar = null;
      } else if (!inString && !inRegex && ch === '/' && prev !== '\\' && end + 1 < result.length && (result[end + 1] === '/' || result[end + 1] === '*')) {
        // 跳过注释
        const isBlock = result[end + 1] === '*';
        const commentEnd = result.indexOf(isBlock ? '*/' : '\n', end + 2);
        if (commentEnd !== -1) end = commentEnd + (isBlock ? 1 : 0);
        continue;
      } else if (!inString && !inRegex && ch === '/' && prev !== '\\' && end + 1 < result.length && /[a-zA-Z0-9_$]/.test(result[end + 1])) {
        // 可能是正则表达式（在运算符或赋值后）
        const before = end > 0 ? result[end - 1] : '';
        if (before === '=' || before === '(' || before === ',' || before === '!' || before === '&' || before === '|' || before === '?' || before === ':' || before === ';' || before === '{' || before === '[' || before === ' ') {
          inRegex = true;
        }
      } else if (inRegex && ch === '/' && prev !== '\\') {
        inRegex = false;
      }
      // 大括号计数（只在非字符串、非正则时）
      if (!inString && !inRegex) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      end++;
    }
    // 删除这个函数定义
    result = result.substring(0, start) + result.substring(end);
  }
}

// 删除重复的 _initialized 声明
const lines = result.split('\n');
const indices = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('var _initialized=false') || lines[i].includes('let _initialized=false')) {
    indices.push(i);
  }
}
if (indices.length > 1) {
  lines.splice(indices[1], 1);
}

result = lines.join('\n');
fs.writeFileSync('script.js', result);
console.log(`✓ script.js 已生成 (${result.length} bytes)`);

// 验证语法
try {
  require('child_process').execSync('node --check script.js', { stdio: 'pipe' });
  console.log('✓ 语法验证通过');
} catch(e) {
  console.error('✗ 语法错误:', e.stderr.toString());
  process.exit(1);
}