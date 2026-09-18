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
  console.log(`[${request_id}] New llm-proxy request received.`);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const isInternalCall = authHeader.replace('Bearer ', '') === Deno.env.get('AXIM_GATEWAY_TOKEN');

    // 1. Create a Supabase client with the SERVICE_ROLE_KEY for admin operations.
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let user = null;

    if (!isInternalCall) {
      // 2. Authenticate the user from the Authorization header.
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) {
        console.error(`[${request_id}] Unauthorized: User authentication failed.`, userError);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = userData.user;
      console.log(`[${request_id}] Authenticated user: ${user.id}`);

      // Rate Limiting Check
      if (!checkRateLimit(user.id)) {
          console.warn(`[${request_id}] Rate limit exceeded for user: ${user.id}`);
          return new Response(JSON.stringify({ error: "Too Many Requests" }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
          });
      }
    } else {
       console.log(`[${request_id}] Authenticated internal call using AXIM_GATEWAY_TOKEN.`);
       user = { id: 'internal-system' };
    }

    // 3. Parse the request body.
    let { provider, prompt, options = {} } = await req.json();

    // Workstream B: Explicit default provider policy. Wave 55 used deepseek for cost.
    if (!provider || provider.trim() === '') {
        provider = 'deepseek';
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

    let apiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!apiKey && user.id !== 'internal-system') {
      try {
        apiKey = await getApiKey(serviceClient, user.id, 'deepseek');
      } catch(e) {}
    }

    if (!apiKey) {
      console.error(`[${request_id}] Forbidden: API key for deepseek not found.`);
       return new Response(JSON.stringify({ error: `API key for provider 'deepseek' is not configured.` }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let fallbackApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!fallbackApiKey && user.id !== 'internal-system') {
      try {
        fallbackApiKey = await getApiKey(serviceClient, user.id, 'claude');
      } catch (e) {
        console.warn(`[${request_id}] Fallback API key for claude not found.`);
      }
    }

    const messages = [{ role: 'user', content: finalPrompt }];
    const stream = options.stream === true;

    // Dispatch to DeepSeek directly
    let response;
    let respondingProvider = 'deepseek';
    let failedOver = false;

    const deepseekBaseUrl = Deno.env.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1';

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000);

    const startTime = Date.now();
    let directUrl = `${deepseekBaseUrl}/chat/completions`;

    try {
        console.log(`[${request_id}] Dispatching to DeepSeek (${directUrl})...`);
        response = await fetch(directUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: options.model || 'deepseek-chat',
                messages: messages,
                max_tokens: options.max_tokens || 1024,
                temperature: options.temperature || 0.7,
                stream: stream
            }),
            signal: abortController.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
           let errMessage = response.statusText;
           try {
               const errData = await response.json();
               errMessage = JSON.stringify(errData);
           } catch(e) {}
           throw new Error(`[${response.status}] ${errMessage}`);
        }

    } catch (error: any) {
        clearTimeout(timeoutId);
        console.warn(`[${request_id}] [llm-proxy] DeepSeek failed (${error.status || error.message}). Failing over to Anthropic.`);

        if (!fallbackApiKey) {
           throw new Error(`DeepSeek failed and Anthropic fallback key is not available. Error: ${error.message}`);
        }

        failedOver = true;
        respondingProvider = 'anthropic';

        const anthropicBaseUrl = Deno.env.get('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com/v1';
        directUrl = `${anthropicBaseUrl}/messages`;

        // Transform for Anthropic
        let systemMessage = undefined;
        let anthropicMessages = messages.map(m => {
           if (m.role === 'system') {
               systemMessage = m.content;
               return null;
           }
           return m;
        }).filter(m => m !== null);

        if (anthropicMessages.length > 0 && anthropicMessages[0].role !== 'user') {
            anthropicMessages[0].role = 'user';
        }

        console.log(`[${request_id}] Dispatching to Anthropic (${directUrl})...`);
        response = await fetch(directUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': fallbackApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                messages: anthropicMessages,
                system: systemMessage,
                max_tokens: options.max_tokens || 1024,
                temperature: options.temperature || 0.7,
                stream: stream
            })
        });

        if (!response.ok) {
            let errMessage = response.statusText;
            try {
                const errData = await response.json();
                errMessage = JSON.stringify(errData);
            } catch(e) {}
            throw new Error(`Anthropic Fallback Error: [${response.status}] ${errMessage}`);
        }
    }

    const executionLatency = Date.now() - startTime;

    if (stream) {
        let streamBody = response.body;

        if (failedOver) {
             // Translate Anthropic SSE events to OpenAI format
             const transformStream = new TransformStream({
                 transform(chunk, controller) {
                     const decoder = new TextDecoder();
                     const text = decoder.decode(chunk);
                     const lines = text.split('\n');

                     for (const line of lines) {
                         if (line.startsWith('data: ')) {
                             try {
                                 const data = JSON.parse(line.substring(6));
                                 if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                                     const openAiChunk = {
                                         choices: [{
                                             delta: {
                                                 content: data.delta.text
                                             }
                                         }]
                                     };
                                     controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAiChunk)}\n\n`));
                                 }
                             } catch(e) {
                                 // ignore parsing errors for incomplete chunks
                             }
                         }
                     }
                 }
             });

             streamBody = response.body?.pipeThrough(transformStream) || null;
        }

        return new Response(streamBody, {
           headers: {
               ...corsHeaders,
               'Content-Type': 'text/event-stream',
               'x-axim-provider-used': respondingProvider,
               'x-axim-failover': failedOver.toString()
           }
        });
    }

    const data = await response.json();

    let content = "";
    if (respondingProvider === 'deepseek' && data.choices && data.choices.length > 0) {
        content = data.choices[0].message.content;
    } else if (respondingProvider === 'anthropic' && data.content && data.content.length > 0) {
        content = data.content[0].text;
    } else {
        content = JSON.stringify(data); // Fallback for unknown structure
    }

    // Log to database
    try {
        await serviceClient.from('api_usage_logs').insert({
          endpoint: '/llm-proxy',
          status_code: 200,
          compute_ms: executionLatency,
          app_id: 'axim-llm-proxy',
          payload: { provider: respondingProvider, failedOver, token_usage: data.usage || null }
        });

        if (user.id !== 'internal-system') {
            await serviceClient.from('ai_interactions_ax2024').insert({
                user_id: user.id,
                command_type: 'proxy_passthrough',
                llm_provider: respondingProvider,
                llm_model: options.model || (respondingProvider === 'deepseek' ? 'deepseek-chat' : 'claude-3-5-sonnet-20241022'),
                command: prompt,
                response: content,
                compressed: isCompressed,
                metadata: {
                    failedOver: failedOver
                }
            });
        }
    } catch (logError) {
        console.error(`[${request_id}] Failed to log interaction:`, logError);
    }

    return new Response(JSON.stringify({ content, respondingProvider, failedOver }), {
      headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'x-axim-provider-used': respondingProvider,
          'x-axim-failover': failedOver.toString()
      },
    });

  } catch (error: any) {
    console.error(`[${request_id}] General llm-proxy error:`, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, // Bad Request for parsing errors or other client-side issues.
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
