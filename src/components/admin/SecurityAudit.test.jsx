import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SecurityAudit from './SecurityAudit';
import { SupabaseProvider } from '../../contexts/SupabaseContext';

const mockLogs = [
  { id: '1', timestamp: new Date().toISOString(), admin_id: 'user1', admin: { email: 'admin@test.com' }, action: 'approve', tool_called: 'test_tool' },
  { id: '2', timestamp: new Date().toISOString(), admin_id: 'user2', admin: { email: 'admin2@test.com' }, action: 'deny', tool_called: 'test_tool_2' },
];

const mockTelemetryLogs = [];

vi.mock('../../contexts/SupabaseContext', () => ({
  useSupabase: () => ({
    supabase: {
      from: vi.fn((table) => {
        const queryBuilder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(() => {
            if (table === 'hitl_audit_logs') {
              return Promise.resolve({ data: mockLogs, error: null });
            }
            return Promise.resolve({ data: [], error: null });
          }),
          then: vi.fn().mockImplementation((resolve) => {
            if (table === 'telemetry_logs') {
              resolve({ data: mockTelemetryLogs, error: null });
            } else if (table === 'hitl_audit_logs') {
               resolve({ data: mockLogs, error: null });
            } else {
               resolve({ data: [], error: null });
            }
          })
        };
        return queryBuilder;
      }),
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
