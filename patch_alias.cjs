const fs = require('fs');

let file = fs.readFileSync('src/services/onyxAI/commands/generalCommands.js', 'utf8');
file = file.replace(/@\/utils\/osDetection/g, `../../../utils/osDetection`);
fs.writeFileSync('src/services/onyxAI/commands/generalCommands.js', file);
