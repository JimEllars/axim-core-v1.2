const fs = require('fs');

// useCommandHubState.js
let file = 'src/hooks/useCommandHubState.js';
let content = fs.readFileSync(file, 'utf8');

// Still failing on `useCommandHubState.js`? Wait, maybe I didn't replace it properly or there is another `case`.
// Line 17: Unexpected lexical declaration in case block no-case-declarations
console.log(content.split('\n').slice(10, 20).join('\n'));
