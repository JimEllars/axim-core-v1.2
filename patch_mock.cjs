const fs = require('fs');

let content = fs.readFileSync('src/components/layout/ApprovalQueue.test.jsx', 'utf8');

content = content.replace(
  "vi.mock('../../services/supabaseClient', () => ({",
  "vi.mock('../../services/onyxAI/api', () => ({\n  default: {\n    getHitlAuditLog: vi.fn(),\n    resolveHitlAction: vi.fn()\n  }\n}));\n\nvi.mock('../../services/supabaseClient', () => ({"
);

fs.writeFileSync('src/components/layout/ApprovalQueue.test.jsx', content, 'utf8');
