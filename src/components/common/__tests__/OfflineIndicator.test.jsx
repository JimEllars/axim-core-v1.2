// src/components/common/__tests__/OfflineIndicator.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectivityContext } from '../../../contexts/ConnectivityContext';
import OfflineIndicator from '../OfflineIndicator';

describe('OfflineIndicator', () => {
  it('should not render when the user is online', () => {
    render(
      <ConnectivityContext.Provider value={{ isOnline: true }}>
        <OfflineIndicator />
      </ConnectivityContext.Provider>
    );
    expect(screen.queryByText(/You are currently offline/)).not.toBeInTheDocument();
  });

  it('should render when the user is offline', () => {
    render(
      <ConnectivityContext.Provider value={{ isOnline: false }}>
        <OfflineIndicator />
      </ConnectivityContext.Provider>
    );
    expect(screen.getByText(/System Offline/i)).toBeInTheDocument();
  });
});
