sed -i "s/req.headers.get('Authorization')!/req.headers.get('Authorization') || ''/g" supabase/functions/llm-proxy/index.ts
