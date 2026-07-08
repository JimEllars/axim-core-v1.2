import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DashboardContent from './DashboardContent';
import { DashboardProvider } from '../../contexts/DashboardContext';

// Mock dependencies
vi.mock('./MetricsGrid', () => ({ default: () => <div data-testid="MetricsGrid">MetricsGrid</div> }));
vi.mock('./ActionPanel', () => ({ default: () => <div data-testid="ActionPanel">ActionPanel</div> }));
vi.mock('./ContactManager', () => ({ default: () => <div data-testid="ContactManager">ContactManager</div> }));
vi.mock('./VisualizationPanel', () => ({ default: () => <div data-testid="VisualizationPanel">VisualizationPanel</div> }));
vi.mock('./EventLog', () => ({ default: () => <div data-testid="EventLog">EventLog</div> }));
vi.mock('./RecentWorkflows', () => ({ default: () => <div data-testid="RecentWorkflows">RecentWorkflows</div> }));
vi.mock('./GenerativeAIPanel', () => ({ default: () => <div data-testid="GenerativeAIPanel">GenerativeAIPanel</div> }));
vi.mock('./AIInteractionsChart', () => ({ default: () => <div data-testid="AIInteractionsChart">AIInteractionsChart</div> }));
vi.mock('./FleetStatusMap', () => ({ default: () => <div data-testid="FleetStatusMap">FleetStatusMap</div> }));
vi.mock('./SystemAutonomyMap', () => ({ default: () => <div data-testid="SystemAutonomyMap">SystemAutonomyMap</div> }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  }
}));

describe('DashboardContent', () => {
  it('should render the dashboard layout with all components', () => {
    render(
      <DashboardProvider>
        <DashboardContent />
      </DashboardProvider>
    );

    expect(screen.getByText('Unified Command Terminal')).toBeInTheDocument();
    expect(screen.getByText('Active State Monitoring & Ecosystem Aggregation')).toBeInTheDocument();
    expect(screen.getByTestId('MetricsGrid')).toBeInTheDocument();
    expect(screen.getByTestId('FleetStatusMap')).toBeInTheDocument();
    expect(screen.getByTestId('SystemAutonomyMap')).toBeInTheDocument();
  });
});
