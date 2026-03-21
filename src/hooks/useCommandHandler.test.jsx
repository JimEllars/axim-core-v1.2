import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useCommandHandler } from './useCommandHandler';
import onyxAI from '../services/onyxAI';
import api from '../services/onyxAI/api';
// We mock react-hot-toast completely to avoid JSDOM issues
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { CommandNotFoundError, CommandValidationError, IntentParsingError, DatabaseError, CommandExecutionError } from '../services/onyxAI/errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---
vi.mock('../services/onyxAI');
vi.mock('../services/onyxAI/api');
vi.mock('../contexts/AuthContext');

// Use vi.hoisted to ensure toastFn is available for the mock factory
const { toastFn } = vi.hoisted(() => {
    const fn = vi.fn();
    fn.success = vi.fn();
    fn.error = vi.fn();
    fn.loading = vi.fn();
    fn.dismiss = vi.fn();
    return { toastFn: fn };
});

vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: toastFn,
  Toaster: () => null, // Render nothing for Toaster
}));

const mockUser = { id: 'test-user-id' };
const mockDispatch = vi.fn();

// Wrapper not strictly needed if Toaster is mocked to null, but good practice
const wrapper = ({ children }) => (
  <>
    {children}
  </>
);

describe('useCommandHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });
    onyxAI.conversationId = 'mock-convo-id';
  });

  describe('init', () => {
    it('should dispatch history messages when they exist', async () => {
      const mockHistory = [{ status: 'success', command: 'a', response: 'b' }];
      api.getChatHistoryForUser.mockResolvedValue(mockHistory);
      const { result } = renderHook(() => useCommandHandler(mockDispatch), { wrapper });
      await act(async () => { await result.current.init(); });
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_MESSAGES',
        payload: expect.arrayContaining([
          expect.objectContaining({ content: 'a', type: 'user' }),
          expect.objectContaining({ content: 'b', type: 'assistant' }),
        ]),
      });
    });

    it('should dispatch welcome message if history is empty', async () => {
      api.getChatHistoryForUser.mockResolvedValue([]);
      const { result } = renderHook(() => useCommandHandler(mockDispatch), { wrapper });
      await act(async () => { await result.current.init(); });
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_MESSAGES',
        payload: [expect.objectContaining({ id: 'welcome-message' })],
      });
    });
  });

  describe('handleCommand', () => {
    it('should handle a successful command', async () => {
      onyxAI.routeCommand.mockResolvedValue({
        type: 'text',
        content: 'Success',
        payload: 'Success',
        metadata: { agentName: 'Onyx AI' }
      });
      const { result } = renderHook(() => useCommandHandler(mockDispatch), { wrapper });
      await act(async () => { await result.current.handleCommand('test'); });
      expect(mockDispatch).toHaveBeenCalledTimes(4);
      expect(mockDispatch).toHaveBeenLastCalledWith({
        type: 'ADD_OR_UPDATE_MESSAGE',
        payload: expect.objectContaining({ content: 'Success', type: 'assistant', agentName: 'Onyx AI' }),
      });
    });

    it('should handle the clear command', async () => {
      onyxAI.routeCommand.mockResolvedValue({
        type: '__CLEAR_CHAT__',
        payload: { type: '__CLEAR_CHAT__' },
        metadata: { agentName: 'Onyx AI' }
      });
      const { result } = renderHook(() => useCommandHandler(mockDispatch), { wrapper });
      await act(async () => { await result.current.handleCommand('clear'); });
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_MESSAGES' });
      expect(toastFn.success).toHaveBeenCalledWith('Chat history cleared and new session started.');
    });

    it('should handle file downloads', async () => {
      const downloadPayload = { type: 'file_download', filename: 'f.json', content: '{}' };
      onyxAI.routeCommand.mockResolvedValue({
        type: 'file_download',
        payload: downloadPayload,
        metadata: { agentName: 'Onyx AI' }
      });

      // Mock DOM methods for download
      const clickMock = vi.fn();
      // Store original createElement to avoid breaking internal React calls (like createRoot)
      const originalCreateElement = document.createElement;
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(function (tagName) {
        // Create the real element so it's a valid Node for appendChild
        const element = originalCreateElement.call(document, tagName);
        if (tagName === 'a') {
          // Mock the click method on the element instance
          element.click = clickMock;
          // Ensure style exists (it should on a real element)
        }
        return element;
      });

      // Spy on appendChild/removeChild but allow original implementation to ensure React can mount components
      const appendChildMock = vi.spyOn(document.body, 'appendChild');
      const removeChildMock = vi.spyOn(document.body, 'removeChild');

      // Mock URL.createObjectURL/revokeObjectURL
      global.URL.createObjectURL = vi.fn(() => 'blob:url');
      global.URL.revokeObjectURL = vi.fn();

      try {
        const { result } = renderHook(() => useCommandHandler(mockDispatch), { wrapper });
        await act(async () => { await result.current.handleCommand('export'); });

        expect(createElementSpy).toHaveBeenCalledWith('a');
        expect(clickMock).toHaveBeenCalled();

        expect(mockDispatch).toHaveBeenLastCalledWith({
          type: 'ADD_OR_UPDATE_MESSAGE',
          payload: expect.objectContaining({ content: 'Successfully exported chat log to f.json' }),
        });
      } finally {
        // Cleanup guaranteed
        createElementSpy.mockRestore();
        appendChildMock.mockRestore();
        removeChildMock.mockRestore();
        global.URL.createObjectURL.mockRestore?.();
        global.URL.revokeObjectURL.mockRestore?.();
      }
    });
  });

  describe('Error Handling', () => {
    // Spy on console.error to suppress expected error logs during these tests
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    const testCases = [
      { name: 'CommandNotFoundError', error: new CommandNotFoundError() },
      { name: 'CommandValidationError', error: new CommandValidationError() },
      { name: 'IntentParsingError', error: new IntentParsingError() },
      { name: 'DatabaseError', error: new DatabaseError() },
      { name: 'CommandExecutionError', error: new CommandExecutionError() },
      { name: 'Generic Error', error: new Error('generic') },
    ];

    testCases.forEach(({ name, error }) => {
      it(`should create an error message for ${name}`, async () => {
        onyxAI.routeCommand.mockRejectedValue(error);
        const { result } = renderHook(() => useCommandHandler(mockDispatch), { wrapper });
        await act(async () => { await result.current.handleCommand('bad'); });
        expect(mockDispatch).toHaveBeenLastCalledWith({
          type: 'ADD_OR_UPDATE_MESSAGE',
          payload: expect.objectContaining({ type: 'error' }),
        });
        expect(toastFn.error).toHaveBeenCalled();
      });
    });
  });
});
