const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export async function handleOpenAI(apiKey: string, prompt: string, options: any) {
  const { model = 'gpt-4', max_tokens = 1024, temperature = 0.7 } = options;
  const response = await fetch(OPENAI_API_URL, {
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
    const errorData = await response.json();
    throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}