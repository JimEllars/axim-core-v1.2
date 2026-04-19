import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EcosystemRegistry from './EcosystemRegistry';
import { supabase } from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [
            { app_id: 'test-app-1', is_active: true, status: 'Active' },
            { app_id: 'test-app-2', is_active: false, status: 'Quarantined' }
          ],
          error: null
        })
      }))
    }))
  }
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('EcosystemRegistry Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<EcosystemRegistry />);
    expect(screen.getByText('Loading registry...')).toBeInTheDocument();
  });

  it('renders ecosystem apps after loading', async () => {
    render(<EcosystemRegistry />);

    expect(await screen.findByText('test-app-1')).toBeInTheDocument();
    expect(await screen.findByText('test-app-2')).toBeInTheDocument();
  });
});
