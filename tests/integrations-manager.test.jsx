import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IntegrationsManager from '../src/components/admin/IntegrationsManager';
import { useSupabase } from '../src/contexts/SupabaseContext';
import toast from 'react-hot-toast';

vi.mock('../src/contexts/SupabaseContext', () => ({
  useSupabase: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('IntegrationsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and fetches integrations and logs', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockSelectLogs = vi.fn().mockResolvedValue({
      data: [{ id: 1, endpoint: '/webhook-test/make', status_code: 200, created_at: '2023-01-01T00:00:00Z' }],
      error: null
    });

    useSupabase.mockReturnValue({
      supabase: {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'ecosystem_connections') {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  { id: 'custom-make', service_name: 'Make.com', status: 'active', webhook_url: 'https://make.com/hook' }
                ],
                error: null
              })
            };
          }
          if (table === 'api_usage_logs') {
            return {
              select: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: mockSelectLogs
                })
              }),
              insert: mockInsert
            };
          }
        })
      },
    });

    // Mock fetch for webhook testing
    global.fetch = vi.fn().mockResolvedValue({});

    render(<IntegrationsManager />);

    expect(screen.getByText('Integrations & Webhooks')).toBeInTheDocument();

    // Check if fetched integrations rendered
    await waitFor(() => {
        expect(screen.getByText('Make.com')).toBeInTheDocument();
    });

    // Click test connection
    const testBtns = screen.getAllByText('Test Connection');
    fireEvent.click(testBtns[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('https://make.com/hook', expect.any(Object));
      expect(mockInsert).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Test webhook fired for Make.com');
    });
  });
});
