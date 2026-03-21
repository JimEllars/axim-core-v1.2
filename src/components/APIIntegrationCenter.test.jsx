import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import APIIntegrationCenter from './APIIntegrationCenter';
import api from '../services/onyxAI/api';
import { SupabaseProvider } from '../contexts/SupabaseContext';

// Mock the api service
vi.mock('../services/onyxAI/api');

// Mock child components to isolate the component under test
vi.mock('./api/APICard', () => ({
  default: ({ integration }) => <div data-testid="api-card">{integration.name}</div>,
}));
vi.mock('./api/APISetupWizard', () => ({
  default: () => <div>APISetupWizard</div>,
}));
vi.mock('./api/APITestConsole', () => ({
  default: () => <div>APITestConsole</div>,
}));
vi.mock('./api/AIAssistant', () => ({
  default: () => <div>AIAssistant</div>,
}));

// Mock Supabase context
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockResolvedValue({ data: [], error: null }),
  })),
};

const mockIntegrations = [
  {
    id: 1,
    name: 'Test API 1',
    type: 'rest_api',
    status: 'active',
    metadata: { description: 'Description for Test API 1' },
    endpoints: [{ name: '/users', method: 'GET' }],
    last_tested_at: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Test API 2',
    type: 'webhook',
    status: 'inactive',
    metadata: { description: 'Description for Test API 2' },
    endpoints: [{ name: '/events', method: 'POST' }],
    last_tested_at: new Date().toISOString(),
  },
];

const mockStats = {
  totalIntegrations: 2,
  activeIntegrations: 1,
  totalCalls: 1234,
  successRate: 99.8,
};

const renderComponent = () => {
  render(
    <SupabaseProvider value={{ supabase: mockSupabase }}>
      <APIIntegrationCenter />
    </SupabaseProvider>
  );
};

describe('APIIntegrationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component and displays the header', async () => {
    api.getIntegrationsWithStats.mockResolvedValue({ integrations: [], stats: mockStats });
    await act(async () => {
      renderComponent();
    });
    expect(screen.getByText('API Integration Center')).toBeInTheDocument();
    expect(screen.getByText('Connect and manage external APIs with AI assistance')).toBeInTheDocument();
  });

  it('displays a loading state initially', async () => {
    // Mock a pending promise
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    api.getIntegrationsWithStats.mockReturnValue(promise);

    await act(async () => {
      renderComponent();
    });

    // Check for the pulse animation on the stats cards
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);

    // Resolve the promise to avoid state update errors after the test ends
    await act(async () => {
        resolve({ integrations: [], stats: mockStats });
        await promise;
    });
  });

  it('fetches and displays a list of integrations', async () => {
    api.getIntegrationsWithStats.mockResolvedValue({ integrations: mockIntegrations, stats: mockStats });
    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Test API 1')).toBeInTheDocument();
      expect(screen.getByText('Test API 2')).toBeInTheDocument();
    });

    // Also check stats are displayed correctly
    expect(screen.getByText('Total Integrations')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Active Connections')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('API Calls Made')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('99.8%')).toBeInTheDocument();
  });

  it('displays a message when no integrations are found', async () => {
    api.getIntegrationsWithStats.mockResolvedValue({ integrations: [], stats: { ...mockStats, totalIntegrations: 0, activeIntegrations: 0 } });
    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
        expect(screen.getByText('No integrations configured yet')).toBeInTheDocument();
    });
    expect(screen.getByText('Set up your first integration')).toBeInTheDocument();
  });
});
