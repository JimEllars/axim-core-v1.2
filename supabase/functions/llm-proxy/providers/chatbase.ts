
const CHATBASE_API_URL = 'https://www.chatbase.co/api/v1/chat';

export async function handleChatbase(apiKey: string, prompt: string, options: any) {
  const { chatbotId } = options;

  if (!chatbotId) {
    throw new Error('Chatbot ID is required for Chatbase provider.');
  }

  const response = await fetch(CHATBASE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ content: prompt, role: 'user' }],
      chatbotId: chatbotId,
      stream: false,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Chatbase API Error: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Chatbase API Error: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.text;
}
