const fs = require('fs');
let content = fs.readFileSync('src/components/admin/EcosystemRegistry.test.jsx', 'utf8');

content = content.replace(
  "import { supabase } from '../../services/supabaseClient';",
  "import api from '../../services/onyxAI/api';"
);

content = content.replace(
  /vi\.mock\('\.\.\/\.\.\/services\/supabaseClient'[\s\S]*?\)\}\)\)\n  \}\n\}\)\);/g,
  `vi.mock('../../services/onyxAI/api', () => ({
  default: {
    getAllEcosystemApps: vi.fn().mockResolvedValue([
      { app_id: 'test-app-1', is_active: true, status: 'Active' },
      { app_id: 'test-app-2', is_active: false, status: 'Quarantined' }
    ]),
    updateEcosystemAppStatus: vi.fn().mockResolvedValue({})
  }
}));`
);

fs.writeFileSync('src/components/admin/EcosystemRegistry.test.jsx', content, 'utf8');
