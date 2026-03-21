import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCommandHubState } from './useCommandHubState';

describe('useCommandHubState', () => {
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    // Reset vi mocks
    vi.clearAllMocks();

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });

    // Mock console.error to avoid noise in test output
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original localStorage
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      writable: true
    });

    // Restore console.error
    console.error.mockRestore();
  });

  it('should initialize with default state when localStorage is empty', () => {
    global.localStorage.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useCommandHubState());
    const [state] = result.current;

    expect(state).toEqual({
      messages: [],
      inputValue: '',
      systemStats: {},
      recentCommands: [],
    });
    expect(global.localStorage.getItem).toHaveBeenCalledWith('chatHistory');
  });

  it('should load messages from localStorage on mount', () => {
    const mockMessages = [{ id: 1, text: 'Hello' }];
    global.localStorage.getItem.mockReturnValue(JSON.stringify(mockMessages));

    const { result } = renderHook(() => useCommandHubState());
    const [state] = result.current;

    expect(state.messages).toEqual(mockMessages);
    expect(global.localStorage.getItem).toHaveBeenCalledWith('chatHistory');
  });

  it('should handle localStorage.getItem throwing an error gracefully', () => {
    const error = new Error('Storage access denied');
    global.localStorage.getItem.mockImplementation(() => {
      throw error;
    });

    const { result } = renderHook(() => useCommandHubState());
    const [state] = result.current;

    // Should return default state
    expect(state.messages).toEqual([]);

    // Should log the error
    expect(console.error).toHaveBeenCalledWith(
      'Failed to load chat history from localStorage',
      error
    );
  });

  it('should save messages to localStorage when they change', () => {
    global.localStorage.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useCommandHubState());

    act(() => {
      const dispatch = result.current[1];
      dispatch({ type: 'SET_MESSAGES', payload: [{ id: 1, text: 'Test' }] });
    });

    // It should save the new messages
    expect(global.localStorage.setItem).toHaveBeenCalledWith(
      'chatHistory',
      JSON.stringify([{ id: 1, text: 'Test' }])
    );
  });

  it('should handle localStorage.setItem throwing an error gracefully', () => {
    global.localStorage.getItem.mockReturnValue(null);
    const error = new Error('Quota exceeded');
    global.localStorage.setItem.mockImplementation(() => {
      throw error;
    });

    const { result } = renderHook(() => useCommandHubState());

    act(() => {
      const dispatch = result.current[1];
      dispatch({ type: 'SET_MESSAGES', payload: [{ id: 1, text: 'Test' }] });
    });

    // State should still be updated
    const [state] = result.current;
    expect(state.messages).toEqual([{ id: 1, text: 'Test' }]);

    // Should log the error
    expect(console.error).toHaveBeenCalledWith(
      'Failed to save chat history to localStorage',
      error
    );
  });
});
