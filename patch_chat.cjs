const fs = require('fs');
const content = fs.readFileSync('src/components/commandhub/ChatInterface.jsx', 'utf-8');

const replacement = `    const handleActionApproval = async (e) => {
      const { approved, toolCall } = e.detail;
      const logAction = async () => {
         try {
             const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
             const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
             let token = '';
             for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.endsWith('-auth-token')) {
                    const session = localStorage.getItem(key);
                    if (session) {
                       try {
                          token = JSON.parse(session).access_token || '';
                          break;
                       } catch (e) {}
                    }
                }
             }

             // We need to parse JWT or just use Supabase client directly
             // Instead of raw fetch to REST API for hitl_audit_logs, we should import supabase client, but it's not currently imported here.
             // We can use the REST API.

             if (token) {
                 const payloadBase64Url = token.split('.')[1];
                 const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
                 const payload = JSON.parse(atob(payloadBase64));
                 const adminId = payload.sub;

                 await fetch(\`\${supabaseUrl}/rest/v1/hitl_audit_logs\`, {
                     method: 'POST',
                     headers: {
                         'Content-Type': 'application/json',
                         'Authorization': \`Bearer \${token}\`,
                         'apikey': anonKey,
                         'Prefer': 'return=minimal'
                     },
                     body: JSON.stringify({
                         admin_id: adminId,
                         action: approved ? 'approve' : 'deny',
                         tool_called: toolCall?.name || 'unknown'
                     })
                 });
             }
         } catch (error) {
             console.error('Failed to log HITL action:', error);
         }
      };

      // Run log async
      logAction();

      if (approved) {`;

const updatedContent = content.replace("    const handleActionApproval = async (e) => {\n      const { approved, toolCall } = e.detail;\n      if (approved) {", replacement);

fs.writeFileSync('src/components/commandhub/ChatInterface.jsx', updatedContent);
