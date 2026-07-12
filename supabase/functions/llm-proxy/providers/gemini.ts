const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function handleGemini(apiKey: string, prompt: string, options: any) {
  const { model = 'gemini-pro', max_tokens = 1024, temperature = 0.7 } = options;

  const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const cfGatewayId = Deno.env.get('CLOUDFLARE_GATEWAY_ID');

  const urlParams = `?key=${apiKey}`;
  const baseUrl = (cfAccountId && cfGatewayId)
    ? `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${cfGatewayId}/google-ai-studio/v1beta/models/${model}:generateContent${urlParams}`
    : `${GEMINI_API_URL}/${model}:generateContent${urlParams}`;

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: max_tokens,
        temperature: temperature,
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    cached: response.headers.get('cf-aig-cache-status') === 'HIT'
  };
}
