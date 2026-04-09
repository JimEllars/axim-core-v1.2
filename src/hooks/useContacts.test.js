import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useContacts } from './useContacts';
import api from '../services/onyxAI/api';
import toast from 'react-hot-toast';
import config from '../config';
import { useDashboard } from '../contexts/DashboardContext';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../services/onyxAI/api', () => ({
  default: {
    getContacts: vi.fn(),
    deleteContactById: vi.fn(),
    updateContactById: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../config', () => ({
  default: {
    isMockLlmEnabled: false,
  },
}));

vi.mock('../contexts/DashboardContext', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('useContacts', () => {
  const mockUser = { id: 'test-user-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    useDashboard.mockReturnValue({ refreshKey: 0 });
    useAuth.mockReturnValue({ user: mockUser });
    config.isMockLlmEnabled = false;
  });

  it('should fetch mock contacts when mock mode is enabled', async () => {
    config.isMockLlmEnabled = true;

    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.contacts).toHaveLength(3);
    expect(result.current.contacts[0].name).toBe('John Doe');
    expect(api.getContacts).not.toHaveBeenCalled();
  });

  it('should fetch contacts from API on mount', async () => {
    const mockContacts = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    api.getContacts.mockResolvedValue(mockContacts);

    const { result } = renderHook(() => useContacts());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.getContacts).toHaveBeenCalledWith('', mockUser.id);
    expect(result.current.contacts).toEqual(mockContacts);
  });

  it('should handle API fetch error', async () => {
    api.getContacts.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.getContacts).toHaveBeenCalledWith('', mockUser.id);
    expect(result.current.contacts).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('Failed to fetch contacts.');
  });

  it('should refetch contacts when searchTerm changes', async () => {
    api.getContacts.mockResolvedValue([]);

    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.getContacts).toHaveBeenCalledWith('', mockUser.id);

    act(() => {
      result.current.setSearchTerm('John');
    });

    await waitFor(() => {
      expect(api.getContacts).toHaveBeenCalledWith('John', mockUser.id);
    });
  });

  it('should refetch contacts when refreshKey changes', async () => {
    let currentRefreshKey = 0;
    useDashboard.mockImplementation(() => ({ refreshKey: currentRefreshKey }));

    api.getContacts.mockResolvedValue([]);

    const { rerender, result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.getContacts).toHaveBeenCalledTimes(1);

    currentRefreshKey = 1;
    rerender();

    await waitFor(() => {
      expect(api.getContacts).toHaveBeenCalledTimes(2);
    });
  });

  it('should successfully delete a contact and refetch', async () => {
    api.getContacts.mockResolvedValue([]);
    api.deleteContactById.mockResolvedValue({});

    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.getContacts).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.deleteContact(1);
    });

    expect(api.deleteContactById).toHaveBeenCalledWith(1);
    expect(toast.success).toHaveBeenCalledWith('Contact deleted successfully.');
    expect(api.getContacts).toHaveBeenCalledTimes(2);
  });

  it('should handle delete contact error', async () => {
    api.getContacts.mockResolvedValue([]);
    api.deleteContactById.mockRejectedValue(new Error('Failed to delete'));

    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteContact(1);
    });

    expect(api.deleteContactById).toHaveBeenCalledWith(1);
    expect(toast.error).toHaveBeenCalledWith('Failed to delete contact.');
    expect(api.getContacts).toHaveBeenCalledTimes(1); // Should not refetch
  });

  it('should successfully update a contact and refetch', async () => {
    api.getContacts.mockResolvedValue([]);
    api.updateContactById.mockResolvedValue({});

    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.getContacts).toHaveBeenCalledTimes(1);

    const updateData = { name: 'Updated Name' };
    await act(async () => {
      await result.current.updateContact(1, updateData);
    });

    expect(api.updateContactById).toHaveBeenCalledWith(1, updateData);
    expect(toast.success).toHaveBeenCalledWith('Contact updated successfully.');
    expect(api.getContacts).toHaveBeenCalledTimes(2);
  });

  it('should handle update contact error', async () => {
    api.getContacts.mockResolvedValue([]);
    api.updateContactById.mockRejectedValue(new Error('Failed to update'));

    const { result } = renderHook(() => useContacts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const updateData = { name: 'Updated Name' };
    await act(async () => {
      await result.current.updateContact(1, updateData);
    });

    expect(api.updateContactById).toHaveBeenCalledWith(1, updateData);
    expect(toast.error).toHaveBeenCalledWith('Failed to update contact.');
    expect(api.getContacts).toHaveBeenCalledTimes(1); // Should not refetch
  });
});
