import React from 'react';
import { render, screen } from '@testing-library/react';
import { SupabaseProvider } from '../contexts/SupabaseContext';
import { describe, it, expect, vi } from 'vitest';
import Dashboard from './Dashboard';

// Mock child components
vi.mock('./dashboard/MetricsGrid', () => ({
  default: () => <div data-testid="metrics-grid">MetricsGrid</div>,
}));
vi.mock('./dashboard/ActionPanel', () => ({
  default: () => <div data-testid="action-panel">ActionPanel</div>,
}));
vi.mock('./dashboard/ContactManager', () => ({
  default: () => <div data-testid="contact-manager">ContactManager</div>,
}));
vi.mock('./dashboard/VisualizationPanel', () => ({
  default: () => <div data-testid="visualization-panel">VisualizationPanel</div>,
}));
vi.mock('./dashboard/EventLog', () => ({
  default: () => <div data-testid="event-log">EventLog</div>,
}));
vi.mock('./dashboard/RecentWorkflows', () => ({
  default: () => <div data-testid="recent-workflows">RecentWorkflows</div>,
}));
vi.mock('./dashboard/GenerativeAIPanel', () => ({
  default: () => <div data-testid="generative-ai-panel">GenerativeAIPanel</div>,
}));
vi.mock('./dashboard/AIInteractionsChart', () => ({
  default: () => <div data-testid="ai-interactions-chart">AIInteractionsChart</div>,
}));
vi.mock('./dashboard/FleetStatusMap', () => ({
  default: () => <div data-testid="fleet-status-map">FleetStatusMap</div>,
}));

describe('Dashboard Component', () => {
  it('renders the main components of the dashboard', () => {
    render(<SupabaseProvider><Dashboard /></SupabaseProvider>);

    // Check for the header
    expect(screen.getByText('Operations Center')).toBeInTheDocument();

    // Check that all the child components are rendered
    expect(screen.getByTestId('metrics-grid')).toBeInTheDocument();
    expect(screen.getByTestId('action-panel')).toBeInTheDocument();
    expect(screen.getByTestId('contact-manager')).toBeInTheDocument();
    expect(screen.getByTestId('event-log')).toBeInTheDocument();
    expect(screen.getByTestId('recent-workflows')).toBeInTheDocument();
    expect(screen.getByTestId('generative-ai-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-interactions-chart')).not.toBeInTheDocument();
    expect(screen.getByTestId('visualization-panel')).toBeInTheDocument();
  });
});
