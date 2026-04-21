const fs = require('fs');

function addRequiresApproval(filePath, commandNames) {
  let code = fs.readFileSync(filePath, 'utf8');
  for (const name of commandNames) {
    const target = `name: '${name}',`;
    const replacement = `name: '${name}',\n    requires_approval: true,`;
    if (code.includes(target)) {
      code = code.replace(target, replacement);
    }
  }
  fs.writeFileSync(filePath, code);
}

addRequiresApproval('src/services/onyxAI/commands/integrationCommands.js', ['syncContacts', 'scheduleMeeting']);
addRequiresApproval('src/services/onyxAI/commands/externalCommands.js', ['callService']);
