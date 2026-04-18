const fs = require('fs');
const filepath = 'src/hooks/useSupabaseQuery.test.js';
let content = fs.readFileSync(filepath, 'utf8');

content = content.replace("expect(supabase.rpc).toHaveBeenCalledTimes(2);\n    }));\n  });", "expect(supabase.rpc).toHaveBeenCalledTimes(2);\n    });\n  });");

fs.writeFileSync(filepath, content);
