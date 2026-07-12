const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export async function handleOpenAI(apiKey: string, prompt: string, options: any) {
  const { model = 'gpt-4', max_tokens = 1024, temperature = 0.7 } = options;

  // Use Cloudflare AI Gateway if configured
  const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const cfGatewayId = Deno.env.get('CLOUDFLARE_GATEWAY_ID');

  const baseUrl = (cfAccountId && cfGatewayId)
    ? `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayId}/openai/chat/completions`
    : OPENAI_API_URL;

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
    throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    cached: response.headers.get('cf-aig-cache-status') === 'HIT'
  };
}
