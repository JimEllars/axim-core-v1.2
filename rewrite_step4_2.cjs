const fs = require('fs');
const file = 'src/services/onyxAI/llm.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `      const similarMemories = await supabaseApiService.searchMemory(queryEmbedding, 3, userId);

      if (similarMemories && similarMemories.length > 0) {
        const memoryContext = similarMemories.map(m => m.content || \`User: \${m.command} -> Assistant: \${m.response}\`).join("\\n");
        finalPrompt = \`Context from system memory:\\n\${memoryContext}\\n\\nUser Request: \${prompt}\`;
      }`;

code = code.replace(/      const similarMemories = await supabaseApiService\.searchMemory\(queryEmbedding, 3, userId\);\n\n      if \(similarMemories && similarMemories\.length > 0\) {\n        const memoryContext = similarMemories\.map\(m => m\.content\)\.join\("\\n"\);\n        finalPrompt = `Context from system memory:\\n\${memoryContext}\\n\\nUser Request: \${prompt}`;\n      \}/, replacement);
fs.writeFileSync(file, code);
