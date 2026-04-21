const fs = require('fs');
let code = fs.readFileSync('src/services/onyxAI/index.js', 'utf8');
const target = `      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
      } catch(e) {
        commandObj = null;
      }

      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj) {
        commandObj = this.getCommand('generateContent');
        if (!commandObj) {`;

const replacement = `      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
      } catch(e) {
        commandObj = null;
      }

      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj || commandObj.name === 'generateContent') {
        commandObj = this.getCommand('generateContent');
        if (!commandObj) {`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/onyxAI/index.js', code);
}
