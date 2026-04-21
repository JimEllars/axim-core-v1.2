const fs = require('fs');

let code = fs.readFileSync('src/services/onyxAI/index.js', 'utf8');
const target = `      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
      } catch(e) {
        commandObj = null;
      }`;
const replacement = `      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
        // If the command is a default LLM fallback, re-route it
        if (commandObj && commandObj.isDefault) {
          commandObj = null;
        }
      } catch(e) {
        commandObj = null;
      }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/onyxAI/index.js', code);
}
