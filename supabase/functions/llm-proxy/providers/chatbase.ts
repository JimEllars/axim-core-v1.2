const CHATBASE_API_URL = 'https://www.chatbase.co/api/v1/chat';

export async function handleChatbase(apiKey: string, prompt: string, options: any) {
  const { chatbotId = '' } = options;

  if (!chatbotId) {
     throw new Error("Chatbase requires a chatbotId in options.");
  }

  const response = await fetch(CHATBASE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      chatbotId: chatbotId,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Chatbase API Error: ${errorData.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.text,
    cached: response.headers.get('cf-aig-cache-status') === 'HIT'
  };
}
