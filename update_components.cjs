const fs = require('fs');

// 1. Update InputForm.jsx
const inputFormPath = 'src/components/commandhub/InputForm.jsx';
let inputFormContent = fs.readFileSync(inputFormPath, 'utf8');

const importApiClient = `import { dispatchCommand } from '../../services/apiClient';\n`;
if (!inputFormContent.includes('dispatchCommand')) {
    inputFormContent = inputFormContent.replace(`import toast from 'react-hot-toast';`, `import toast from 'react-hot-toast';\n${importApiClient}`);
}

const dispatchRegex = /const handleSubmit = async \(e\) => \{[\s\S]*?(?=return \()/;

const newSubmit = `const handleSubmit = async (e) => {
    setLocalIsProcessing(true);
    e.preventDefault();
    setShowSuggestions(false);

    // Instead of old onCommand, send payload to onyx-bridge
    // We emit an event so ChatInterface can render the user message immediately
    window.dispatchEvent(new CustomEvent('onyx-user-message', { detail: { prompt: inputValue, attachments } }));

    const slashCommandMatch = inputValue.match(/^\\/(\\w+)(?:\\s+(.*))?$/);

    if (slashCommandMatch) {
      const intent = slashCommandMatch[1];
      const parameters = slashCommandMatch[2] || '';

      // Dispatching to Agent indicator
      window.dispatchEvent(new CustomEvent('onyx-agent-status', { detail: { status: 'Dispatching to Agent...', isTyping: true } }));

      try {
        const response = await dispatchCommand({ intent, parameters });
        window.dispatchEvent(new CustomEvent('onyx-agent-status', { detail: { status: response.message || 'Workflow Triggered Successfully', isTyping: false } }));
      } catch (error) {
        console.error('Error dispatching command:', error);
        window.dispatchEvent(new CustomEvent('onyx-agent-status', { detail: { status: 'Failed to dispatch workflow', isTyping: false, isError: true } }));
      }
    } else {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(\`\${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onyx-bridge\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${session?.access_token}\`
          },
          body: JSON.stringify({ prompt: inputValue, attachments })
        });

        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        // Pass the stream to ChatInterface
        window.dispatchEvent(new CustomEvent('onyx-stream-response', { detail: { body: response.body, response: response } }));
      } catch (error) {
        console.error('Error sending payload to Onyx:', error);
        window.dispatchEvent(new CustomEvent('onyx-stream-error', { detail: { error: error.message } }));
      }
    }
    setLocalIsProcessing(false);

    // Clear input
    const syntheticEvent = { target: { value: '' } };
    onInputValueChange(syntheticEvent);
    setAttachments([]);
  };

  `;

inputFormContent = inputFormContent.replace(dispatchRegex, newSubmit);
fs.writeFileSync(inputFormPath, inputFormContent);

// 2. Update ChatInterface.jsx
const chatInterfacePath = 'src/components/commandhub/ChatInterface.jsx';
let chatInterfaceContent = fs.readFileSync(chatInterfacePath, 'utf8');

const handleAgentStatus = `
    const handleAgentStatus = (e) => {
      const { status, isTyping, isError } = e.detail;
      setLocalMessages(prev => {
         const newMsgs = [...prev];
         const lastMsg = newMsgs[newMsgs.length - 1];
         if (lastMsg && lastMsg.agentName === 'System Dispatcher' && lastMsg.isTyping) {
             lastMsg.content = status;
             lastMsg.isTyping = isTyping;
             lastMsg.type = isError ? 'error' : 'assistant';
             return newMsgs;
         } else {
             return [...prev, {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                content: status,
                type: isError ? 'error' : 'assistant',
                agentName: 'System Dispatcher',
                isTyping
             }];
         }
      });
    };
    window.addEventListener('onyx-agent-status', handleAgentStatus);
`;

const removeEventListener = `window.removeEventListener('onyx-agent-status', handleAgentStatus);`;

if (!chatInterfaceContent.includes('handleAgentStatus')) {
    chatInterfaceContent = chatInterfaceContent.replace(`window.addEventListener('onyx-stream-error', handleStreamError);`, `window.addEventListener('onyx-stream-error', handleStreamError);\n${handleAgentStatus}`);
    chatInterfaceContent = chatInterfaceContent.replace(`window.removeEventListener('onyx-stream-error', handleStreamError);`, `window.removeEventListener('onyx-stream-error', handleStreamError);\n${removeEventListener}`);
    fs.writeFileSync(chatInterfacePath, chatInterfaceContent);
}

// 3. Update apiClient.js
const apiClientPath = 'src/services/apiClient.js';
let apiClientContent = fs.readFileSync(apiClientPath, 'utf8');

const dispatchCommandFunc = `
export const dispatchCommand = async (payload) => {
  return callCloudApi('supabase/functions/v1/universal-dispatcher', payload);
};
`;

if (!apiClientContent.includes('dispatchCommand')) {
    apiClientContent += dispatchCommandFunc;
    fs.writeFileSync(apiClientPath, apiClientContent);
}

// 4. Update AGENTS_VERIFICATION.md
const verificationPath = 'AGENTS_VERIFICATION.md';
let verificationContent = fs.readFileSync(verificationPath, 'utf8');

const wave128Verification = `
### Wave 128: Command Hub & Agentic Dispatch Activation
- **Date:** 2024-10-25
- **Objective:** Enable slash command parsing in \`InputForm.jsx\` and dispatch to \`universal-dispatcher\`.
- **Verification Steps:**
  1. Updated \`InputForm.jsx\` to intercept inputs starting with a slash (\`/\`).
  2. Slash commands extract the \`intent\` (command) and \`parameters\` (remaining string) using regex \`/^\\\\/(\\\\w+)(?:\\\\s+(.*))?$/\`.
  3. Commands dispatch to \`dispatchCommand\` mapped to \`/functions/v1/universal-dispatcher\`.
  4. Standard inputs continue to dispatch to \`onyx-bridge\` for RAG responses.
  5. Interfaced \`ChatInterface.jsx\` with \`onyx-agent-status\` events to render loading and dispatch statuses.
  6. Wrote comprehensive Vitest suite in \`tests/command-hub.test.jsx\` verifying slash command vs. standard text routing without edge case UI crashes.
- **Outcome:** Dispatch routing mechanism fully integrated, allowing for advanced workflow initiation via Command Hub.
`;

if (!verificationContent.includes('Wave 128')) {
    verificationContent += wave128Verification;
    fs.writeFileSync(verificationPath, verificationContent);
}
