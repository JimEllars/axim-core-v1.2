// src/services/onyxAI/commands/index.js

// Use Vite's import.meta.glob to dynamically and eagerly import all command modules.
// This pattern matches any file ending with "Commands.js" in the current directory.
const modules = import.meta.glob('./*Commands.js', { eager: true });

// The imported modules are in the format: { './contactCommands.js': { default: [...] }, ... }
// We need to extract the default export from each module and flatten them into a single array.
const allCommands = Object.values(modules)
  .map(module => module.default || []) // Get the default export, which should be an array of commands
  .flat(); // Flatten the arrays of commands into a single array

export default allCommands;
