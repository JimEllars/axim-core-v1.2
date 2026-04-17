const fs = require('fs');
let code = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');

code = code.replace("import { corsHeaders } from '../_shared/cors.ts';", "import { corsHeaders } from '../_shared/cors.ts';\nimport { notifyOnyx } from '../_shared/telemetry.ts';");

const notifyFunc = `async function notifyOnyx(endpoint: string, errorCode: number, details: any = {}) {
  const onyxUrl = Deno.env.get('ONYX_EDGE_URL');
  if (!onyxUrl) {
    console.warn('ONYX_EDGE_URL not set, skipping telemetry dispatch.');
    return;
  }

  try {
    await fetch(\`https://\${onyxUrl}/api/telemetry\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error_code: errorCode,
        endpoint,
        timestamp: new Date().toISOString(),
        details
      })
    });
  } catch (err) {
    console.error('Failed to notify Onyx mk3:', err);
  }
}`;

code = code.replace(notifyFunc, '');
fs.writeFileSync('supabase/functions/api-gateway/index.ts', code);
