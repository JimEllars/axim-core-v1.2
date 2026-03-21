import { describe, it, expect, vi, beforeEach } from 'vitest';
import commands from '../aiCommands';
import * as llm from '../../llm';

// Mock dependencies
vi.mock('../../llm');

describe('OnyxAI AI Commands', () => {

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('generateContent', () => {
    let command;
    beforeEach(() => {
      command = commands.find(c => c.name === 'generateContent');
    });

    it('should call llm.generateContent with the provided prompt', async () => {
      const prompt = 'Write a poem about a robot';
      llm.generateContent.mockResolvedValue('A robot poem');
      const result = await command.execute(prompt);
      expect(llm.generateContent).toHaveBeenCalledWith(prompt, {});
      expect(result).toBe('A robot poem');
    });

    it('should prepend conversation history to the prompt if provided in context', async () => {
      const prompt = 'Tell me more about that';
      const context = {
        conversationHistory: [
          { type: 'user', content: 'Who is the president?' },
          { type: 'assistant', content: 'I am not sure.' }
        ]
      };
      llm.generateContent.mockResolvedValue('More info');

      await command.execute(prompt, context);

      const expectedPrompt = `You are Onyx AI, an intelligent assistant. Use the following context to answer the user's request.\n\nSystem Context (Long-term Memory):\nNo long-term context available.\n\nPrevious Conversation (Short-term Memory):\nUser: Who is the president?\nAssistant: I am not sure.\n\nCurrent Request: ${prompt}`;
      expect(llm.generateContent).toHaveBeenCalledWith(expectedPrompt, {});
    });

    it('should throw an error if llm.generateContent fails', async () => {
      const prompt = 'Write a poem about a robot';
      const errorMessage = 'AI service is down';
      llm.generateContent.mockRejectedValue(new Error(errorMessage));
      await expect(command.execute(prompt)).rejects.toThrow(errorMessage);
    });
  });
});
