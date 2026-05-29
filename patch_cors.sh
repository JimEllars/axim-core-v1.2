# Fix generate-embedding
sed -i "s/import { corsHeaders, getCorsHeaders } from '..\/_shared\/cors.ts';/import { corsHeaders, getCorsHeaders } from '..\/_shared\/cors.ts';/" supabase/functions/generate-embedding/index.ts

# Fix llm-proxy
sed -i "s/import { corsHeaders, getCorsHeaders } from '..\/_shared\/cors.ts';/import { corsHeaders, getCorsHeaders } from '..\/_shared\/cors.ts';/" supabase/functions/llm-proxy/index.ts
