const fs = require('fs');

let file = 'src/hooks/useCommandHubState.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "case 'ADD_OR_UPDATE_MESSAGE':\n      const existingMessageIndex = state.messages.findIndex(m => m.id === action.payload.id);\n      if (existingMessageIndex > -1) {\n        const newMessages = [...state.messages];\n        newMessages[existingMessageIndex] = action.payload;\n        return { ...state, messages: newMessages };\n      }\n      return { ...state, messages: [...state.messages, action.payload] };",
  "case 'ADD_OR_UPDATE_MESSAGE': {\n      const existingMessageIndex = state.messages.findIndex(m => m.id === action.payload.id);\n      if (existingMessageIndex > -1) {\n        const newMessages = [...state.messages];\n        newMessages[existingMessageIndex] = action.payload;\n        return { ...state, messages: newMessages };\n      }\n      return { ...state, messages: [...state.messages, action.payload] };\n    }"
);

content = content.replace(
  "case 'OPEN_PREFERENCES':\n      const preferencesCommand = Array.isArray(action.payload) ? action.payload[0] : action.payload;\n      return {\n        ...state,\n        commands: [...state.commands, preferencesCommand]\n      };",
  "case 'OPEN_PREFERENCES': {\n      const preferencesCommand = Array.isArray(action.payload) ? action.payload[0] : action.payload;\n      return {\n        ...state,\n        commands: [...state.commands, preferencesCommand]\n      };\n    }"
);

fs.writeFileSync(file, content);
