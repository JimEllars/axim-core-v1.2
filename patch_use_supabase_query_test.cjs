const fs = require('fs');
const filepath = 'src/hooks/useSupabaseQuery.test.js';
let content = fs.readFileSync(filepath, 'utf8');

// Ensure supabase mock returns what the component expects
content = content.replace("supabase.rpc.mockResolvedValue({", "supabase.rpc.mockReturnValue(Promise.resolve({");

fs.writeFileSync(filepath, content);
