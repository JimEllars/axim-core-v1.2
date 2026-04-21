const fs = require('fs');

const file = 'src/services/__tests__/apiClient.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /source: \`apiClient:\$\{endpoint\}\`,\n\s*}\);/g,
  `source: \`apiClient:\$\{endpoint\}\`,
      }));`
);

fs.writeFileSync(file, content, 'utf8');
