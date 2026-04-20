const fs = require('fs');

let content = fs.readFileSync('src/components/admin/ApiKeyManager.jsx', 'utf8');

content = content.replace(
  "import { supabase } from '../../services/supabaseClient';",
  "import api from '../../services/onyxAI/api';"
);

// We need to route the API key management to api.js as well
// We also have to add getApiKeys, getPartnerCredit, generateB2BApiKey, addApiKey, updateApiKey, deleteApiKey to api.js
