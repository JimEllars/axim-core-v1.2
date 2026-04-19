import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Header from './Header';
import { useAuth } from '../../contexts/AuthContext';

// Mock the AuthContext
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

// Mock react-icons/fi to provide testable components
vi.mock('react-icons/fi', async () => {
  const actual = await vi.importActual('react-icons/fi');
  return {
    ...actual,
    FiLogOut: () => <div data-testid="fi-logout" />,
    FiActivity: () => <div data-testid="fi-activity" />,
    FiShield: () => <div data-testid="fi-shield" />,
  };
});

describe('Header Component', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      logout: mockLogout
    });
  });

  it('renders the header title and version', () => {
    render(<Header />);
    expect(screen.getByText('Axim Core')).toBeInTheDocument();
    expect(screen.getByText('Operations Dashboard v1.1')).toBeInTheDocument();
  });

  it('renders the "System Online" status', () => {
    render(<Header />);
    expect(screen.getByText('System Online')).toBeInTheDocument();
    expect(screen.getByTestId('fi-activity')).toBeInTheDocument();
  });

  it('renders the shield icon', () => {
    render(<Header />);
    expect(screen.getByTestId('fi-shield')).toBeInTheDocument();
  });

  it('calls logout when the Logout button is clicked', () => {
    render(<Header />);
    const logoutButton = screen.getByRole('button', { name: /logout/i });
    fireEvent.click(logoutButton);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('renders the logout icon', () => {
    render(<Header />);
    expect(screen.getByTestId('fi-logout')).toBeInTheDocument();
  });
});
