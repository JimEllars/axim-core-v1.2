// src/components/UserProfile.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/onyxAI/api';
import UserProfile from './UserProfile';
import { Toaster } from 'react-hot-toast';

const queryClient = new QueryClient();

const renderWithProviders = (ui) => {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

// Mock dependencies
vi.mock('../contexts/AuthContext');
vi.mock('../services/onyxAI/api');

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
};

const mockProfile = {
  full_name: 'Test User',
  avatar_url: 'https://example.com/avatar.png',
};


Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('UserProfile', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Provide a default implementation for the mocked hook
    useAuth.mockReturnValue({
      user: mockUser,
      profile: mockProfile,
      loadUserProfile: vi.fn(),
    });

    api.updateUserProfile.mockResolvedValue({ data: {}, error: null });
  });

  it('should render the user profile with the correct initial data', () => {
    renderWithProviders(<UserProfile />);

    expect(screen.getByLabelText('Email')).toHaveValue(mockUser.email);
    expect(screen.getByLabelText('Full Name')).toHaveValue(mockProfile.full_name);
    expect(screen.getByLabelText('Avatar URL')).toHaveValue(mockProfile.avatar_url);
  });

  it('should allow the user to update their full name and avatar URL', () => {
    renderWithProviders(<UserProfile />);

    const fullNameInput = screen.getByLabelText('Full Name');
    const avatarUrlInput = screen.getByLabelText('Avatar URL');

    fireEvent.change(fullNameInput, { target: { value: 'New Name' } });
    fireEvent.change(avatarUrlInput, { target: { value: 'https://new.avatar.com' } });

    expect(fullNameInput).toHaveValue('New Name');
    expect(avatarUrlInput).toHaveValue('https://new.avatar.com');
  });

  it('should call the updateUserProfile API on form submission', async () => {
    const loadUserProfileMock = vi.fn();
    useAuth.mockReturnValue({
      user: mockUser,
      profile: mockProfile,
      loadUserProfile: loadUserProfileMock,
    });

    renderWithProviders(<><UserProfile /><Toaster /></>);

    const fullNameInput = screen.getByLabelText('Full Name');
    fireEvent.change(fullNameInput, { target: { value: 'Updated Name' } });

    const saveButton = screen.getByRole('button', { name: /Save Profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateUserProfile).toHaveBeenCalledWith(mockUser.id, {
        full_name: 'Updated Name',
        avatar_url: mockProfile.avatar_url,
      });
    });

    // Verify that the success toast appears
    expect(await screen.findByText('Profile updated successfully!')).toBeInTheDocument();

    // Verify that the user profile is reloaded
    expect(loadUserProfileMock).toHaveBeenCalledWith(mockUser);
  });

  it('should show an error toast if the API call fails', async () => {
    const errorMessage = 'Failed to connect to the server';
    api.updateUserProfile.mockRejectedValue(new Error(errorMessage));

    renderWithProviders(<><UserProfile /><Toaster /></>);

    const saveButton = screen.getByRole('button', { name: /Save Profile/i });
    fireEvent.click(saveButton);

    // Verify that the error toast appears with the correct message
    await waitFor(() => {
      expect(screen.getByText(`Failed to update profile: ${errorMessage}`)).toBeInTheDocument();
    });
  });
});
