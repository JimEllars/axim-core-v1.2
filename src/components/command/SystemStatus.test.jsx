import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SystemStatus from './SystemStatus';

describe('SystemStatus', () => {
  const mockStats = {
    apiSuccessRate: 99.5,
    totalApiCalls: 1234,
    activeConnections: 42,
  };

  it('renders the component with the correct title', () => {
    render(<SystemStatus stats={mockStats} />);
    expect(screen.getByText('System Status')).toBeInTheDocument();
  });

  it('displays the correct API success rate', () => {
    render(<SystemStatus stats={mockStats} />);
    expect(screen.getByText('99.5%')).toBeInTheDocument();
  });

  it('displays the correct total API calls', () => {
    render(<SystemStatus stats={mockStats} />);
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('displays the correct number of active connections', () => {
    render(<SystemStatus stats={mockStats} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
