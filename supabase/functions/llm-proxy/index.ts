import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';

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

  // Update cache immediately to prevent cache stampedes with verified TTL
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
  console.log(`[${request_id}] New llm-proxy request received via Cloudflare AI Gateway Universal Endpoint.`);

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
    let { provider, prompt, options = {} } = await req.json();
    if (!provider || provider.trim() === '') {
        provider = 'openai';
    }

    if (!prompt) {
      throw new Error('Missing required fields: provider and prompt.');
    }

    let finalPrompt = prompt;
    let isCompressed = false;
    // Strict 15,000-character input truncation perimeter bounds
    const MAX_PROMPT_LENGTH = 15000;

    if (finalPrompt.length > MAX_PROMPT_LENGTH) {
        finalPrompt = finalPrompt.substring(0, MAX_PROMPT_LENGTH);
        isCompressed = true;
        console.log(`[${request_id}] Prompt truncated to strictly ${MAX_PROMPT_LENGTH} characters. length: ${finalPrompt.length}`);
    } else if (options.forceCompression) {
        isCompressed = true;
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

    // Attempt to get a fallback key
    let fallbackProvider = provider === 'claude' ? 'openai' : 'claude';
    let fallbackApiKey = null;
    try {
        fallbackApiKey = await getApiKey(serviceClient, user.id, fallbackProvider);
    } catch (e) {
        console.warn(`[${request_id}] Fallback API key for ${fallbackProvider} not found, skipping fallback routing.`);
    }

    // 5. Construct Universal Endpoint Payload for Cloudflare AI Gateway
    const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const cfGatewayId = Deno.env.get('CLOUDFLARE_GATEWAY_ID');

    if (!cfAccountId || !cfGatewayId) {
        throw new Error("Missing Cloudflare AI Gateway Configuration (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_GATEWAY_ID)");
    }

    const universalEndpoint = `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayId}`;

    const messages = [{ role: 'user', content: finalPrompt }];

    // Construct the provider configurations for the universal payload
    const providerList = [];

    if (provider === 'openai') {
        providerList.push({
            provider: 'openai',
            endpoint: 'chat/completions',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            query: {
                model: options.model || 'gpt-4o-mini',
                messages: messages,
                max_tokens: options.max_tokens || 1024,
                temperature: options.temperature || 0.7
            }
        });
    } else if (provider === 'claude') {
        providerList.push({
            provider: 'anthropic',
            endpoint: 'v1/messages',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            query: {
                model: options.model || 'claude-3-haiku-20240307',
                messages: messages,
                max_tokens: options.max_tokens || 1024,
                temperature: options.temperature || 0.7
            }
        });
    } else if (provider === 'gemini') {
        providerList.push({
            provider: 'google-ai-studio',
            endpoint: `v1beta/models/${options.model || 'gemini-pro'}:generateContent?key=${apiKey}`,
            query: {
                contents: [{ parts: [{ text: finalPrompt }] }],
                generationConfig: {
                    maxOutputTokens: options.max_tokens || 1024,
                    temperature: options.temperature || 0.7
                }
            }
        });
    } else {
        throw new Error(`Provider ${provider} is not supported by the universal routing gateway.`);
    }

    // Add fallback if configured
    if (fallbackApiKey && provider !== fallbackProvider) {
        if (fallbackProvider === 'openai') {
            providerList.push({
                provider: 'openai',
                endpoint: 'chat/completions',
                headers: {
                    'Authorization': `Bearer ${fallbackApiKey}`
                },
                query: {
                    model: 'gpt-4o-mini',
                    messages: messages,
                    max_tokens: options.max_tokens || 1024,
                    temperature: options.temperature || 0.7
                }
            });
        } else if (fallbackProvider === 'claude') {
            providerList.push({
                provider: 'anthropic',
                endpoint: 'v1/messages',
                headers: {
                    'x-api-key': fallbackApiKey,
                    'anthropic-version': '2023-06-01'
                },
                query: {
                    model: 'claude-3-haiku-20240307',
                    messages: messages,
                    max_tokens: options.max_tokens || 1024,
                    temperature: options.temperature || 0.7
                }
            });
        }
    }

    console.log(`[${request_id}] Dispatching to Cloudflare AI Gateway Universal Endpoint...`);

    const response = await fetch(universalEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(providerList),
    });

    if (!response.ok) {
        let errMessage = response.statusText;
        try {
            const errData = await response.json();
            errMessage = JSON.stringify(errData);
        } catch(e) {}
        throw new Error(`Cloudflare AI Gateway Error: ${errMessage}`);
    }

    const data = await response.json();

    // Parse response headers for caching status
    const cached = response.headers.get('cf-aig-cache-status') === 'HIT';
    const respondingProvider = response.headers.get('cf-aig-provider') || provider;

    console.log(`[${request_id}] Successfully received response from CF AI Gateway. Cached: ${cached}, Responding Provider: ${respondingProvider}`);

    let content = "";
    if (respondingProvider === 'openai' && data.choices && data.choices.length > 0) {
        content = data.choices[0].message.content;
    } else if (respondingProvider === 'anthropic' && data.content && data.content.length > 0) {
        content = data.content[0].text;
    } else if (respondingProvider === 'google-ai-studio' && data.candidates && data.candidates.length > 0) {
        content = data.candidates[0].content.parts[0].text;
    } else {
        content = JSON.stringify(data); // Fallback for unknown structure
    }

    // Log to database
    try {
        await serviceClient.from('ai_interactions_ax2024').insert({
            user_id: user.id,
            command_type: 'proxy_passthrough',
            llm_provider: respondingProvider,
            llm_model: options.model || 'default',
            command: prompt,
            response: content,
            compressed: isCompressed,
            // Record cache status for metrics
            metadata: {
                cached: cached,
                fallback: respondingProvider !== provider && respondingProvider !== 'anthropic' // anthropic is used for claude in CF AIG
            }
        });
    } catch (logError) {
        console.error(`[${request_id}] Failed to log interaction:`, logError);
    }

    return new Response(JSON.stringify({ content, cached, respondingProvider }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error(`[${request_id}] General llm-proxy error:`, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, // Bad Request for parsing errors or other client-side issues.
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
