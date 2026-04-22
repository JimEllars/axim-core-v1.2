const { execSync } = require('child_process');
try {
  execSync('deno check supabase/functions/autonomous-billing/index.ts');
  console.log('Syntax OK');
} catch(e) {
  console.log('Error: ' + e.message);
}
