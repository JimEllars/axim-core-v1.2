import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ManualOperations from './ManualOperations';

describe('ManualOperations', () => {
  it('renders the component with the correct title', () => {
    render(<ManualOperations onCommand={() => {}} />);
    expect(screen.getByText('Manual Operations')).toBeInTheDocument();
  });

  it('calls the onCommand prop with the correct arguments when "Force Database Sync" is clicked', () => {
    const handleCommand = vi.fn();
    render(<ManualOperations onCommand={handleCommand} />);
    fireEvent.click(screen.getByText('Force Database Sync'));
    expect(handleCommand).toHaveBeenCalledWith('sync crm', true);
  });

  it('calls the onCommand prop with the correct arguments when "Recalculate Metrics" is clicked', () => {
    const handleCommand = vi.fn();
    render(<ManualOperations onCommand={handleCommand} />);
    fireEvent.click(screen.getByText('Recalculate Metrics'));
    expect(handleCommand).toHaveBeenCalledWith('recalculate metrics', true);
  });

  it('reloads the window when "System Refresh" is clicked', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
        value: { reload },
        writable: true,
    });
    render(<ManualOperations onCommand={() => {}} />);
    fireEvent.click(screen.getByText(/System Refresh/));
    expect(reload).toHaveBeenCalled();
  });
});
