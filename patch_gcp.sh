sed -i 's/this.client = axios.create({/if (!config.apiBaseUrl) { this.client = null; return; } this.client = axios.create({/' src/services/gcpApiService.js
sed -i 's/this._ensureInitialized();/if (!this.client) { throw new Error("GCP Api Service is disabled because VITE_API_BASE_URL is not set in production."); } this._ensureInitialized();/' src/services/gcpApiService.js
