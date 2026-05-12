import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import IntegrationsManager from './IntegrationsManager';
import { useSupabase } from '../../contexts/SupabaseContext';

vi.mock('../../contexts/SupabaseContext', () => ({
  useSupabase: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('IntegrationsManager', () => {
  it('renders correctly', async () => {
    useSupabase.mockReturnValue({
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      },
    });

    render(<IntegrationsManager />);

    expect(screen.getByText('Integrations & Webhooks')).toBeInTheDocument();

    await waitFor(() => {
        expect(screen.getByText('No recent logs found.')).toBeInTheDocument();
    });
  });
});
