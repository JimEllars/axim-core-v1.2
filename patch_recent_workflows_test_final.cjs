const fs = require('fs');
const filepath = 'src/components/dashboard/RecentWorkflows.test.jsx';
let content = fs.readFileSync(filepath, 'utf8');

// The original file used supabase.rpc.mockResolvedValue for all tests. Let's make sure it's updated to match our mock of .from().select().eq().order().limit()

content = content.replace(/supabase\.rpc\.mockResolvedValue\(\{ data: \[\], error: null \}\);/g, "supabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) });");

content = content.replace(/supabase\.rpc\.mockResolvedValue\(\{ data: mockWorkflows, error: null \}\);/g, "supabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: mockWorkflows, error: null }) }) }) }) });");

content = content.replace(/supabase\.from\.mockReturnValue\(\{ select: vi\.fn\(\)\.mockReturnValue\(\{ order: vi\.fn\(\)\.mockReturnValue\(\{ limit: vi\.fn\(\)\.mockReturnValue\(new Promise\(\(\) => \{\}\)\) \}\) \}\) \}\);/g, "supabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue(new Promise(() => {})) }) }) }) });");


fs.writeFileSync(filepath, content);
