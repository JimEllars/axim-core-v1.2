const fs = require('fs');
let code = fs.readFileSync('src/services/onyxAI/index.js', 'utf8');
const target = `      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
        // If the command is a default LLM fallback, re-route it
        if (commandObj && commandObj.isDefault) {
          commandObj = null;
        }
      } catch(e) {
        commandObj = null;
      }

      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj || commandObj.name === 'generateContent') {
        commandObj = this.getCommand('generateContent');
        if (!commandObj) {
            // This is a safeguard. It should not be reached if 'generateContent' is always defined.
            throw new CommandNotFoundError(\`The command "\${sanitizedCommand}" is not recognized and no default command is available.\`);
        }
      }

      commandType = commandObj.isDefault ? 'llm' : 'direct';`;

const replacement = `      let commandObj;
      try {
        commandObj = this.getCommand(sanitizedCommand);
      } catch (e) {
        commandObj = null;
      }

      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj) {
        commandObj = this.getCommand('generateContent');
        if (!commandObj) {
            // This is a safeguard. It should not be reached if 'generateContent' is always defined.
            throw new CommandNotFoundError(\`The command "\${sanitizedCommand}" is not recognized and no default command is available.\`);
        }
      }

      commandType = commandObj.isDefault ? 'llm' : 'direct';`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/onyxAI/index.js', code);
}
