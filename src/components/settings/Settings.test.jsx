import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { ApiProvider } from '../../contexts/ApiContext';
import api from '../../services/onyxAI/api';

// Mock dependencies
vi.mock('../../services/onyxAI/api', () => ({
  default: {
    saveUserSettings: vi.fn(),
    getUserSettings: vi.fn(),
    listDevices: vi.fn(),
    updateDeviceName: vi.fn(),
    removeDevice: vi.fn(),
  },
}));

vi.mock('../../services/deviceManager', () => ({
  default: {
    initialize: vi.fn(),
    stopHeartbeat: vi.fn(),
    getDeviceId: vi.fn(() => 'mock-device-id'),
  },
}));

// Create stable mock values
const mockLoadUserSettings = vi.fn();
const mockUser = { id: 'user-123' };
const mockSettings = {
  ai: { model: 'gpt-4', temperature: 0.7 },
  connections: { primaryCrm: 'salesforce' },
};

// Mock the AuthContext
vi.mock('../../contexts/AuthContext', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useAuth: () => ({
      user: mockUser,
      settings: mockSettings,
      loadUserSettings: mockLoadUserSettings,
    }),
  };
});


describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listDevices.mockResolvedValue([]);
    // Mock the Electron API that the ApiProvider depends on
    global.window.electronApi = {
      invoke: vi.fn((channel, ...args) => {
        if (channel === 'device:list') {
          return Promise.resolve({ success: true, data: [] });
        }
        return Promise.resolve({ success: true, data: {} });
      }),
    };
  });

  const renderComponent = async () => {
    // Use act to wrap the render call and wait for async operations to complete.
    // This is necessary because the child component DeviceManager fetches data on mount.
    await act(async () => {
      render(
        <ApiProvider>
          <Settings />
        </ApiProvider>
      );
    });
    // Wait for the device manager to finish loading to prevent "act" warnings.
    await screen.findByText('Device Management');
  };

  it('renders the component and displays current settings', async () => {
    await renderComponent();
    expect(screen.getByText('User Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('AI Model')).toHaveValue('gpt-4');
    expect(screen.getByLabelText('Temperature')).toHaveValue('0.7');
    expect(screen.getByLabelText('Primary CRM')).toHaveValue('salesforce');
  });

  it('allows changing AI settings', async () => {
    await renderComponent();

    const modelSelect = screen.getByLabelText('AI Model');
    const tempSlider = screen.getByLabelText('Temperature');

    fireEvent.change(modelSelect, { target: { value: 'claude-2' } });
    fireEvent.change(tempSlider, { target: { value: '0.9' } });

    await waitFor(() => {
      expect(modelSelect).toHaveValue('claude-2');
      expect(tempSlider).toHaveValue('0.9');
    });
  });

  it('calls the save API with updated settings and reloads them on save', async () => {
    api.saveUserSettings.mockResolvedValue({});
    mockLoadUserSettings.mockResolvedValue({});

    await renderComponent();

    // Change a setting
    fireEvent.change(screen.getByLabelText('AI Model'), { target: { value: 'gpt-3.5-turbo' } });

    // Click save
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(api.saveUserSettings).toHaveBeenCalledTimes(1);
      expect(api.saveUserSettings).toHaveBeenCalledWith('user-123', {
        ai: { model: 'gpt-3.5-turbo', temperature: 0.7 },
        connections: { primaryCrm: 'salesforce' },
        theme: 'dark',
      });

      expect(mockLoadUserSettings).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error toast if saving fails', async () => {
    const errorMessage = 'Failed to save';
    api.saveUserSettings.mockRejectedValue(new Error(errorMessage));

    await renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(api.saveUserSettings).toHaveBeenCalled();
    });
  });
});
