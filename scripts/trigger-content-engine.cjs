// Script to trigger content engine
const https = require('https');

if (!process.env.CONTENT_ENGINE_API_KEY || !process.env.AXIM_INTERNAL_KEY) {
  console.warn("[WARN] Content Engine secrets are not configured in this environment. Exiting gracefully.");
  process.exit(0);
}
const req = https.request(
  `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co/functions/v1/axim-content-engine`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    }
  },
  (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`HTTP ${res.statusCode}: ${data}`);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        process.exit(0);
      } else if (res.statusCode === 429 || res.statusCode === 503) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    });
  }
);

req.on('error', (e) => {
  console.error(e);
  process.exit(1);
});

req.write(JSON.stringify({
  action: 'generate_news_batch',
  source: 'github_actions_automation',
  timestamp: new Date().toISOString()
}));
req.end();
