// src/services/onyxAI/commands/__tests__/export.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import exportCommands from '../exportCommands';
import api from '../../api';
import Papa from 'papaparse';

vi.mock('../../api');
vi.mock('papaparse');

describe('OnyxAI Export Command', () => {
  const command = exportCommands.find(c => c.name === 'export');
  const mockAximCore = { conversationId: 'test-convo' };
  const mockUserId = 'test-user';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Chatlog Export', () => {
    it('should return a file_download object with JSON content for chatlog', async () => {
      const mockHistory = [{ command: 'test', response: 'ok' }];
      api.getChatHistoryForUser.mockResolvedValue(mockHistory);

      const result = await command.execute(
        { TYPE: 'chatlog', FORMAT: 'json' },
        { aximCore: mockAximCore, userId: mockUserId }
      );

      expect(api.getChatHistoryForUser).toHaveBeenCalledWith(mockUserId, mockAximCore.conversationId);
      expect(result.type).toBe('file_download');
      expect(result.filename).toMatch(/axim-chatlog-.*\.json/);
      expect(result.content).toBe(JSON.stringify(mockHistory, null, 2));
    });

     it('should return a message if no chat history is found', async () => {
      api.getChatHistoryForUser.mockResolvedValue([]);
      const result = await command.execute(
          { TYPE: 'chatlog', FORMAT: 'json' },
          { aximCore: mockAximCore, userId: mockUserId }
      );
      expect(result).toBe('No chat history available to export.');
    });
  });

  describe('Contacts Export', () => {
    it('should return a file_download object with CSV content for contacts', async () => {
      const mockContacts = [{ name: 'John Doe', email: 'john@example.com' }];
      api.listAllContacts.mockResolvedValue(mockContacts);
      Papa.unparse.mockReturnValue('name,email\nJohn Doe,john@example.com');

      const result = await command.execute(
        { TYPE: 'contacts', FORMAT: 'csv' },
        { aximCore: mockAximCore, userId: mockUserId }
      );

      expect(api.listAllContacts).toHaveBeenCalledWith({}, mockUserId);
      expect(result.type).toBe('file_download');
      expect(result.filename).toMatch(/axim-contacts-.*\.csv/);
      expect(result.content).toBe('name,email\nJohn Doe,john@example.com');
    });

    it('should return a message if no contacts are found', async () => {
      api.listAllContacts.mockResolvedValue([]);
      const result = await command.execute(
        { TYPE: 'contacts', FORMAT: 'json' },
        { aximCore: mockAximCore, userId: mockUserId }
      );
      expect(result).toBe('No contacts available to export.');
    });
  });

  describe('General Error Handling', () => {
     it('should throw an error for unsupported format', async () => {
        await expect(command.execute(
            { TYPE: 'contacts', FORMAT: 'xml' },
            { aximCore: mockAximCore, userId: mockUserId }
        )).rejects.toThrow('Unsupported format "xml". Please use "json" or "csv".');
     });

     it('should throw an error for unknown export type', async () => {
        await expect(command.execute(
            { TYPE: 'invoices', FORMAT: 'json' },
            { aximCore: mockAximCore, userId: mockUserId }
        )).rejects.toThrow('Unknown export type "invoices". Supported types are "chatlog" and "contacts".');
     });

    it('should throw an error if aximCore is not available', async () => {
      await expect(command.execute({ TYPE: 'chatlog', FORMAT: 'json' }, { userId: mockUserId })).rejects.toThrow('AximCore service is not available or user is not initialized.');
    });
  });
});
