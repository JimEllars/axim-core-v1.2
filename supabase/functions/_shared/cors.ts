/**
 * Shared CORS headers for Supabase Edge Functions.
 *
 * Security Note:
 * This configuration prevents overly permissive CORS by reading from the
 * `ALLOWED_ORIGINS` environment variable. If multiple origins are provided
 * (comma-separated), it restricts access to the first one. If the variable
 * is missing, it falls back to a secure default (`https://axim.us.com`).
 *
 * The wildcard ('*') is intentionally NOT used here to prevent unauthorized
 * cross-origin requests.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS')?.split(',')[0] || 'https://axim.us.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
