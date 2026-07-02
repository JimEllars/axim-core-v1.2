const fs = require('fs');

let file = 'src/hooks/useCommandHubState.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  "case 'ADD_OR_UPDATE_MESSAGE':\n      const existingMessageIndex",
  "case 'ADD_OR_UPDATE_MESSAGE': {\n      const existingMessageIndex"
);
content = content.replace(
  "return { ...state, messages: [...state.messages, action.payload] };",
  "return { ...state, messages: [...state.messages, action.payload] };\n    }" // Actually this replace is dangerous, let's just do it manually.
);

fs.writeFileSync(file, content);
