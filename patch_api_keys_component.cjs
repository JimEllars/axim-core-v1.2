const fs = require('fs');
let content = fs.readFileSync('src/components/admin/ApiKeyManager.jsx', 'utf8');
content = content.replace(
  "import { supabase } from '../../services/supabaseClient';",
  "import { supabase } from '../../services/supabaseClient';\nimport api from '../../services/onyxAI/api';"
);
fs.writeFileSync('src/components/admin/ApiKeyManager.jsx', content, 'utf8');
