import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SystemHealthPanel from './SystemHealthPanel';
import { supabase } from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null })
    })),
    functions: {
      invoke: vi.fn()
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    })),
    removeChannel: vi.fn()
  }
}));

describe('SystemHealthPanel Component', () => {
  it('renders loading state initially', () => {
    supabase.functions.invoke.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    const { container } = render(<SystemHealthPanel />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders error state on fetch failure', async () => {
    supabase.functions.invoke.mockRejectedValue(new Error('Network Error'));
    const { container } = render(<SystemHealthPanel />);
    await waitFor(() => {
      expect(container.textContent).toContain('System Health');
    });
  });

  it('renders healthy state on success', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { workerUptime: '100%', gcpLatency: '20ms', activeConnections: 5, status: 'healthy' }, error: null });
    const { container } = render(<SystemHealthPanel />);
    await waitFor(() => {
      expect(container.textContent).toContain('100%');
      expect(container.textContent).toContain('20ms');
    });
  });
});
