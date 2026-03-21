const { createClient } = require('@supabase/supabase-js');

// Create a single, shared Supabase client for the main process
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

module.exports = { supabase };
