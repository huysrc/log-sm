#!/usr/bin/env node
/**
 * Cross-platform script to build ESM module
 */
const fs = require('fs');
const path = require('path');

// Move the file
const src = path.join(__dirname, '../dist/esm/index.js');
const dest = path.join(__dirname, '../dist/index.mjs');

if (fs.existsSync(src)) {
  fs.renameSync(src, dest);
  console.log('Moved index.js to index.mjs');
}

// Remove the esm directory
const esmDir = path.join(__dirname, '../dist/esm');
if (fs.existsSync(esmDir)) {
  fs.rmSync(esmDir, { recursive: true, force: true });
  console.log('Removed dist/esm directory');
}
