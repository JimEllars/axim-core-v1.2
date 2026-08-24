import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import Settings from '../src/components/settings/Settings';
import { AuthContext } from '../src/contexts/AuthContext';
import { DashboardProvider } from '../src/contexts/DashboardContext';
import { ApiProvider } from '../src/contexts/ApiContext';
import { BrowserRouter } from 'react-router-dom';
import * as useSupabaseQueryModule from '../src/hooks/useSupabaseQuery';
import api from '../src/services/onyxAI/api';

vi.mock('../src/services/onyxAI/api', () => ({
  default: {
    saveUserSettings: vi.fn(),
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

vi.mock('../src/contexts/ApiContext', () => ({
  ApiProvider: ({ children }) => <div>{children}</div>,
  useApi: () => ({
    listDevices: vi.fn().mockResolvedValue([]),
    checkForUpdates: vi.fn().mockResolvedValue({}),
  }),
}));

const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
};

const mockAuthContext = {
  user: mockUser,
};

const renderWithProviders = (ui, queryMockData) => {
  vi.spyOn(useSupabaseQueryModule, 'useSupabaseQuery').mockImplementation((queryName) => {
    if (queryName === 'get_user_settings') {
      return { data: queryMockData.userSettings, loading: false, refetch: vi.fn() };
    }
    return { data: null, loading: false };
  });

  return render(
    <BrowserRouter>
      <AuthContext.Provider value={mockAuthContext}>
        <ApiProvider>
          <DashboardProvider>
            {ui}
          </DashboardProvider>
        </ApiProvider>
      </AuthContext.Provider>
    </BrowserRouter>
  );
};

describe('Settings UI Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads gracefully with defaults when user_settings is empty array', async () => {
    renderWithProviders(<Settings />, { userSettings: [] });

    // Check if defaults are loaded
    expect(screen.getByDisplayValue('gpt-4')).toBeDefined();
    expect(screen.getByDisplayValue('dark')).toBeDefined();
    expect(screen.getByDisplayValue('salesforce')).toBeDefined();
  });

  it('loads gracefully with defaults when user_settings is empty object', async () => {
    renderWithProviders(<Settings />, { userSettings: {} });

    // Check if defaults are loaded
    expect(screen.getByDisplayValue('gpt-4')).toBeDefined();
    expect(screen.getByDisplayValue('dark')).toBeDefined();
    expect(screen.getByDisplayValue('salesforce')).toBeDefined();
  });
});
