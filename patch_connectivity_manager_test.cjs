const fs = require('fs');

const file = 'src/services/__tests__/connectivityManager.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /vi\.mock\('@\/services\/logging', \(\) => \(\{/g,
  `vi.mock('../logging', () => ({`
);

fs.writeFileSync(file, content, 'utf8');
