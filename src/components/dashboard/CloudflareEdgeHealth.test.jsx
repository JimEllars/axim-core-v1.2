import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
    it('renders the edge gateway title', () => {
        render(<CloudflareEdgeHealth />);
        expect(screen.getByText('Cloudflare Edge Gateway')).toBeInTheDocument();
    });
});
