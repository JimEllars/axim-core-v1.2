const fs = require('fs');
const filepath = 'src/hooks/useSupabaseQuery.test.js';
let content = fs.readFileSync(filepath, 'utf8');

content = content.replace("supabase.rpc.mockReturnValue(Promise.resolve({", "supabase.rpc.mockReturnValue(Promise.resolve({");
content = content.replace(/    \}\);\n  \}\);/g, "    }));\n  });");

fs.writeFileSync(filepath, content);
