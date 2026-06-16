import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import EventLog from './EventLog';
import { supabase } from '../../services/supabaseClient';
import { DashboardProvider } from '../../contexts/DashboardContext';

vi.mock('../../services/supabaseClient', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis()
  };

  return {
    supabase: {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn()
    }
  };
});

describe('EventLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = async () => {
    let result;
    await act(async () => {
        result = render(
        <DashboardProvider>
            <EventLog />
        </DashboardProvider>
        );
    });
    return result;
  };

  it('renders loading state initially', async () => {
    // Setup promises that don't resolve immediately
    let resolveEvents, resolveTelemetry;
    supabase.limit.mockImplementationOnce(() => new Promise(r => { resolveEvents = r; }));
    supabase.limit.mockImplementationOnce(() => new Promise(r => { resolveTelemetry = r; }));

    const rendered = render(
      <DashboardProvider>
        <EventLog />
      </DashboardProvider>
    );

    expect(screen.getByText('Live Event Log')).toBeInTheDocument();
    expect(screen.getAllByRole('generic').some(el => el.classList.contains('animate-pulse'))).toBeTruthy();

    // Resolve to avoid act warnings
    await act(async () => {
      resolveEvents({ data: [], error: null });
      resolveTelemetry({ data: [], error: null });
    });
  });

  it('fetches and renders events', async () => {
    const mockCoreEvents = [
      { id: '1', type: 'new_lead', source: 'web', created_at: '2023-01-01T10:00:00Z', data: { name: 'John Doe' } }
    ];
    const mockTelemetryEvents = [
      { id: '2', status_code: 500, client_id: 'app1', created_at: '2023-01-01T10:05:00Z', request_metadata: { error: 'Failed' }, endpoint: '/api/test' }
    ];

    supabase.limit.mockResolvedValueOnce({ data: mockCoreEvents, error: null });
    supabase.limit.mockResolvedValueOnce({ data: mockTelemetryEvents, error: null });

    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText('new lead')).toBeInTheDocument();
      expect(screen.getByText('error')).toBeInTheDocument();
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.getByText(/Failed/)).toBeInTheDocument();
    });
  });

  it('subscribes to realtime channels on mount and cleans up on unmount', async () => {
    supabase.limit.mockResolvedValue({ data: [], error: null });

    const rendered = await renderComponent();

    expect(supabase.channel).toHaveBeenCalledWith('events');
    const mockChannel = supabase.channel();
    expect(mockChannel.on).toHaveBeenCalledTimes(2); // One for core, one for telemetry
    expect(mockChannel.subscribe).toHaveBeenCalled();

    await act(async () => {
        rendered.unmount();
    });

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });
});
