const fs = require('fs');
const filepath = 'src/components/dashboard/RecentWorkflows.jsx';
let content = fs.readFileSync(filepath, 'utf8');

if(content.includes('supabase.rpc')) {
    content = content.replace(/supabase\.rpc\('get_recent_workflows', \{ limit_count: 5 \}\)/, "supabase.from('events_ax2024').select('*').eq('type', 'workflow_executed').order('created_at', { ascending: false }).limit(5)");
    fs.writeFileSync(filepath, content);
}
