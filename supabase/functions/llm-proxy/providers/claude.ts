const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export async function handleClaude(apiKey: string, prompt: string, options: any) {
  const { model = 'claude-3-haiku-20240307', max_tokens = 1024, temperature = 0.7 } = options;
  const response = await fetch(ANTHROPIC_API_URL, {
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
    const errorData = await response.json();
    throw new Error(`Anthropic API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}