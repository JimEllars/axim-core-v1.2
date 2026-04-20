const fs = require('fs');
let content = fs.readFileSync('src/services/gcpApiService.js', 'utf8');

content = content.replace(/\\n/g, '\n');

fs.writeFileSync('src/services/gcpApiService.js', content, 'utf8');

let content2 = fs.readFileSync('src/services/supabaseApiService.js', 'utf8');
content2 = content2.replace(/\\n/g, '\n');
fs.writeFileSync('src/services/supabaseApiService.js', content2, 'utf8');
