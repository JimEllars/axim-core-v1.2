import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Header from './Header';



import { useAuth } from '../../contexts/AuthContext';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import { BrowserRouter } from 'react-router-dom';

// Mock the AuthContext
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../contexts/SupabaseContext', () => ({ useSupabase: vi.fn() }));
vi.mock('../../contexts/ConnectivityContext', () => ({ useConnectivity: vi.fn() }));

// Mock react-icons/fi to provide testable components
vi.mock('react-icons/fi', async () => {
  const actual = await vi.importActual('react-icons/fi');
  return {
    ...actual,
    FiLogOut: (props) => <div data-testid="fi-logout" {...props} />,
    FiActivity: (props) => <div data-testid="fi-activity" {...props} />,
    FiShield: (props) => <div data-testid="fi-shield" {...props} />,
  };
});

describe('Header Component', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useSupabase.mockReturnValue({ connectionError: false });
    useConnectivity.mockReturnValue({ edgeCapacity: '98%', edgeDegraded: false });
    useAuth.mockReturnValue({
      logout: mockLogout
    });
  });

  it('renders the header title and version', () => {
    render(<BrowserRouter><Header /></BrowserRouter>);
    expect(screen.getByText('AXiM Core')).toBeInTheDocument();
    expect(screen.getByText('Operations Dashboard v1.2')).toBeInTheDocument();
  });

  it('renders the "SYSTEM OPERATIONAL" status', () => {
    render(<BrowserRouter><Header /></BrowserRouter>);
    expect(screen.getByText('SYSTEM OPERATIONAL')).toBeInTheDocument();
    expect(screen.getByTestId('fi-activity')).toBeInTheDocument();
  });

  it('renders the shield icon', () => {
    render(<BrowserRouter><Header /></BrowserRouter>);
    expect(screen.getByTestId('fi-shield')).toBeInTheDocument();
  });

  it('calls logout when the Logout button is clicked', () => {
    render(<BrowserRouter><Header /></BrowserRouter>);
    const logoutButton = screen.getByRole('button', { name: /logout/i });
    fireEvent.click(logoutButton);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('renders the logout icon', () => {
    render(<BrowserRouter><Header /></BrowserRouter>);
    expect(screen.getByTestId('fi-logout')).toBeInTheDocument();
  });
});
