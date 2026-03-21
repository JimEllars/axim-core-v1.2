const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';

export async function handleGemini(apiKey: string, prompt: string, options: any) {
  const { max_tokens = 1024, temperature = 0.7, json = false } = options;
  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  const generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    response_mime_type?: string;
  } = {
    temperature,
    maxOutputTokens: max_tokens,
  };

  if (json) {
    generationConfig.response_mime_type = "application/json";
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}