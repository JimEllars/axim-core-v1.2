const fs = require('fs');

let content = fs.readFileSync('src/components/admin/EcosystemRegistry.test.jsx', 'utf8');

content = content.replace(
  "vi.mock('../../services/supabaseClient', () => ({",
  "vi.mock('../../services/onyxAI/api', () => ({\n  default: {\n    getAllEcosystemApps: vi.fn().mockResolvedValue([\n      { app_id: 'test-app-1', is_active: true, status: 'Active' },\n      { app_id: 'test-app-2', is_active: false, status: 'Quarantined' }\n    ]),\n    updateEcosystemAppStatus: vi.fn().mockResolvedValue({})\n  }\n}));\n\nvi.mock('../../services/supabaseClient', () => ({"
);

fs.writeFileSync('src/components/admin/EcosystemRegistry.test.jsx', content, 'utf8');
