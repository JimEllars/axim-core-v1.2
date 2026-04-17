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

const APPROVED_ECOSYSTEM_ORIGINS = [
  'https://axim.us.com',
  'https://quickdemandletter.com',
  'https://nda-generator.com'
];

export function getCorsHeaders(reqOrigin: string | null) {
  const isApprovedOrigin = reqOrigin && APPROVED_ECOSYSTEM_ORIGINS.includes(reqOrigin);
  const allowOrigin = isApprovedOrigin
    ? reqOrigin
    : (Deno.env.get('ALLOWED_ORIGINS')?.split(',')[0] || 'https://axim.us.com');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    ...(isApprovedOrigin ? { 'Access-Control-Allow-Credentials': 'true' } : {})
  };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS')?.split(',')[0] || 'https://axim.us.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
