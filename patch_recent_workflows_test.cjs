const fs = require('fs');
const filepath = 'src/components/dashboard/RecentWorkflows.test.jsx';
let content = fs.readFileSync(filepath, 'utf8');

// Use right component paths and testing hooks for RecentWorkflows component tests that are failing
content = content.replace("supabase.rpc.mockReturnValue(new Promise(() => {})); // Never resolves", "supabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue(new Promise(() => {})) }) }) });");
content = content.replace(/supabase\.rpc\.mockResolvedValue/g, "supabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue") + " }) }) })");

fs.writeFileSync(filepath, content);
