import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';
import { vi } from 'vitest';

const ProblematicComponent = () => {
  throw new Error('Test Error');
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy;

  // Before each test, mock console.error to suppress the expected error logs.
  // This prevents the test runner from failing due to React's error logging.
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore the original console.error and any other mocks after each test.
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('renders children when there is no error', () => {
    // This test doesn't throw, so we can restore the mock immediately.
    consoleErrorSpy.mockRestore();
    render(
      <ErrorBoundary>
        <div>Child Component</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child Component')).toBeInTheDocument();
  });

  it('catches an error and displays the correct fallback UI', () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>
    );

    // Check for correct fallback UI elements
    expect(screen.getByText('We encountered an unexpected anomaly.')).toBeInTheDocument();
    expect(screen.getByText(/Onyx has been notified/)).toBeInTheDocument();
  });

  it('calls window.location.reload when "Safe Reload Dashboard" is clicked', () => {
    // Mock window.location.reload
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('Safe Reload Dashboard'));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

});
