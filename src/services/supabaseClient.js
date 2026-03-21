import { createClient } from '@supabase/supabase-js';
import config from '../config';

const { supabaseUrl, supabaseAnonKey, isMockLlmEnabled } = config;

if (!supabaseUrl || !supabaseAnonKey) {
  if (!isMockLlmEnabled) {
    throw new Error("Supabase URL or Anon Key is missing. Make sure to set them in your .env file.");
  }
}

let client;
try {
  let urlToUse = supabaseUrl;
  // If mock mode is on and URL is placeholder or invalid, use a valid dummy URL to prevent crash
  // createClient requires a valid URL format
  if (isMockLlmEnabled && (!supabaseUrl || supabaseUrl === 'YOUR_SUPABASE_URL')) {
    urlToUse = 'https://example.com';
  }

  client = createClient(urlToUse, supabaseAnonKey || 'dummy-key');
} catch (error) {
  console.error("Supabase client creation failed:", error);
  if (isMockLlmEnabled) {
      console.warn("Using fallback mock client due to initialization error in mock mode.");
      // Minimal mock to prevent crash on import
      client = {
          from: () => ({
              select: () => Promise.resolve({ data: [], error: null }),
              insert: () => Promise.resolve({ data: [], error: null }),
              update: () => Promise.resolve({ data: [], error: null }),
              delete: () => Promise.resolve({ data: [], error: null }),
              eq: function() { return this; },
              single: function() { return Promise.resolve({ data: {}, error: null }); }
          }),
          auth: {
              getUser: () => Promise.resolve({ data: { user: null }, error: null }),
              signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
              signOut: () => Promise.resolve({ error: null })
          }
      };
  } else {
      throw error;
  }
}

export const supabase = client;
