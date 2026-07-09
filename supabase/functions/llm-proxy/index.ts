import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleOpenAI } from './providers/openai.ts';
import { handleClaude } from './providers/claude.ts';
import { handleGemini } from './providers/gemini.ts';
import { handleDeepseek } from './providers/deepseek.ts';
import { handleChatbase } from './providers/chatbase.ts';

const providerHandlers = {
  openai: handleOpenAI,
  claude: handleClaude,
  gemini: handleGemini,
  deepseek: handleDeepseek,
  chatbase: handleChatbase,
};

// In-memory cache for API keys to reduce database load.
const apiKeyPromiseCache = new Map<string, { promise: Promise<string>; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minute TTL

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 1000 * 60; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;
const rateLimiter = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userRecord = rateLimiter.get(userId);

  if (!userRecord) {
    rateLimiter.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (now - userRecord.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Reset window
    rateLimiter.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (userRecord.count >= MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }

  userRecord.count += 1;
  return true;
}

async function getApiKey(supabaseClient: any, userId: string, provider: string) {
  const cacheKey = `${userId}:${provider}`;
  const cached = apiKeyPromiseCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[Cache Hit] Using cached API key promise for ${provider} (user: ${userId}).`);
    return cached.promise;
  }

  const promise = supabaseClient
    .from('api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('service', provider)
    .single()
    .then(({ data, error }: any) => {
      if (error || !data) {
        console.error(`API key for ${provider} not found for user ${userId}. Error: ${error?.message}`);
        throw new Error(`API key for ${provider} not found.`);
      }
      return data.api_key;
    });

  // Update cache immediately to prevent cache stampedes
  apiKeyPromiseCache.set(cacheKey, {
    promise,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  try {
    await promise;
  } catch (error) {
    // Remove the rejected promise from the cache so subsequent requests retry
    apiKeyPromiseCache.delete(cacheKey);
    throw error;
  }

  return promise;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const request_id = crypto.randomUUID();
  console.log(`[${request_id}] New llm-proxy request received.`);

  try {
    // 1. Create a Supabase client with the SERVICE_ROLE_KEY for admin operations.
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Authenticate the user from the Authorization header.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error(`[${request_id}] Unauthorized: User authentication failed.`, userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${request_id}] Authenticated user: ${user.id}`);

    // Rate Limiting Check
    if (!checkRateLimit(user.id)) {
        console.warn(`[${request_id}] Rate limit exceeded for user: ${user.id}`);
        return new Response(JSON.stringify({ error: "Too Many Requests" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
    }

    // 3. Parse the request body.
    const { provider = "deepseek", prompt, options = {} } = await req.json();
    if (!prompt) {
      throw new Error('Missing required fields: provider and prompt.');
    }

    const handler = providerHandlers[provider];
    if (!handler) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    console.log(`[${request_id}] Routing to provider: ${provider}`);


    let finalPrompt = prompt;
    let isCompressed = false;
    const MAX_PROMPT_LENGTH = 15000; // Arbitrary high limit to trigger compression

    if (finalPrompt.length > MAX_PROMPT_LENGTH || options.forceCompression) {
        finalPrompt = finalPrompt.substring(0, MAX_PROMPT_LENGTH) + '... [Content Truncated]';
        isCompressed = true;
        console.log(`[${request_id}] Prompt compressed/truncated. length: ${finalPrompt.length}`);
    }

    // Determine actual provider used for logging
    let activeProvider = provider;

    // 4. Get the user's API key using the secure service client.
    const apiKey = await getApiKey(serviceClient, user.id, provider);
    if (!apiKey) {
      console.error(`[${request_id}] Forbidden: API key for ${provider} not found for user ${user.id}.`);
       return new Response(JSON.stringify({ error: `API key for provider '${provider}' is not configured.` }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Call the provider's handler with fallback logic
    try {
      const content = await handler(apiKey, finalPrompt, options);
      console.log(`[${request_id}] Successfully received response from ${provider}.`);

      // Log to database
      try {
          await serviceClient.from('ai_interactions_ax2024').insert({
              user_id: user.id,
              command_type: 'proxy_passthrough',
              llm_provider: activeProvider,
              llm_model: options.model || 'default',
              command: prompt,
              response: content,
              compressed: isCompressed
          });
      } catch (logError) {
          console.error(`[${request_id}] Failed to log interaction:`, logError);
      }

      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (providerError) {
      console.error(`[${request_id}] Upstream provider error from ${provider}:`, providerError);

      // Fallback Logic
      let fallbackProvider = 'claude';
      if (provider === 'claude') {
          fallbackProvider = 'openai';
      }

      console.log(`[${request_id}] Attempting fallback to ${fallbackProvider}`);

      try {
          const fallbackApiKey = await getApiKey(serviceClient, user.id, fallbackProvider);
          if (!fallbackApiKey) {
             throw new Error(`Fallback API key for ${fallbackProvider} not found.`);
          }

          const fallbackHandler = providerHandlers[fallbackProvider as keyof typeof providerHandlers];
          const fallbackContent = await fallbackHandler(fallbackApiKey, finalPrompt, options);

          console.log(`[${request_id}] Successfully received response from fallback provider ${fallbackProvider}.`);

          activeProvider = fallbackProvider;
          // Log fallback to database
          try {
              await serviceClient.from('ai_interactions_ax2024').insert({
                  user_id: user.id,
                  command_type: 'proxy_passthrough',
                  llm_provider: activeProvider,
                  llm_model: options.model || 'default',
                  command: prompt,
                  response: fallbackContent,
                  compressed: isCompressed
              });
          } catch (logError) {
              console.error(`[${request_id}] Failed to log interaction:`, logError);
          }

          return new Response(JSON.stringify({ content: fallbackContent, fallbackUsed: fallbackProvider }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
      } catch (fallbackError) {
          console.error(`[${request_id}] Upstream fallback provider error from ${fallbackProvider}:`, fallbackError);
          return new Response(JSON.stringify({ error: `Error from primary and fallback upstream providers.` }), {
            status: 502, // Bad Gateway
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
      }
    }

  } catch (error) {
    console.error(`[${request_id}] General llm-proxy error:`, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, // Bad Request for parsing errors or other client-side issues.
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
