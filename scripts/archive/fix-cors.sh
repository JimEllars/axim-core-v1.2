for file in $(find supabase/functions -type f -name "index.ts"); do
  sed -i "s/import { corsHeaders } from '\.\.\/_shared\/cors\.ts';/import { corsHeaders, getCorsHeaders } from '..\/_shared\/cors.ts';/g" "$file"
  sed -i "s/import { corsHeaders as CORS_HEADERS } from '\.\.\/_shared\/cors\.ts';/import { corsHeaders as CORS_HEADERS, getCorsHeaders } from '..\/_shared\/cors.ts';/g" "$file"
  sed -i "s/import { corsHeaders } from \"\.\.\/_shared\/cors\.ts\";/import { corsHeaders, getCorsHeaders } from \"..\/_shared\/cors.ts\";/g" "$file"
  sed -i "s/return new Response('ok', { headers: corsHeaders });/return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });/g" "$file"
  sed -i "s/return new Response('ok', { headers: CORS_HEADERS });/return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });/g" "$file"
  sed -i "s/{ \.\.\.corsHeaders, /{ ...getCorsHeaders(req.headers.get('origin')), /g" "$file"
  sed -i "s/{ \.\.\.CORS_HEADERS, /{ ...getCorsHeaders(req.headers.get('origin')), /g" "$file"
done
