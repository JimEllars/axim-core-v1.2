cat << 'INNER_EOF' > src/config.js
// src/config.js

const config = {
  // Supabase configuration
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,

  // Mocking configuration
  isMockLlmEnabled: import.meta.env.VITE_MOCK_LLM_ENABLED === 'true',

  // Data source configuration
  dataSource: import.meta.env.VITE_DATA_SOURCE || 'supabase', // 'supabase' or 'gcp'

  // GCP Backend URL
  apiBaseUrl: import.meta.env.PROD
    ? (import.meta.env.VITE_API_BASE_URL || '')
    : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'),

  // Stripe Configuration
  stripePriceId: import.meta.env.VITE_STRIPE_PRICE_ID_PRO,
};

const validateConfig = () => {
  if (config.isMockLlmEnabled) return;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      'Supabase URL or Anon Key is missing. Make sure to set them in your .env file.'
    );
  }
};

if (import.meta.env.MODE !== 'test') {
    validateConfig();
}

export default config;
INNER_EOF
