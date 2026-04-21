const fs = require('fs');

let code = fs.readFileSync('src/services/onyxAI/index.js', 'utf8');

const target = `      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj) {
        try {
          commandObj = this.getCommand('generateContent');
        } catch (e) {
           commandObj = { name: 'generateContent', isDefault: true };
        }
        if (!commandObj) {
            // This is a safeguard. It should not be reached if 'generateContent' is always defined.
            throw new CommandNotFoundError(\`The command "\${sanitizedCommand}" is not recognized and no default command is available.\`);
        }
      }`;

const replacement = `      // If no direct command is found, fall back to the default LLM command.
      if (!commandObj || commandObj.name !== 'generateContent') {
        try {
          commandObj = this.getCommand('generateContent');
        } catch (e) {
           commandObj = { name: 'generateContent', isDefault: true };
        }
        if (!commandObj) {
            // This is a safeguard. It should not be reached if 'generateContent' is always defined.
            throw new CommandNotFoundError(\`The command "\${sanitizedCommand}" is not recognized and no default command is available.\`);
        }
      }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/onyxAI/index.js', code);
}
