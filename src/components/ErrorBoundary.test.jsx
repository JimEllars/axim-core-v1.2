import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText('Application Error')).toBeInTheDocument();
    expect(screen.getByText(/A critical error occurred/)).toBeInTheDocument();
    expect(screen.getByText(/Test Error/)).toBeInTheDocument(); // Check for the error message itself
  });

  it('calls window.location.reload when "Refresh Page" is clicked', () => {
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

    fireEvent.click(screen.getByText('Refresh Page'));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('copies error details to clipboard when "Copy Details" is clicked', async () => {
    // Mock navigator.clipboard.writeText
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('Copy Details'));

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    // The component formats the error. We'll check that the core message is present.
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('Error: Test Error'));
  });
});
