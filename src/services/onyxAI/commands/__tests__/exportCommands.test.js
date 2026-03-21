// src/services/onyxAI/commands/__tests__/exportCommands.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import exportCommands from '../exportCommands';
import api from '../../api';

// Mock the entire api module
vi.mock('../../api');

const exportCommand = exportCommands[0];

describe('exportCommand', () => {
  const mockAximCore = { conversationId: 'test-convo-id' };
  const mockUserId = 'test-user-id';
  const mockContext = { aximCore: mockAximCore, userId: mockUserId };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Validation and Parsing', () => {
    it('should correctly parse the export type and format', () => {
      const result = exportCommand.parse('export contacts as csv', {});
      expect(result.TYPE).toBe('contacts');
      expect(result.FORMAT).toBe('csv');
    });

    it('should throw an error for an unsupported format', async () => {
      const args = { TYPE: 'chatlog', FORMAT: 'xml' };
      await expect(exportCommand.execute(args, mockContext)).rejects.toThrow('Unsupported format "xml". Please use "json" or "csv".');
    });

    it('should throw an error for an unknown export type', async () => {
      const args = { TYPE: 'emails', FORMAT: 'json' };
      await expect(exportCommand.execute(args, mockContext)).rejects.toThrow('Unknown export type "emails". Supported types are "chatlog" and "contacts".');
    });
  });

  describe('Chatlog Export', () => {
    const mockChatlog = [
      { user: 'test', response: 'Hello', timestamp: '2025-01-01T12:00:00Z' },
      { user: 'test', response: { data: 'complex' }, timestamp: '2025-01-01T12:01:00Z' },
    ];

    it('should export chatlog as JSON', async () => {
      api.getChatHistoryForUser.mockResolvedValue(mockChatlog);
      const args = { TYPE: 'chatlog', FORMAT: 'json' };
      const result = await exportCommand.execute(args, mockContext);

      expect(api.getChatHistoryForUser).toHaveBeenCalledWith(mockUserId, mockAximCore.conversationId);
      expect(result.type).toBe('file_download');
      expect(result.filename).toMatch(/axim-chatlog-.*\.json/);
      expect(result.content).toBe(JSON.stringify(mockChatlog, null, 2));
    });

    it('should export chatlog as CSV', async () => {
      api.getChatHistoryForUser.mockResolvedValue(mockChatlog);
      const args = { TYPE: 'chatlog', FORMAT: 'csv' };
      const result = await exportCommand.execute(args, mockContext);

      expect(result.type).toBe('file_download');
      expect(result.filename).toMatch(/axim-chatlog-.*\.csv/);
      // The header itself doesn't need to be quoted
      expect(result.content).toContain('response');
      // The simple value doesn't need to be quoted
      expect(result.content).toContain('Hello');
      // Check that the object in the response field was correctly stringified and quoted
      expect(result.content).toContain('"{""data"":""complex""}"');
    });

    it('should return a message if no chatlog data is available', async () => {
      api.getChatHistoryForUser.mockResolvedValue([]);
      const args = { TYPE: 'chatlog', FORMAT: 'json' };
      const result = await exportCommand.execute(args, mockContext);
      expect(result).toBe('No chat history available to export.');
    });
  });

  describe('Contacts Export', () => {
    const mockContacts = [
      { name: 'John Doe', email: 'john@example.com' },
      { name: 'Jane Doe', email: 'jane@example.com' },
    ];

    it('should export contacts as JSON', async () => {
      api.listAllContacts.mockResolvedValue(mockContacts);
      const args = { TYPE: 'contacts', FORMAT: 'json' };
      const result = await exportCommand.execute(args, mockContext);

      expect(api.listAllContacts).toHaveBeenCalledWith({}, mockUserId);
      expect(result.type).toBe('file_download');
      expect(result.filename).toMatch(/axim-contacts-.*\.json/);
      expect(result.content).toBe(JSON.stringify(mockContacts, null, 2));
    });

    it('should export contacts as CSV', async () => {
      api.listAllContacts.mockResolvedValue(mockContacts);
      const args = { TYPE: 'contacts', FORMAT: 'csv' };
      const result = await exportCommand.execute(args, mockContext);

      expect(result.type).toBe('file_download');
      expect(result.filename).toMatch(/axim-contacts-.*\.csv/);
      expect(result.content).toContain('John Doe,john@example.com');
      expect(result.content).toContain('Jane Doe,jane@example.com');
    });

    it('should return a message if no contacts data is available', async () => {
      api.listAllContacts.mockResolvedValue([]);
      const args = { TYPE: 'contacts', FORMAT: 'json' };
      const result = await exportCommand.execute(args, mockContext);
      expect(result).toBe('No contacts available to export.');
    });
  });
});
