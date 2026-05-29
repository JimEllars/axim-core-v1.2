const fs = require('fs');
let content = fs.readFileSync('eslint.config.js', 'utf8');

content = content.replace('ignores: [\'dist\', \'public/wink-model/**\']', 'ignores: [\'dist\', \'public/wink-model/**\', \'cloudflare-workers/.wrangler/**\']');

fs.writeFileSync('eslint.config.js', content, 'utf8');
