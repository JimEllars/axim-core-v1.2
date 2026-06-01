sed -i 's|// await fetch(url, { signal: controller.signal });|const networkReq = fetch(url, { signal: controller.signal });|' supabase/functions/osint-scraper/index.ts
sed -i '/const networkReq = new Promise/,+3d' supabase/functions/osint-scraper/index.ts
sed -i 's|// await fetch(post.url, { signal: controller.signal });|const networkReq = fetch(post.url, { signal: controller.signal });|' supabase/functions/axim-scraper/index.ts
sed -i '/const networkReq = new Promise/,+3d' supabase/functions/axim-scraper/index.ts
