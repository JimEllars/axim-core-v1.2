const fs = require('fs');
let code = fs.readFileSync('src/services/onyxAI/index.js', 'utf8');

const target1 = `  async _executeDirectCommand(commandObj, sanitizedCommand, options = {}) {
    const args = commandObj.parse(sanitizedCommand, commandObj.extractedEntities);
    commandObj.validate(args);
    const context = {
      aximCore: this,
      conversationHistory: conversationHistory.getHistory(),
      userId: this.userId,
      allCommands: commands,
      options,
    };
    const result = await commandObj.execute(args, context);
    return typeof result === 'string' ? result : result;
  }`;

const replacement1 = `  async _executeDirectCommand(commandObj, sanitizedCommand, options = {}) {
    const args = commandObj.parse(sanitizedCommand, commandObj.extractedEntities);
    commandObj.validate(args);

    if (commandObj.requires_approval) {
      try {
        await this.api.logHitlAction(this.userId, commandObj.name, JSON.stringify({ ...args, description: \`Command: \${commandObj.name}\`, target: args.email || args.source || args.serviceName || args.person || 'General' }));
        return {
          type: 'text',
          content: "This action requires human approval. It has been added to the Human-in-the-Loop queue.",
          status: 'queued_for_approval'
        };
      } catch (err) {
        logger.error("Failed to log HITL action:", err);
      }
    }

    const context = {
      aximCore: this,
      conversationHistory: conversationHistory.getHistory(),
      userId: this.userId,
      allCommands: commands,
      options,
    };
    const result = await commandObj.execute(args, context);
    return typeof result === 'string' ? result : result;
  }`;

if (code.includes(target1)) {
    code = code.replace(target1, replacement1);
} else {
    console.log("Could not find target1");
}

fs.writeFileSync('src/services/onyxAI/index.js', code);
