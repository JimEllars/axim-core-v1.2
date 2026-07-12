const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export async function handleClaude(apiKey: string, prompt: string, options: any) {
  const { model = 'claude-3-haiku-20240307', max_tokens = 1024, temperature = 0.7 } = options;

  const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const cfGatewayId = Deno.env.get('CLOUDFLARE_GATEWAY_ID');

  const baseUrl = (cfAccountId && cfGatewayId)
    ? `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayId}/anthropic/v1/messages`
    : ANTHROPIC_API_URL;

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
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
    throw new Error(`Anthropic API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text,
    cached: response.headers.get('cf-aig-cache-status') === 'HIT'
  };
}
