const fs = require('fs');

let file = 'src/hooks/useCommandHubState.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "case 'OPEN_PREFERENCES':\n      const preferencesCommand = Array.isArray(action.payload) ? action.payload[0] : action.payload;\n      return {\n        ...state,\n        commands: [...state.commands, preferencesCommand]\n      };",
  "case 'OPEN_PREFERENCES': {\n      const preferencesCommand = Array.isArray(action.payload) ? action.payload[0] : action.payload;\n      return {\n        ...state,\n        commands: [...state.commands, preferencesCommand]\n      };\n    }"
);

fs.writeFileSync(file, content);

console.log("Fixed useCommandHubState.js");
