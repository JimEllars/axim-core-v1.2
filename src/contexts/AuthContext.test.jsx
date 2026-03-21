import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { SupabaseProvider } from './SupabaseContext';
import config from '../config';

// Mock the problematic module that throws the error on import
vi.mock('../services/supabaseClient', () => ({
  supabase: vi.fn(), // A simple mock to prevent the original file from running
}));

// Mock the config module
vi.mock('../config', () => ({
  default: {
    isMockLlmEnabled: true,
  },
}));

// Mock the api service to prevent it from trying to make real calls
vi.mock('../services/onyxAI/api', () => ({
  default: {
    getUserSettings: vi.fn().mockResolvedValue({ theme: 'dark', ai: {}, connections: {} }),
  }
}));

// A reusable mock supabase client factory
const createMockSupabase = (session, role = 'user') => {
  const mock = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn(function() { return this; }),
    select: vi.fn(function() { return this; }),
    eq: vi.fn(function() { return this; }),
    single: vi.fn().mockResolvedValue({ data: { role } }),
  };
  // Make `from` return the whole mock object to allow chaining
  mock.from.mockReturnValue(mock);
  return mock;
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset config mock before each test
    config.isMockLlmEnabled = true;
  });

  const wrapperFactory = (mockSupabaseClient) => ({ children }) => (
    <SupabaseProvider client={mockSupabaseClient}>
      <AuthProvider>{children}</AuthProvider>
    </SupabaseProvider>
  );

  it('should provide a mock user when in mock mode', async () => {
    const wrapper = wrapperFactory(null); // In mock mode, the client isn't used.
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('admin@example.com');
    expect(result.current.role).toBe('admin');
  });

  it('should not provide a user when not in mock mode and no session exists', async () => {
    config.isMockLlmEnabled = false;
    const mockSupabase = createMockSupabase(null);
    const wrapper = wrapperFactory(mockSupabase);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBe(null);
    expect(result.current.role).toBe(null);
    expect(mockSupabase.auth.getSession).toHaveBeenCalled();
  });

  it('should provide a real user when a session exists', async () => {
    config.isMockLlmEnabled = false;
    const mockSession = { user: { id: 'user-123', email: 'test@example.com' } };
    const mockSupabase = createMockSupabase(mockSession, 'editor');
    const wrapper = wrapperFactory(mockSupabase);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user.id).toBe('user-123');
    expect(result.current.role).toBe('editor');
    expect(mockSupabase.from).toHaveBeenCalledWith('users');
  });
});
