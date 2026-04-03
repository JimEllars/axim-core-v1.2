import { createCommand } from './commandFactory';
import logger from '../../logging';
import { CommandExecutionError } from '../errors';

export default [
  createCommand({
    name: 'searchMemory',
    description: 'Searches past AI conversations for keywords.',
    keywords: ['search memory', 'recall', 'find chat', 'search chat'],
    category: 'Memory',
    usage: 'search memory <keyword>',
    entities: [
      { name: 'query', required: true, prompt: 'What would you like to search for in my memory?' }
    ],
    parse: (input) => {
      // Matches: "search memory for something" or "recall something"
      const match = input.match(/(?:search memory|recall|find chat|search chat)(?:\s+for)?\s+(.+)/i);
      if (match) {
        return { query: match[1].trim() };
      }
      return {};
    },
    execute: async ({ query }, { aximCore, userId }) => {
      // Validate that we have the necessary context
      if (!userId) {
        throw new CommandExecutionError('Cannot search memory: User ID not found in context.');
      }

      try {
        const results = await aximCore.api.searchChatHistory(query, userId);

        if (!results || results.length === 0) {
          return {
              type: 'text',
              message: `I couldn't find any past conversations matching "${query}".`
          };
        }

        const formattedResults = results.map(r => {
          const date = new Date(r.created_at).toLocaleString();
          return `**${date}**\n> User: ${r.command}\n> AI: ${r.response}`;
        }).join('\n\n');

        return {
            type: 'markdown',
            message: `### Memory Search Results for "${query}"\n\n${formattedResults}`
        };
      } catch (error) {
        logger.error('Error executing searchMemory command:', error);
        throw new CommandExecutionError(`Failed to search memory: ${error.message}`);
      }
    }
  })
];
