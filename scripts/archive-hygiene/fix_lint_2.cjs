const fs = require('fs');

// AuthContext
let file = 'src/contexts/AuthContext.jsx';
let content = fs.readFileSync(file, 'utf8');

// move `const logout` above the useEffect block at line 196
content = content.replace(
  "const logout = async () => {\n    await supabase.auth.signOut();\n  };\n\n  const value = {",
  "const value = {"
);

content = content.replace(
  "useEffect(() => {\n    const handleUnauthorized = () => {",
  "const logout = async () => {\n    await supabase.auth.signOut();\n  };\n\n  useEffect(() => {\n    const handleUnauthorized = () => {"
);
fs.writeFileSync(file, content);

// useCommandHubState.js
file = 'src/hooks/useCommandHubState.js';
content = fs.readFileSync(file, 'utf8');
content = content.replace(
  "case 'OPEN_PREFERENCES':\n      const preferencesCommand = Array.isArray(action.payload) ? action.payload[0] : action.payload;\n      return {\n        ...state,\n        commands: [...state.commands, preferencesCommand]\n      };",
  "case 'OPEN_PREFERENCES': {\n      const preferencesCommand = Array.isArray(action.payload) ? action.payload[0] : action.payload;\n      return {\n        ...state,\n        commands: [...state.commands, preferencesCommand]\n      };\n    }"
);
fs.writeFileSync(file, content);

// Use a quick bash perl/sed equivalent to ignore missing display name for AuthContext.test.jsx
file = 'src/contexts/AuthContext.test.jsx';
content = fs.readFileSync(file, 'utf8');
content = content.replace("() => <div>Mock Login</div>", "function MockLogin() { return <div>Mock Login</div>; }");
content = content.replace("() => <div>Mock Dashboard</div>", "function MockDashboard() { return <div>Mock Dashboard</div>; }");
fs.writeFileSync(file, content);

console.log("Lint fix 2 complete");
