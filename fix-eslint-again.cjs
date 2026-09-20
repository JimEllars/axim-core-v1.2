const fs = require('fs');

let content = fs.readFileSync('eslint.config.js', 'utf-8');

// I can see in the output above: /app/tests/edge-worker.test.js 'response' is assigned a value but never used
// Let's add an ignore for tests
if (!content.includes('"tests/**/*.{js,jsx}"')) {
  content = content.replace(
    'files: ["src/**/*.{js,jsx}"]',
    'files: ["src/**/*.{js,jsx}", "tests/**/*.{js,jsx}"]'
  );
  fs.writeFileSync('eslint.config.js', content);
}
