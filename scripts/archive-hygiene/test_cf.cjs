const { execSync } = require('child_process');

try {
  execSync('cd cloudflare-workers && rm -rf .wrangler && npm install && mkdir -p ../dist && npx wrangler deploy --dry-run -c wrangler.toml', { stdio: 'inherit' });
} catch (error) {
  console.error("Failed", error);
  process.exit(1);
}
