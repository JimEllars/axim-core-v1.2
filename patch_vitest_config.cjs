const fs = require('fs');

const file = 'vitest.config.js';
let content = fs.readFileSync(file, 'utf8');

const pathAlias = `
  resolve: {
    alias: {
      '@': '/app/src'
    }
  },`;

content = content.replace(/test: {/, pathAlias + '\n  test: {');

fs.writeFileSync(file, content, 'utf8');
