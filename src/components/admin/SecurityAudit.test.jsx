import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SecurityAudit from './SecurityAudit';
import { SupabaseProvider } from '../../contexts/SupabaseContext';

// Create a stable mock data array outside the mock function
const mockLogs = [
  { id: '1', timestamp: new Date().toISOString(), admin_id: 'user1', admin: { email: 'admin@test.com' }, action: 'approve', tool_called: 'test_tool' },
  { id: '2', timestamp: new Date().toISOString(), admin_id: 'user2', admin: { email: 'admin2@test.com' }, action: 'deny', tool_called: 'test_tool_2' },
];

vi.mock('../../contexts/SupabaseContext', () => ({
  useSupabase: () => ({
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({
              data: mockLogs,
              error: null,
            }),
          })),
        })),
      })),
    },
  }),
  SupabaseProvider: ({ children }) => <div>{children}</div>,
}));

describe('SecurityAudit', () => {
  it('renders the audit logs', async () => {
    render(<SecurityAudit />);
    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      expect(screen.getByText('test_tool')).toBeInTheDocument();
      expect(screen.getByText('APPROVE')).toBeInTheDocument();
    });
  });
});
