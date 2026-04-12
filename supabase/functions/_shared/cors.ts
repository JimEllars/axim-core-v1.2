export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS')?.split(',')[0] || 'https://axim.us.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
