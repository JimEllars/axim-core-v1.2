const fs = require('fs');
const filePath = 'supabase/functions/api-gateway/index.ts';

let content = fs.readFileSync(filePath, 'utf8');

// Replace the insert part to include headers
content = content.replace(
  /supabaseAdmin\.from\('telemetry_logs'\)\.insert\(\{\n\s*session_id: body\.session_id,\n\s*event: body\.event,\n\s*app_type: body\.app_type,\n\s*timestamp: body\.timestamp \|\| new Date\(\)\.toISOString\(\),\n\s*details: body\.details \|\| \{\}\n\s*\}\)/g,
  `supabaseAdmin.from('telemetry_logs').insert({
          session_id: body.session_id,
          event: body.event,
          app_type: body.app_type,
          timestamp: body.timestamp || new Date().toISOString(),
          details: body.details || {},
          country_code: req.headers.get('CF-IPCountry') || null,
          ip_address: req.headers.get('CF-Connecting-IP') || null
        })`
);

fs.writeFileSync(filePath, content);
console.log('patched api-gateway/index.ts');
