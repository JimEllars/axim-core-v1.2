const fs = require('fs');

let code = fs.readFileSync('src/services/onyxAI/index.js', 'utf8');

const target = `    let commandObj;
    try {
      commandObj = this.getCommand(intent.command);
    } catch (err) {
      commandObj = null;
    }

    if (!commandObj) {
      // toast(\`Unknown command: "\${intent.command}". Switching to content generation.\`);
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
// Oh wait, the test says `getIntentsFromLLM` was not called with arguments: [ 'What is the MRR?' ]
// Why wasn't it called?
// Because `_executeLlmCommand` wasn't even called.
// Why wasn't `_executeLlmCommand` called?
// Because `commandType` was not 'llm'.
// Why was `commandType` not 'llm'?
// In `routeCommand`:
// let commandObj = this.getCommand(sanitizedCommand);
// if (!commandObj) { commandObj = this.getCommand('generateContent'); }
// commandType = commandObj.isDefault ? 'llm' : 'direct';
// Wait, does "What is the MRR?" match some command? Let's check.
