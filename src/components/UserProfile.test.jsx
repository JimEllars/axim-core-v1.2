import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { SupabaseProvider } from '../contexts/SupabaseContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserProfile from './UserProfile';
import { vi } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn()
  }
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false }
  }
});

const renderWithProviders = (ui, authValue) => {
  return render(
    <SupabaseProvider>
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            {ui}
          </BrowserRouter>
        </QueryClientProvider>
      </AuthContext.Provider>
    </SupabaseProvider>
  );
};

describe('UserProfile Component', () => {
  const mockAuth = {
    user: { id: 'test-user', email: 'test@example.com' },
    profile: { full_name: 'Test User', avatar_url: '' },
    walletAddress: '0x123abc456def7890',
    loadUserProfile: vi.fn(),
    logout: vi.fn()
  };

  it('renders web3 context and formats wallet address', () => {
    renderWithProviders(<UserProfile />, mockAuth);

    // Check if web3 context section exists
    expect(screen.getByText('Web3 Context')).toBeInTheDocument();

    // Check formatted wallet
    expect(screen.getByText('0x123a...7890')).toBeInTheDocument();
  });

  it('handles disconnect wallet click', () => {
    renderWithProviders(<UserProfile />, mockAuth);

    const disconnectBtn = screen.getByText('Disconnect');
    fireEvent.click(disconnectBtn);

    // The wallet section should disappear after local state clears
    expect(screen.queryByText('Web3 Context')).not.toBeInTheDocument();
  });
});
