import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';
import { vi } from 'vitest';

const ProblematicComponent = () => {
  throw new Error('Test Error');
};

const ChunkLoadErrorComponent = () => {
  throw new TypeError('Failed to fetch dynamically imported module');
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {

    vi.restoreAllMocks();
  });

  it('renders children when there is no error', () => {
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

    expect(screen.getByText('Application Error: Please check console or refresh.')).toBeInTheDocument();
  });

  it('calls window.location.reload when "Safe Reload Dashboard" is clicked', () => {
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

    fireEvent.click(screen.getByText('Refresh Dashboard'));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('catches chunk load error and displays network error fallback', () => {
    render(
      <ErrorBoundary>
        <ChunkLoadErrorComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Network error loading this module.')).toBeInTheDocument();
  });
});
