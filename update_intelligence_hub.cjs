const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/admin/IntelligenceHub.jsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  "const channel = supabase.channel('realtime:ai_memory_banks')",
  "const channel = supabase.channel('realtime:ai_interactions_ax2024')"
);

content = content.replace(
  "{ event: 'INSERT', schema: 'public', table: 'ai_memory_banks' },",
  "{ event: 'INSERT', schema: 'public', table: 'ai_interactions_ax2024' },"
);

content = content.replace(
  "content: payload.new.content,",
  "content: payload.new.command || payload.new.response || 'Interaction logged',"
);

content = content.replace(
  "source_type: payload.new.source_type,",
  "source_type: payload.new.source || 'AXiM Core',"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("IntelligenceHub.jsx updated.");
