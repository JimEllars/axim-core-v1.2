const fs = require('fs');
const path = 'cloudflare-workers/wrangler.toml';
let content = fs.readFileSync(path, 'utf8');

// A placeholder KV namespace ID isn't valid for deployment unless it's a 32-character hex string usually.
// Or maybe it fails because it's exactly 'YOUR_KV_NAMESPACE_ID'.
// Let's replace it with a dummy hex string for now or remove the ID if we can use preview_id or just an empty string?
// Actually, wrangler expects a valid ID format for KV namespaces.
// Let's try "00000000000000000000000000000000".

content = content.replace(/"YOUR_KV_NAMESPACE_ID"/g, '"00000000000000000000000000000000"');

fs.writeFileSync(path, content);
