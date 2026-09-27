import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { SupabaseContext } from './SupabaseContext';

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

describe('AuthContext', () => {
  it('renders children correctly', async () => {
    render(
      <SupabaseContext.Provider value={{ supabaseClient: {} }}>
         <AuthProvider><div data-testid="child">Child Content</div></AuthProvider>
      </SupabaseContext.Provider>
    );
    expect(await screen.findByTestId('child')).toBeInTheDocument();
  });
});
