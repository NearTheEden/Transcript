const fs = require('fs');
const path = require('path');

const srcHtml = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
const destDir = path.join(__dirname, '..', 'dist', 'renderer');
const destHtml = path.join(destDir, 'index.html');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(srcHtml, destHtml);
console.log('✓ index.html copié dans dist/renderer/');