// src/services/onyxAI/memory.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import conversationHistory from './memory';
import api from './api';
import logger from '../logging';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
vi.mock('./api');
vi.mock('../logging');
vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  return { default: toast };
});
vi.mock('uuid');

describe('ConversationHistory', () => {
  const userId = 'test-user';
  const conversationId = 'test-conversation';
  const storageKey = `axim_chat_history_${conversationId}`;

  beforeEach(() => {
    // Clear mocks and localStorage side-effects from previous tests.
    vi.clearAllMocks();
    localStorage.clear();
    // Use the public clear method to reset the singleton's internal state.
    conversationHistory.clear();
    // Provide a consistent mock for UUID
    uuidv4.mockReturnValue('mock-uuid-1234');
    // Ensure a clean slate for API calls in every test
    api.getChatHistoryForUser.mockResolvedValue([]);
  });

  afterEach(() => {
    // Ensure cleanup after each test.
    conversationHistory.clear();
  });


  describe('initialize', () => {
    it('should not attempt to load history if userId or conversationId is missing', async () => {
      await conversationHistory.initialize(null, null);
      expect(api.getChatHistoryForUser).not.toHaveBeenCalled();
      expect(localStorage.getItem(`axim_chat_history_null`)).toBeNull();
    });

    it('should fetch from API, format, and cache the history with enriched data', async () => {
      const mockInteractions = [
        { id: 'db-id-1', command: 'hello', response: 'world', created_at: '2023-01-01T12:00:00Z', status: 'success' },
        { id: 'db-id-2', command: 'test', response: '{"status": "ok"}', created_at: '2023-01-01T12:01:00Z', status: 'success' },
        { id: 'db-id-3', response: 'Something went wrong.', created_at: '2023-01-01T12:02:00Z', status: 'failed' }
      ];
      api.getChatHistoryForUser.mockResolvedValue(mockInteractions);

      await conversationHistory.initialize(userId, conversationId);

      expect(api.getChatHistoryForUser).toHaveBeenCalledWith(userId, conversationId);
      const history = conversationHistory.getHistory();

      // Expect 5 messages: user/asst for first two, and one error for the third.
      expect(history.length).toBe(5);
      expect(history[0]).toMatchObject({ messageId: 'db-id-1-user', type: 'user', content: 'hello' });
      expect(history[1]).toMatchObject({ messageId: 'db-id-1-asst', type: 'assistant', content: 'world' });
      expect(history[2]).toMatchObject({ messageId: 'db-id-2-user', type: 'user', content: 'test' });
      expect(history[3]).toMatchObject({ messageId: 'db-id-2-asst', type: 'assistant', content: { status: 'ok' } });
      expect(history[4]).toMatchObject({ messageId: 'db-id-3-asst', type: 'error', content: 'Something went wrong.' });

      const cachedData = JSON.parse(localStorage.getItem(storageKey));
      expect(cachedData.length).toBe(5);
    });

    it('should intelligently merge local and remote histories', async () => {
        // 1. Setup a local cache with one message
        const localMessage = { messageId: 'local-uuid-1', type: 'user', content: 'cached message', timestamp: '2023-01-01T11:59:00Z' };
        localStorage.setItem(storageKey, JSON.stringify([localMessage]));

        // 2. Mock the API to return overlapping and new messages
        const remoteInteractions = [
          { id: 'remote-id-1', command: 'remote command 1', response: 'remote response 1', created_at: '2023-01-01T12:00:00Z', status: 'success' },
        ];
        api.getChatHistoryForUser.mockResolvedValue(remoteInteractions);

        // 3. Initialize
        await conversationHistory.initialize(userId, conversationId);

        // 4. Assert the merge logic
        const history = conversationHistory.getHistory();
        expect(history.length).toBe(3); // local-1, remote-1 (user), remote-1 (assistant)
        expect(history[0].messageId).toBe('local-uuid-1');
        expect(history[1].messageId).toBe('remote-id-1-user');
        expect(history[2].messageId).toBe('remote-id-1-asst');
      });
  });

  describe('addMessage', () => {
    it('should add a message to history with enriched metadata', async () => {
      await conversationHistory.initialize(userId, conversationId);
      conversationHistory.addMessage('user', 'test command');

      const history = conversationHistory.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]).toMatchObject({
        messageId: 'mock-uuid-1234',
        type: 'user',
        content: 'test command',
        userId,
        conversationId,
      });

      const cachedData = JSON.parse(localStorage.getItem(storageKey));
      expect(cachedData.length).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear in-memory history and remove from localStorage', async () => {
      await conversationHistory.initialize(userId, conversationId);
      conversationHistory.addMessage('user', 'test');
      expect(conversationHistory.getHistory().length).toBe(1);
      expect(localStorage.getItem(storageKey)).not.toBeNull();
      conversationHistory.clear();
      expect(conversationHistory.getHistory().length).toBe(0);
      expect(localStorage.getItem(storageKey)).toBeNull();
    });
  });
});
