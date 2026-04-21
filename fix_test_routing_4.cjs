const fs = require('fs');
let code = fs.readFileSync('src/services/onyxAI/index.js', 'utf8');
const target = `      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
      } catch (e) {
        commandObj = null;
      }`;
// Look at routeCommand
const targetRouteCommand = `      let commandObj = this.getCommand(sanitizedCommand);

      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj) {`;

const replacementRouteCommand = `      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
      } catch(e) {
        commandObj = null;
      }

      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj) {`;
if (code.includes(targetRouteCommand)) {
    code = code.replace(targetRouteCommand, replacementRouteCommand);
    fs.writeFileSync('src/services/onyxAI/index.js', code);
}
