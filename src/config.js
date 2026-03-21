// src/config.js

/**
 * A centralized configuration module.
 *
 * This module reads environment variables and provides them as a single,
 * consistent source of truth for the rest of the application. This approach
 * has several benefits:
 *
 * 1.  **Centralization**: All environment-dependent settings are in one place,
 *     making them easier to manage and update.
 * 2.  **Testability**: When testing, we can easily mock this module to provide
 *     different configuration values for different test scenarios.
 * 3.  **Consistency**: Prevents direct access to `import.meta.env`, ensuring that
 *     all parts of the aipplication use the same configuration values.
 * 4.  **Clarity**: Provides a clear overview of all the external settings the
 *     application depends on.
 */

const config = {
  // Supabase configuration
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,

  // Mocking configuration
  isMockLlmEnabled: import.meta.env.VITE_MOCK_LLM_ENABLED === 'true',

  // Data source configuration
  dataSource: import.meta.env.VITE_DATA_SOURCE || 'supabase', // 'supabase' or 'gcp'

  // GCP Backend URL
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',

  // Stripe Configuration
  stripePriceId: import.meta.env.VITE_STRIPE_PRICE_ID_PRO,
};

/**
 * Validates that essential configuration variables are set.
 * Throws an error if any required variable is missing.
 */
const validateConfig = () => {
  if (config.isMockLlmEnabled) return;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    // In a Vite app, this will be caught and displayed as an overlay in development.
    throw new Error(
      'Supabase URL or Anon Key is missing. Make sure to set them in your .env file.'
    );
  }
};

// Run validation on import
if (import.meta.env.MODE !== 'test') {
    validateConfig();
}


export default config;
