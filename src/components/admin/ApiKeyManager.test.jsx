import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApiKeyManager from './ApiKeyManager';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock dependencies
vi.mock('react-hot-toast');
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user-123' } }),
  AuthProvider: ({ children }) => <div>{children}</div>
}));

vi.mock('../../services/supabaseApiService', () => {
  return {
    default: {
      supabase: {
        functions: {
          invoke: vi.fn().mockResolvedValue({ data: { id: 'new-id', created_at: '2023-01-01', display_key: '****1234', key: 'axim_pk_mocked1234' }, error: null })
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { id: '1', api_key: 'axim_pk_test123', created_at: '2026-01-01T00:00:00Z', display_key: '****************t123' }
            ],
            error: null
          }),
          insert: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          match: vi.fn().mockResolvedValue({ error: null }),
          single: vi.fn().mockResolvedValue({
            data: { id: '2', api_key: 'axim_pk_new123', created_at: '2026-01-02T00:00:00Z', display_key: '****************w123' },
            error: null
          })
        }))
      }
    }
  };
});

describe('ApiKeyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and loads keys', async () => {
    render(
      <AuthProvider>
        <ApiKeyManager />
      </AuthProvider>
    );

    expect(screen.getByText('Ecosystem API Keys')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('****************t123')).toBeInTheDocument();
    });
  });

  it('generates a new key', async () => {
    render(
      <AuthProvider>
        <ApiKeyManager />
      </AuthProvider>
    );

    const generateBtn = screen.getByText('Generate Token');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText('axim_pk_mocked1234')).toBeInTheDocument();
      expect(screen.getByText('Secure Token Generated')).toBeInTheDocument();
    });
  });

  it('revokes a key', async () => {
    window.confirm = vi.fn().mockReturnValue(true);

    render(
      <AuthProvider>
        <ApiKeyManager />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('****************t123')).toBeInTheDocument();
    });

    const revokeBtns = screen.getAllByTitle('Revoke Key');
    fireEvent.click(revokeBtns[0]);

    await waitFor(() => {
      expect(screen.queryByText('****************t123')).not.toBeInTheDocument();
    });
  });
});
