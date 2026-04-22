import fs from 'fs';
const content = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');
console.log(content.length);
