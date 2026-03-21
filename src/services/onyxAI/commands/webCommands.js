// src/services/onyxAI/commands/webCommands.js
import { createCommand } from './commandFactory';
import api from '../api';
import * as llm from '../llm';

const webCommands = [
  createCommand({
    name: 'fetch',
    description: 'Fetches the content of a URL and provides a summary.',
    keywords: ['fetch', 'get', 'read', 'summarize', 'url'],
    usage: 'fetch <url>',
    category: 'Web',
    entities: [{ name: 'URL', required: true, prompt: 'Please provide a URL to fetch.' }],
    async execute({ URL }) {
      try {
        const { content, error } = await api.fetchUrl(URL);

        if (error) {
          throw new Error(`Failed to fetch content from URL: ${error}`);
        }

        if (!content || content.trim().length === 0) {
          return 'Could not retrieve any readable content from the URL.';
        }

        const cleanedContent = content.replace(/\s+/g, ' ').trim();
        const truncatedContent = cleanedContent.substring(0, 4000);

        const summaryPrompt = `Please provide a concise summary of the following web content:\n\n---\n\n${truncatedContent}`;

        const summary = await llm.generateContent(summaryPrompt);

        return `✅ Summary for ${URL}:\n\n${summary}`;

      } catch (e) {
        console.error('Error in fetch command:', e);
        if (e.message.includes('invalid URL')) {
          throw new Error(`The provided URL "${URL}" is invalid. Please check and try again.`);
        }
        throw new Error(`An error occurred while trying to fetch the URL: ${e.message}`);
      }
    },
  }),
  createCommand({
    name: 'generateNews',
    description: 'Fetches content and rewrites it as a news article with embedded affiliate links.',
    keywords: ['news', 'article', 'rewrite', 'blog', 'generate news'],
    usage: 'generateNews <url>',
    category: 'Web',
    entities: [{ name: 'URL', required: true, prompt: 'Please provide a URL to process.' }],
    async execute({ URL }) {
      try {
        // Use the centralized Content Engine edge function
        // This handles scraping, LLM generation, link injection, and saving to DB.
        const response = await api.triggerContentEngine({ urls: [URL] });

        if (response.results && response.results.length > 0) {
            const result = response.results[0];
            if (result.status === 'failed') {
                throw new Error(result.error || 'Unknown error from content engine');
            }
            return `✅ **Article Generated Successfully**\n\n**Title:** ${result.title}\n**ID:** \`${result.id}\`\n\nThis article has been saved to the database. You can review and edit it in the "Generated Content" section of the dashboard.`;
        } else if (response.message) {
            return `✅ ${response.message}`;
        }

        return 'Content Engine triggered, but no specific result returned.';

      } catch (e) {
        throw new Error(`Failed to generate news article via Content Engine: ${e.message}`);
      }
    },
  }),
  createCommand({
    name: 'generateNewsFromTopic',
    description: 'Generates a news article about a specific topic.',
    keywords: ['news topic', 'write about', 'blog topic'],
    usage: 'generateNewsFromTopic <topic>',
    category: 'Web',
    entities: [{ name: 'Topic', required: true, prompt: 'Please provide a topic.' }],
    async execute({ Topic }) {
      try {
        const response = await api.triggerContentEngine({ topics: [Topic] });

        if (response.results && response.results.length > 0) {
            const result = response.results[0];
            if (result.status === 'failed') {
                throw new Error(result.error || 'Unknown error from content engine');
            }
            return `✅ **Article Generated Successfully**\n\n**Title:** ${result.title}\n**ID:** \`${result.id}\`\n\nThis article has been saved to the database. You can review and edit it in the "Generated Content" section of the dashboard.`;
        } else if (response.message) {
            return `✅ ${response.message}`;
        }

        return 'Content Engine triggered, but no specific result returned.';

      } catch (e) {
        throw new Error(`Failed to generate news article via Content Engine: ${e.message}`);
      }
    },
  }),
  createCommand({
    name: 'open',
    description: 'Opens a URL in a new browser tab.',
    keywords: ['open', 'visit', 'go', 'launch', 'browse'],
    usage: 'open <url>',
    category: 'Web',
    entities: [{ name: 'URL', required: true, prompt: 'Please provide a URL to open.' }],
    async execute({ URL }) {
      try {
        if (!URL.startsWith('http://') && !URL.startsWith('https://')) {
          URL = `https://${URL}`;
        }
        window.open(URL, '_blank', 'noopener,noreferrer');
        return `✅ Opening ${URL} in a new tab.`;
      } catch (e) {
        throw new Error(`An error occurred while trying to open the URL: ${e.message}`);
      }
    },
  }),
];

export default webCommands;
