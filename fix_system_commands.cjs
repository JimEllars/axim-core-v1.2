const fs = require('fs');
const filePath = 'src/services/onyxAI/commands/systemCommands.js';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace('    }\n  })\n\n  createCommand({', '    }\n  }),\n\n  createCommand({');
fs.writeFileSync(filePath, content);
