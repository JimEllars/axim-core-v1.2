const fs = require('fs');
const file = 'src/services/onyxAI/commands/aiCommands.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `      // 1. Vector Database Integration (RAG)
      let ragContextText = "";
      if (context && context.aximCore && context.aximCore.api) {
        try {
          const queryEmbedding = await llm.generateEmbedding(prompt);
          let relevantMemories = [];

          if (queryEmbedding) {
            relevantMemories = await context.aximCore.api.searchMemory(queryEmbedding, 5, context.userId); // fetching 5 deep contexts
          }

          if (!relevantMemories || relevantMemories.length === 0) {
            relevantMemories = await context.aximCore.api.searchChatHistory(prompt, context.userId);
          }

          if (relevantMemories && relevantMemories.length > 0) {
             // Deduplicate retrieved memories
             const uniqueMemories = [];
             const seen = new Set();
             for (const m of relevantMemories) {
               const key = m.content || (m.command + "|" + m.response);
               if (!seen.has(key)) {
                 seen.add(key);
                 uniqueMemories.push(m);
               }
             }
             ragContextText = uniqueMemories.map(m => \`Prior Context (\${m.created_at || ''}): \${m.content ? m.content : \`User asked "\${m.command}". Response: "\${m.response}"\`}\`).join('\\n');
          }
        } catch (error) {
          console.warn("Failed to retrieve RAG context:", error);
        }
      }`;

code = code.replace(/      \/\/ 1\. Vector Database Integration \(RAG\)[\s\S]*?      \}/, replacement);
fs.writeFileSync(file, code);
