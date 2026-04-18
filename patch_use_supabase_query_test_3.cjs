const fs = require('fs');
const filepath = 'src/hooks/useSupabaseQuery.test.js';
let content = fs.readFileSync(filepath, 'utf8');

content = content.replace("supabase.rpc.mockResolvedValue({", "supabase.rpc.mockReturnValue(Promise.resolve({");
content = content.replace("data: [{ id: 1, name: 'Test' }],\n      error: null,\n    });", "data: [{ id: 1, name: 'Test' }],\n      error: null,\n    }));");
content = content.replace("supabase.rpc.mockResolvedValueOnce({", "supabase.rpc.mockReturnValueOnce(Promise.resolve({");
content = content.replace("data: null,\n      error: mockError,\n    });", "data: null,\n      error: mockError,\n    }));");

fs.writeFileSync(filepath, content);
