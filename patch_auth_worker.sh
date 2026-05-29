# Fix api.js to always send `VITE_ONYX_SECURE_KEY` to the Cloudflare Worker, as it expects `env.AXIM_ONYX_SECRET`
sed -i "s/const token = session?.access_token || secureKey;/const token = secureKey;/g" src/services/onyxAI/api.js
