import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PassportListener from './PassportListener';
import { supabase } from '../services/supabaseClient';

vi.mock('../services/supabaseClient', () => {
  return {
    supabase: {
      channel: vi.fn(),
      removeChannel: vi.fn(),
    },
  };
});

describe('PassportListener', () => {
  let mockChannel;
  let broadcastCallback;

  beforeEach(() => {
    vi.clearAllMocks();

    mockChannel = {
      on: vi.fn().mockImplementation((type, filter, callback) => {
        if (type === 'broadcast' && filter.event === 'verification_status') {
          broadcastCallback = callback;
        }
        return mockChannel;
      }),
      subscribe: vi.fn(),
    };

    supabase.channel.mockReturnValue(mockChannel);
  });

  it('should render and show empty state initially', () => {
    render(<PassportListener />);
    expect(screen.getByText('Passport Verifications')).toBeInTheDocument();
    expect(screen.getByText('No recent verifications.')).toBeInTheDocument();
  });

  it('should set up channel subscription on mount', () => {
    render(<PassportListener />);
    expect(supabase.channel).toHaveBeenCalledWith('passport-verify-events');
    expect(mockChannel.on).toHaveBeenCalled();
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('should clean up subscription on unmount', () => {
    const { unmount } = render(<PassportListener />);
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('should display incoming verification events', () => {
    render(<PassportListener />);

    act(() => {
      if (broadcastCallback) {
        broadcastCallback({
          payload: {
            status: 'verified',
            user_id: 'user-123',
          }
        });
      }
    });

    expect(screen.queryByText('No recent verifications.')).not.toBeInTheDocument();
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(screen.getByText('User: user-123')).toBeInTheDocument();
  });
});
