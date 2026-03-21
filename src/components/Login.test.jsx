import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Login from './Login';
import { useAuth } from '../contexts/AuthContext';

// Mock the useAuth hook, which is the direct dependency of the Login component
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('Login Component', () => {
  let loginMock;

  beforeEach(() => {
    vi.clearAllMocks();
    loginMock = vi.fn();
  });

  const renderWithRouter = (ui) => {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  };

  it('renders login form correctly', () => {
    useAuth.mockReturnValue({
      login: loginMock,
      loading: false,
      error: '',
    });
    renderWithRouter(<Login />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /access dashboard/i })).toBeInTheDocument();
  });

  it('calls login function with correct credentials on submit', async () => {
    useAuth.mockReturnValue({
      login: loginMock,
      loading: false,
      error: '',
    });
    loginMock.mockResolvedValue({ error: null }); // Simulate successful login

    renderWithRouter(<Login />);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'jrellars@gmail.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /access dashboard/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('jrellars@gmail.com', 'password123');
    });
  });


  it('shows an error message on failed login for authorized email', async () => {
    const errorMessage = 'Invalid email or password';
    useAuth.mockReturnValue({
      login: loginMock,
      loading: false,
      error: '',
    });
    loginMock.mockRejectedValue(new Error(errorMessage)); // Simulate a failed login

    renderWithRouter(<Login />);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'jrellars@gmail.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /access dashboard/i }));

    expect(await screen.findByText(errorMessage)).toBeInTheDocument();
  });

  it('disables the submit button and shows loading text when loading', () => {
    useAuth.mockReturnValue({
      login: loginMock,
      loading: true, // Set loading state to true
      error: '',
    });

    renderWithRouter(<Login />);

    const submitButton = screen.getByRole('button', { name: /authenticating.../i });
    expect(submitButton).toBeDisabled();
  });
});