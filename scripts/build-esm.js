#!/usr/bin/env node
/**
 * Cross-platform script to build ESM module
 */
const fs = require('fs');
const path = require('path');

const esmDir = path.join(__dirname, '../dist/esm');

// Add .js extensions to imports for ESM compatibility
function addJsExtensions(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Replace relative imports without extensions with .js extensions
  content = content.replace(/from (['"])(\..+?)(['"])/g, (match, quote1, importPath, quote2) => {
    if (!importPath.endsWith('.js')) {
      return `from ${quote1}${importPath}.js${quote2}`;
    }
    return match;
  });
  fs.writeFileSync(filePath, content);
}

// Process all JS files in esm directory
if (fs.existsSync(esmDir)) {
  const files = fs.readdirSync(esmDir).filter(f => f.endsWith('.js'));
  files.forEach(file => {
    addJsExtensions(path.join(esmDir, file));
  });
}

// Move the file
const src = path.join(esmDir, 'index.js');
const dest = path.join(__dirname, '../dist/index.mjs');

if (fs.existsSync(src)) {
  fs.renameSync(src, dest);
  console.log('Moved index.js to index.mjs');
}

// Remove the esm directory
if (fs.existsSync(esmDir)) {
  fs.rmSync(esmDir, { recursive: true, force: true });
  console.log('Removed dist/esm directory');
}
