const fs = require('fs');
const file = 'src/services/onyxAI/commands/aiCommands.js';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/      \}\n        \} catch \(error\) \{\n          console\.warn\("Failed to retrieve RAG context:", error\);\n        \}\n      \}/g, `      }`);

fs.writeFileSync(file, code);
