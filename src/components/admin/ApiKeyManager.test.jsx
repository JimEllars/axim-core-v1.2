import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApiKeyManager from './ApiKeyManager';
import supabaseApiService from '../../services/supabaseApiService';
import * as AuthContext from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

vi.mock('../../services/supabaseApiService', () => ({
  default: {
    supabase: { from: vi.fn() },
    getWorkflows: vi.fn(),
    saveWorkflow: vi.fn()
  },
  supabaseApiService: {
    supabase: { from: vi.fn() },
    getWorkflows: vi.fn(),
    saveWorkflow: vi.fn()
  }
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ApiKeyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AuthContext.useAuth.mockReturnValue({ user: { id: 'user-123' } });
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  const mockSupabaseQuery = (method, response) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue(response),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(response),
      delete: vi.fn().mockReturnThis(),
      match: vi.fn().mockResolvedValue(response),
    };
    supabaseApiService.supabase.from.mockReturnValue(chain);
    return chain;
  };

  it('should display loading state initially', async () => {
    mockSupabaseQuery('select', { data: [], error: null });
    await act(async () => { render(<ApiKeyManager />); });
    expect(screen.getByText('API Key Manager')).toBeInTheDocument();
  });

  it('should list API keys', async () => {
    const mockKeys = [
      { id: '1', api_key: 'mock_token_demo_1', created_at: '2026-01-01T00:00:00Z' },
      { id: '2', api_key: 'mock_token_demo_2', created_at: '2026-01-02T00:00:00Z' },
    ];
    mockSupabaseQuery('select', { data: mockKeys, error: null });

    await act(async () => { render(<ApiKeyManager />); });

    await waitFor(() => {
      expect(screen.getByText(/mo_1$/)).toBeInTheDocument();
      expect(screen.getByText(/mo_2$/)).toBeInTheDocument();
    });
  });

  it('should display empty state when no keys exist', async () => {
    mockSupabaseQuery('select', { data: [], error: null });

    await act(async () => { render(<ApiKeyManager />); });

    await waitFor(() => {
      expect(screen.getByText('No API keys found. Generate one to get started.')).toBeInTheDocument();
    });
  });

  it('should generate a new API key', async () => {
    mockSupabaseQuery('select', { data: [], error: null });
    await act(async () => { render(<ApiKeyManager />); });

    await waitFor(() => {
      expect(screen.getByText('No API keys found. Generate one to get started.')).toBeInTheDocument();
    });

    const newKey = { id: '3', api_key: 'mock_token_demo_3', created_at: '2026-01-03T00:00:00Z' };
    const insertChain = mockSupabaseQuery('insert', { data: newKey, error: null });

    await act(async () => {
      fireEvent.click(screen.getByText('Generate New Key'));
    });

    await waitFor(() => {
      expect(insertChain.insert).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('API Key generated successfully');
    });
  });

  it('should revoke an existing API key', async () => {
    const mockKeys = [
      { id: '1', api_key: 'mock_token_demo_1', created_at: '2026-01-01T00:00:00Z' }
    ];
    const selectChain = mockSupabaseQuery('select', { data: mockKeys, error: null });

    await act(async () => { render(<ApiKeyManager />); });

    await waitFor(() => {
      expect(screen.getByText(/mo_1$/)).toBeInTheDocument();
    });

    const deleteChain = mockSupabaseQuery('delete', { data: null, error: null });

    const revokeButtons = screen.getAllByTitle('Revoke Key');
    await act(async () => {
      fireEvent.click(revokeButtons[0]);
    });

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(deleteChain.delete).toHaveBeenCalled();
      expect(deleteChain.match).toHaveBeenCalledWith({ id: '1' });
      expect(toast.success).toHaveBeenCalledWith('API Key revoked');
    });
  });

  it('should handle fetch error gracefully', async () => {
    mockSupabaseQuery('select', { data: null, error: new Error('Network error') });

    await act(async () => { render(<ApiKeyManager />); });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load API keys');
    });
  });
});
