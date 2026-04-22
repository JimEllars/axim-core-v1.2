const { execSync } = require('child_process');
try {
  execSync('deno check supabase/functions/api-gateway/index.ts');
  console.log('API Gateway syntax OK');
} catch(e) {
  console.log('Error: ' + e.message);
}
