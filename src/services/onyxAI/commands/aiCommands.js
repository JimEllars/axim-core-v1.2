// src/services/onyxAI/commands/aiCommands.js
import { createCommand } from './commandFactory';
import * as llm from '../llm';

const aiCommands = [
  createCommand({
    name: 'generateContent',
    description: 'Generates content using AI. This is the default fallback command.',
    keywords: ['generate', 'create', 'write', 'tell me'],
    usage: 'generate <prompt>',
    category: 'AI',
    isDefault: true,
    entities: [],
    // The default command receives the entire, unmodified input as its argument.
    parse: (input) => input,
    async execute(prompt, context) {
      if (!prompt) {
        return "Please provide a prompt for content generation.";
      }

      let enhancedPrompt = prompt;
      const llmOptions = {};

      // Check for forced provider in options (e.g. Chatbase agent)
      if (context && context.options && context.options.provider) {
        llmOptions.provider = context.options.provider;
        if (context.options.chatbotId) {
          llmOptions.chatbotId = context.options.chatbotId;
        }
      }

      // 1. Vector Database Integration (RAG)
      let ragContextText = "";
      if (context && context.aximCore && context.aximCore.api) {
        try {
          const queryEmbedding = await llm.generateEmbedding(prompt);
          const relevantMemories = await context.aximCore.api.searchMemory(queryEmbedding, 5, context.userId); // fetching 5 deep contexts
          if (relevantMemories && relevantMemories.length > 0) {
             ragContextText = relevantMemories.map(m => `Prior Context (${m.created_at}): User asked "${m.command}". Response: "${m.response}"`).join('\n');
          }
        } catch (error) {
          console.warn("Failed to retrieve RAG context:", error);
        }
      }

      // Inject conversation history if available
      let historyText = "";
      if (context && context.conversationHistory && context.conversationHistory.length > 0) {
        // Take the last 5 messages for context
        const history = context.conversationHistory.slice(-5);
        historyText = history.map(msg => `${msg.type === 'user' ? 'User' : 'Assistant'}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`).join('\n');
      }

      if (historyText || ragContextText) {
        enhancedPrompt = `You are Onyx AI, an intelligent assistant. Use the following context to answer the user's request.

System Context (Long-term Memory):
${ragContextText ? ragContextText : "No long-term context available."}

Previous Conversation (Short-term Memory):
${historyText ? historyText : "No recent conversation history."}

Current Request: ${prompt}`;
      }

      try {
        if (context && context.aximCore && context.aximCore.api && typeof context.aximCore.api.sendToOnyxWorker === 'function') {
           const workerResponse = await context.aximCore.api.sendToOnyxWorker({ prompt: enhancedPrompt, options: llmOptions, context: historyText });
           return workerResponse.content || workerResponse.response || workerResponse;
        }
      } catch(e) {
        console.warn("Failed to contact Onyx Worker natively:", e);
      }

      return await llm.generateContent(enhancedPrompt, llmOptions);
    }
  }),
  createCommand({
    name: 'testAgent',
    description: 'Tests connectivity with the currently active AI agent.',
    keywords: ['test agent', 'ping agent', 'test connection'],
    usage: 'test agent',
    category: 'AI',
    async execute(args, context) {
      const llmOptions = {};
      let agentName = 'Default Agent';

      if (context && context.options && context.options.provider) {
        llmOptions.provider = context.options.provider;
        agentName = context.options.agentName || context.options.provider;
        if (context.options.chatbotId) {
          llmOptions.chatbotId = context.options.chatbotId;
        }
      }

      try {
        // Use a short timeout or specific prompt to verify
        const response = await llm.generateContent("This is a connectivity test. Please reply with 'Online'.", llmOptions);
        return `✅ **Connection Successful**\nAgent: ${agentName}\nResponse: ${response}`;
      } catch (error) {
        return `❌ **Connection Failed**\nAgent: ${agentName}\nError: ${error.message}`;
      }
    }
  }),
];

export default aiCommands;
