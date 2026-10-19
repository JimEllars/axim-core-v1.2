const fs = require('fs');
const file = 'src/services/supabaseApiService.js';
let code = fs.readFileSync(file, 'utf8');

const replacement1 = `      const combined = [...results, ...(data || [])].slice(0, limit);
      return combined.map(item => ({
        ...item,
        is_compressed: item.compressed ?? item.is_compressed ?? false
      }));`;

code = code.replace(/      const combined = \[\.\.\.results, \.\.\.\(data \|\| \[\]\)\]\.slice\(0, limit\);\n      return combined\.map\(item => \(\{\n        \.\.\.item,\n        is_compressed: item\.is_compressed \|\| false\n      \}\)\);/, replacement1);

const replacement2 = `      const safeData = (data || []).map(item => ({
        ...item,
        is_compressed: item.compressed ?? item.is_compressed ?? false
      }));`;

code = code.replace(/      const safeData = \(data \|\| \[\]\)\.map\(item => \(\{\n        \.\.\.item,\n        is_compressed: item\.is_compressed \|\| false\n      \}\)\);/, replacement2);

fs.writeFileSync(file, code);
