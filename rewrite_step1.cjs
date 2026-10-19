const fs = require('fs');
const file = 'supabase/functions/generate-embedding/index.ts';
let code = fs.readFileSync(file, 'utf8');

const replacement = `    } else {
        console.warn('OPENAI_API_KEY not set, skipping embedding generation');
    }

    // Fallback to Cloudflare Workers AI if OpenAI is not set or failed
    if (!embedding) {
      const cfAccountId = Deno.env.get('CF_ACCOUNT_ID');
      const cfApiToken = Deno.env.get('CF_API_TOKEN');
      if (cfAccountId && cfApiToken) {
        try {
          const fallbackResponse = await fetch(\`https://api.cloudflare.com/client/v4/accounts/\${cfAccountId}/ai/run/@cf/baai/bge-base-en-v1.5\`, {
            method: 'POST',
            headers: {
              'Authorization': \`Bearer \${cfApiToken}\`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: [input] })
          });
          if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            const rawVector = data.result.data[0];
            if (rawVector && rawVector.length === 768) {
              embedding = [...rawVector, ...new Array(1536 - 768).fill(0)];
            } else {
              embedding = rawVector;
            }
          } else {
            console.warn(\`Cloudflare AI API Error: \${fallbackResponse.status} \${await fallbackResponse.text()}\`);
          }
        } catch (cfAiError) {
          console.warn('Cloudflare Workers AI fallback failed:', cfAiError);
        }
      } else {
        console.warn('Cloudflare credentials not set, skipping fallback generation');
      }
    }

    const supabaseAdmin = createClient(`;

code = code.replace(`    } else {
        console.warn('OPENAI_API_KEY not set, skipping embedding generation');
    }

    const supabaseAdmin = createClient(`, replacement);

fs.writeFileSync(file, code);
