import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CloudflareEdgeHealth from './CloudflareEdgeHealth';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

describe('CloudflareEdgeHealth', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ colo: 'DFW' })
        });
        localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the edge gateway title', () => {
        render(<CloudflareEdgeHealth />);
        expect(screen.getByText('Cloudflare Edge Gateway')).toBeInTheDocument();
        expect(screen.getByText('ONLINE')).toBeInTheDocument();
    });

    it('updates status based on custom events', () => {
        const { getByText } = render(<CloudflareEdgeHealth />);

        act(() => {
            window.dispatchEvent(new CustomEvent('edge:degraded'));
        });
        expect(getByText('DEGRADED')).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(new CustomEvent('edge:fallback'));
        });
        expect(screen.getAllByText('FALLBACK')[0]).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(new CustomEvent('edge:healthy'));
        });
        expect(getByText('ONLINE')).toBeInTheDocument();
    });

    it('shows revalidating temporarily', () => {
        const { getByText } = render(<CloudflareEdgeHealth />);

        act(() => {
            window.dispatchEvent(new CustomEvent('edge:revalidated'));
        });
        expect(getByText('REVALIDATING')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(getByText('ONLINE')).toBeInTheDocument();
    });
});
