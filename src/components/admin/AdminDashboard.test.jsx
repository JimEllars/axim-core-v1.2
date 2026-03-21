import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminDashboard from './AdminDashboard';
import { useAuth } from '../../contexts/AuthContext';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/onyxAI/api';

// Mock the api service
vi.mock('../../services/onyxAI/api', () => ({
  default: {
    getUsers: vi.fn(),
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
    inviteUser: vi.fn(),
    saveApiKeys: vi.fn(),
    initialize: vi.fn(),
    getWorkflowExecutions: vi.fn().mockResolvedValue([]),
    getUserSettings: vi.fn().mockResolvedValue({}),
    getAvailableProviderNames: vi.fn().mockResolvedValue(['openai', 'gemini']),
  }
}));

// Mock the Auth context to provide a user
vi.mock('../../contexts/AuthContext', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useAuth: vi.fn(),
  };
});

// Create a stable mock builder that supports chaining
const mockSupabaseBuilder = {
  select: vi.fn(function() { return this; }),
  eq: vi.fn(function() { return this; }),
  gte: vi.fn(function() { return this; }),
  single: vi.fn(() => Promise.resolve({ data: { role: 'admin' }, error: null })),
  then: (resolve) => resolve({ data: [], error: null, count: 0 }),
};

// Create a stable mock client instance
const mockSupabaseClient = {
  from: vi.fn(() => mockSupabaseBuilder),
  auth: {
    getSession: vi.fn(() => Promise.resolve({
      data: {
        session: {
          user: { id: '1', email: 'admin@example.com' }
        }
      }
    })),
    onAuthStateChange: vi.fn((callback) => {
      callback('SIGNED_IN', { user: { id: '1', email: 'admin@example.com' } });
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      };
    }),
  },
};

// Mock the Supabase context
vi.mock('../../contexts/SupabaseContext', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    SupabaseProvider: ({ children }) => <>{children}</>,
    useSupabase: () => ({ supabase: mockSupabaseClient }),
  };
});

const mockUsers = [
  { id: '1', email: 'admin@example.com', role: 'admin', created_at: new Date().toISOString() },
  { id: '2', email: 'user@example.com', role: 'user', created_at: new Date().toISOString() },
];

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { id: '1', email: 'admin@example.com' },
    });
    api.getUsers.mockResolvedValue(mockUsers);
    api.updateUserRole.mockResolvedValue({});
    api.deleteUser.mockResolvedValue({});
    api.inviteUser.mockResolvedValue({});
  });

  it('renders the component and fetches users', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();

    // Click on User Management tab
    const usersTab = screen.getByRole('button', { name: /User Management/i });
    fireEvent.click(usersTab);

    expect(screen.getByText('Loading users...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      expect(screen.getByText('user@example.com')).toBeInTheDocument();
    });

    expect(api.getUsers).toHaveBeenCalledTimes(1);
  });

  it('opens the role management modal when edit is clicked for another user', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    // Click on User Management tab
    const usersTab = screen.getByRole('button', { name: /User Management/i });
    fireEvent.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('user@example.com')).toBeInTheDocument();
    });

    const userRow = screen.getByText('user@example.com').closest('tr');
    const editButton = within(userRow).getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByText('Change User Role')).toBeInTheDocument();
    });
  });

  it('opens the invite user modal when invite button is clicked', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    // Click on User Management tab
    const usersTab = screen.getByRole('button', { name: /User Management/i });
    fireEvent.click(usersTab);

    await waitFor(() => {
        expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Invite User'));

    await waitFor(() => {
      expect(screen.getByText('Invite New User')).toBeInTheDocument();
    });
  });

  it('disables edit and delete buttons for the current user', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    // Click on User Management tab
    const usersTab = screen.getByRole('button', { name: /User Management/i });
    fireEvent.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    });

    const adminRow = screen.getByText('admin@example.com').closest('tr');
    const editButton = within(adminRow).getByRole('button', { name: /edit/i });
    const deleteButton = within(adminRow).getByRole('button', { name: /delete/i });

    expect(editButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();

    const userRow = screen.getByText('user@example.com').closest('tr');
    const otherEditButton = within(userRow).getByRole('button', { name: /edit/i });
    const otherDeleteButton = within(userRow).getByRole('button', { name: /delete/i });

    expect(otherEditButton).not.toBeDisabled();
    expect(otherDeleteButton).not.toBeDisabled();
  });
});
