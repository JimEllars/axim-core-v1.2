import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import UserProfile from '../src/components/UserProfile';
import { AuthContext } from '../src/contexts/AuthContext';
import { DashboardProvider } from '../src/contexts/DashboardContext';
import { BrowserRouter } from 'react-router-dom';
import * as useSupabaseQueryModule from '../src/hooks/useSupabaseQuery';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../src/services/onyxAI/api';

vi.mock('../src/services/onyxAI/api', () => ({
  default: {
    updateUserProfile: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
};

const mockProfile = {
  full_name: 'Test User',
  avatar_url: 'https://example.com/avatar.png',
};

const mockAuthContext = {
  user: mockUser,
  profile: mockProfile,
  loadUserProfile: vi.fn(),
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  disconnectWallet: vi.fn(),
};

const renderWithProviders = (ui, queryMockData) => {
  vi.spyOn(useSupabaseQueryModule, 'useSupabaseQuery').mockImplementation((queryName) => {
    if (queryName === 'get_user_settings') {
      return { data: queryMockData.userSettings || [], loading: false, refetch: vi.fn() };
    }
    if (queryName === 'user_engagement_scores' || queryName === 'micro_app_transactions' || queryName === 'user_api_key') {
      return { data: null, loading: false };
    }
    return { data: null, loading: false };
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthContext.Provider value={mockAuthContext}>
          <DashboardProvider>
            {ui}
          </DashboardProvider>
        </AuthContext.Provider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('UserProfile Settings Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with default settings when user settings are empty', async () => {
    // Testing UserProfile component rendering.
    renderWithProviders(<UserProfile />, { userSettings: [] });
    expect(screen.getByText('Profile Information')).toBeDefined();
  });
});
