import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AffiliateManager from './AffiliateManager';
import { supabaseClient } from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => ({
  supabaseClient: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: [], error: null })
      })),
      insert: vi.fn()
    }))
  }
}));

describe('AffiliateManager', () => {
  it('renders title and button', async () => {
    render(<AffiliateManager />);
    expect(screen.getByText('Affiliate Partner Management')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Partner' })).toBeInTheDocument();
  });

  it('fetches and displays partners', async () => {
    supabaseClient.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: 1, partner_name: 'testpartner', category: 'test', custom_link: 'http://test', context_description: 'testdesc', status: 'active' }
          ],
          error: null
        })
      }))
    });

    render(<AffiliateManager />);

    await waitFor(() => {
      expect(screen.getByText('testpartner')).toBeInTheDocument();
    });
  });
});
