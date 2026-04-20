const fs = require('fs');

let content = fs.readFileSync('src/components/layout/ApprovalQueue.test.jsx', 'utf8');

content = content.replace(
  "expect(supabase.rpc).toHaveBeenCalledWith('resolve_hitl_action'",
  "expect(api.resolveHitlAction).toHaveBeenCalledWith('1', 'Approved', { description: 'A test description', target: 'test-target' }); //"
);

content = content.replace(
  "expect(supabase.rpc).toHaveBeenCalledWith('resolve_hitl_action', {",
  "expect(api.resolveHitlAction).toHaveBeenCalledWith('1', 'Rejected'); //"
);

content = content.replace(
  "import { supabase } from '../../services/supabaseClient';",
  "import { supabase } from '../../services/supabaseClient';\nimport api from '../../services/onyxAI/api';"
);

fs.writeFileSync('src/components/layout/ApprovalQueue.test.jsx', content, 'utf8');
