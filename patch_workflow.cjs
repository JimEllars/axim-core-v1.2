const fs = require('fs');

const file = 'src/services/onyxAI/commands/workflowCommands.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /workflow = dbWorkflows.find\(w => w.slug === slug\);/,
  `workflow = dbWorkflows.find(w => w.slug === slug || w.id === slug || w.name === slug);`
);

content = content.replace(
  /const match = input.match\(\/\(\?:workflow\|trigger\|launch\)\\s\+\(\[\\w_-\]\+\)\(\?:\\s\+\(\.\+\)\)\?\$\/i\);/,
  `// Also match "execute_workflow <slug>"
      const match = input.match(/(?:workflow|trigger|launch|execute_workflow)\\s+([\\w_-]+)(?:\\s+(.+))?$/i);`
);

fs.writeFileSync(file, content, 'utf8');
