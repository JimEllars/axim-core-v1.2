const fs = require('fs');

let code = fs.readFileSync('src/services/onyxAI/index.js', 'utf8');

const target = `    let commandObj = this.getCommand(intent.command);

    if (!commandObj) {
      toast(\`Unknown command: "\${intent.command}". Switching to content generation.\`);
      commandObj = this.getCommand('generateContent');
    }`;

const replacement = `    let commandObj;
    try {
      commandObj = this.getCommand(intent.command);
    } catch (err) {
      commandObj = null;
    }

    if (!commandObj) {
      // toast(\`Unknown command: "\${intent.command}". Switching to content generation.\`);
      commandObj = this.getCommand('generateContent');
    }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/onyxAI/index.js', code);
}
