// src/services/onyxAI/commands/__tests__/emailCommands.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import emailCommands from '../emailCommands';
import api from '../../api';

// Find the command object
const sendEmailCommand = emailCommands.find(c => c.name === 'sendEmail');

describe('emailCommands', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendEmail', () => {
    it('should parse simple "email <recipient> <message>" command', () => {
      const input = 'email test@example.com Hello world';
      const parsed = sendEmailCommand.parse(input);
      expect(parsed).toEqual({
        RECIPIENT: 'test@example.com',
        MESSAGE: 'Hello world'
      });
    });

    it('should resolve known aliases like "CTO"', () => {
      const input = 'email cto Please check the server';
      const parsed = sendEmailCommand.parse(input);
      // The parser returns the alias value from the directory if found
      expect(parsed.RECIPIENT).toBe('agent@vn0nwrgyd5.chatbase-mail.com');
      expect(parsed.MESSAGE).toBe('Please check the server');
    });

    it('should resolve multi-word aliases like "James Ellars"', () => {
      const input = 'email James Ellars Urgent update needed';
      const parsed = sendEmailCommand.parse(input);
      expect(parsed.RECIPIENT).toBe('james.ellars@axim.us.com');
      expect(parsed.MESSAGE).toBe('Urgent update needed');
    });

    it('should resolve "consult operations" correctly', () => {
        const input = 'consult operations regarding the new policy';
        const parsed = sendEmailCommand.parse(input);
        expect(parsed.RECIPIENT).toBe('agent@3doof7t5ug.chatbase-mail.com');
        expect(parsed.MESSAGE).toBe('regarding the new policy');
    });

    it('should handle "ask legal agent" correctly', () => {
        const input = 'ask legal agent about the contract';
        const parsed = sendEmailCommand.parse(input);
        expect(parsed.RECIPIENT).toBe('agent@hsck64k24f.chatbase-mail.com');
        expect(parsed.MESSAGE).toBe('about the contract');
    });

    it('should fallback to first word if alias not found but looks like a name', () => {
        const input = 'email Bob Where are you?';
        const parsed = sendEmailCommand.parse(input);
        // "Bob" is not in directory, so it returns "bob" (normalized) to be validated later
        expect(parsed.RECIPIENT).toBe('bob');
        expect(parsed.MESSAGE).toBe('Where are you?');
    });

    it('should execute successfully with valid email', async () => {
      const mockApi = vi.spyOn(api, 'sendEmail').mockResolvedValue({ success: true });
      const args = { RECIPIENT: 'test@example.com', MESSAGE: 'Hello' };
      const context = { userId: 'user-123' };

      const result = await sendEmailCommand.execute(args, context);

      expect(mockApi).toHaveBeenCalledWith(
        'test@example.com',
        'Consultation Request from AXiM Core',
        expect.stringContaining('Hello'), // Check for message body
        'user-123'
      );
      expect(result).toContain('successfully sent');
    });

    it('should throw error for invalid email/unknown alias during execution', async () => {
      const args = { RECIPIENT: 'UnknownPerson', MESSAGE: 'Hi' };
      const context = { userId: 'user-123' };

      await expect(sendEmailCommand.execute(args, context))
        .rejects
        .toThrow(/Invalid email address or unknown alias/);
    });
  });
});
