import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { useSupabase } from './SupabaseContext';
import config from '../config';

vi.mock('./SupabaseContext', () => ({
  useSupabase: vi.fn()
}));

vi.mock('../services/onyxAI/api', () => ({
  default: {
    getUserSettings: vi.fn().mockResolvedValue({ theme: 'dark' })
  }
}));

vi.mock('../config', () => ({
  default: {
    isMockLlmEnabled: false
  }
}));

const mockSupabase = {
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signInWithPassword: vi.fn(),
    signOut: vi.fn()
  }
};

const TestComponent = () => {
  const { user, isAuthenticated, loading, login, aximSessionToken } = useAuth();
  return (
    <div>
      <div data-testid="loading">{loading.toString()}</div>
      <div data-testid="auth">{isAuthenticated.toString()}</div>
      <div data-testid="user">{user?.email || 'none'}</div>
      <div data-testid="token">{aximSessionToken || 'none'}</div>
      <button onClick={() => login('admin@axim.us.com', 'password')}>Login</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSupabase.mockReturnValue({ supabase: mockSupabase });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ axim_session_token: 'mock-axim-token' })
    });
  });

  it('provides loading state initially', async () => {
    const { getByTestId } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(getByTestId('loading')).toHaveTextContent('true');
    await waitFor(() => expect(getByTestId('loading')).toHaveTextContent('false'));
  });

  it('authenticates when mock mode is enabled', async () => {
    config.isMockLlmEnabled = true;

    const { getByTestId } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByTestId('auth')).toHaveTextContent('true');
      expect(getByTestId('user')).toHaveTextContent('admin@example.com');
    });

    config.isMockLlmEnabled = false; // Reset
  });

  it('fetches axim session token and sets custom header', async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'test-token',
          user: { id: '1', email: 'admin@axim.us.com' }
        }
      },
      error: null
    });

    const { getByTestId } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByTestId('auth')).toHaveTextContent('true');
      expect(getByTestId('token')).toHaveTextContent('mock-axim-token');
      expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        headers: expect.objectContaining({
          'x-axim-edge-token': 'test-token'
        })
      }));
    });
  });
});
