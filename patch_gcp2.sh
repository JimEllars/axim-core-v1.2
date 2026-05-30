# Fix formatting and ensure that we throw DatabaseError so it is caught by fallback mechanism properly
sed -i 's/throw new Error("GCP Api Service is disabled because VITE_API_BASE_URL is not set in production.");/throw new DatabaseError("GCP Api Service is disabled because VITE_API_BASE_URL is not set in production.");/' src/services/gcpApiService.js
