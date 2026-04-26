const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'supabase/functions/onyx-bridge/index.ts');
let content = fs.readFileSync(filePath, 'utf8');

const injectionCode = `
    // RAG Context Injection (Phase 8)
    const retrieveMemory = async () => {
      try {
        const url = new URL(req.url);
        const protocol = url.protocol;
        const host = url.host; // includes port if running locally
        // Edge function direct fetch or relative endpoint
        const memoryRetrievalUrl = \`\${protocol}//\${host}/memory-retrieval\`;

        const memoryReq = await fetch(memoryRetrievalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Axim-Internal-Service-Key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
          },
          body: JSON.stringify({
            query: promptText,
            threshold: 0.78,
            limit: 5,
            user_id: user?.id
          })
        });

        if (memoryReq.ok) {
           const memoryData = await memoryReq.json();
           return memoryData.results;
        }
        return [];
      } catch (e) {
        console.warn('Memory retrieval fetch failed:', e.message);
        return [];
      }
    };

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([]), 1500));

    // We only try to fetch memory if there is a prompt text
    let memoryResults = [];
    if (promptText) {
        memoryResults = await Promise.race([retrieveMemory(), timeoutPromise]);
    }

    let memoryContext = '';
    if (memoryResults && memoryResults.length > 0) {
       const memories = memoryResults.map((r: any) => \`User Command: \${r.command} | AI Response: \${r.response}\`).join('\\n');
       memoryContext = \`\\n\\nSystem Context: Here are relevant past interactions with the admin:\\n\${memories}\`;
    }
`;

// Find where promptText is defined
if (content.includes("const promptText = (bodyData.prompt || bodyData.command || '').toLowerCase();")) {
    const splitIndex = content.indexOf("if (promptText.includes('billing') || promptText.includes('financial') || promptText.includes('invoice')) {");
    if (splitIndex !== -1) {
        content = content.slice(0, splitIndex) + injectionCode + "\n    " + content.slice(splitIndex);
    }
}

// Then find where bodyData.context.system_prompt is set
const promptUpdateCode = `
    if (!bodyData.context) bodyData.context = {};
    bodyData.context.system_prompt = personaPrompt + circuitBreakerAuth + memoryContext;
`;

content = content.replace(
    /if \(!bodyData\.context\) bodyData\.context = \{\};\s*bodyData\.context\.system_prompt = personaPrompt \+ circuitBreakerAuth;/,
    promptUpdateCode
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Patched onyx-bridge successfully");
