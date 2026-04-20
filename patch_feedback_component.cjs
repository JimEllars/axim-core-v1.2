const fs = require('fs');
let content = fs.readFileSync('src/components/admin/ProductFeedback.jsx', 'utf8');

content = content.replace(
  "if (supabase) {",
  "if (true) {"
);

content = content.replace(
  "}, [supabase]);",
  "}, []);"
);

fs.writeFileSync('src/components/admin/ProductFeedback.jsx', content, 'utf8');
