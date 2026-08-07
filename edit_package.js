const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (!pkg.scripts) pkg.scripts = {};
pkg.scripts['vision:pipeline'] = 'node vision_pipeline.js';

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Added vision:pipeline script to package.json');