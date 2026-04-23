const fs = require('fs');
let code = fs.readFileSync('src/services/onyxAI/commands/systemCommands.js', 'utf8');
code = code.replace("  }),\n];\n\n  createCommand({", "  }),\n  createCommand({");
fs.writeFileSync('src/services/onyxAI/commands/systemCommands.js', code);
