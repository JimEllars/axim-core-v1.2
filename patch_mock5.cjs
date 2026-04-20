const fs = require('fs');

let content = fs.readFileSync('src/components/layout/ApprovalQueue.test.jsx', 'utf8');

content = content.replace(
  "expect(supabase.rpc).toHaveBeenCalledWith('resolve_hitl_action'",
  "expect(api.resolveHitlAction).toHaveBeenCalledWith('1', 'Rejected'); //"
);

fs.writeFileSync('src/components/layout/ApprovalQueue.test.jsx', content, 'utf8');
