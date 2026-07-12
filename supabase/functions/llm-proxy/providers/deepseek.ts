const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function handleDeepseek(apiKey: string, prompt: string, options: any) {
  const { model = 'deepseek-chat', max_tokens = 1024, temperature = 0.7 } = options;

  // Note: DeepSeek might not be supported natively by CF AI Gateway yet, but we will pass it
  // through the universal endpoint if needed, or fallback. Assuming standard OpenAI compatibility format
  const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const cfGatewayId = Deno.env.get('CLOUDFLARE_GATEWAY_ID');

  const baseUrl = DEEPSEEK_API_URL; // DeepSeek might not be supported via CF Gateway yet so we default to original API

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`DeepSeek API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    cached: response.headers.get('cf-aig-cache-status') === 'HIT'
  };
}
