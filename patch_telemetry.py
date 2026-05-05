import re

with open('src/contexts/SupabaseContext.jsx', 'r') as f:
    content = f.read()

# Replace health check with auth.getSession() instead of events_ax2024 query
content = content.replace("await supabaseClient.from('events_ax2024').select('*', { count: 'exact', head: true });", "await supabaseClient.auth.getSession();")
content = content.replace("if (error && !error.message.includes('relation \"events_ax2024\" does not exist')) {", "if (error) {")

with open('src/contexts/SupabaseContext.jsx', 'w') as f:
    f.write(content)
