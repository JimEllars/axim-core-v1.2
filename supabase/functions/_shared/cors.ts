export const getCorsHeaders = (origin?: string | null) => {
  const allowedOriginsStr = Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,https://axim.us.com';
  const allowedOrigins = allowedOriginsStr.split(',').map(url => url.trim());
  const allowOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
};
