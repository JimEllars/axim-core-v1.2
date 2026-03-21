// src/contexts/SupabaseContext.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SupabaseProvider, useSupabase } from './SupabaseContext';
import { createClient } from '@supabase/supabase-js';

// Mock the createClient function
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

const TestComponent = () => {
  const supabase = useSupabase();
  return <div>{supabase ? 'Supabase client provided' : 'No client'}</div>;
};

describe('SupabaseContext', () => {
  it('provides the Supabase client to child components', () => {
    const mockSupabaseClient = { auth: {} }; // A mock client object
    createClient.mockReturnValue(mockSupabaseClient);

    render(
      <SupabaseProvider>
        <TestComponent />
      </SupabaseProvider>
    );

    expect(screen.getByText('Supabase client provided')).toBeInTheDocument();
  });

  it('throws an error if useSupabase is used outside of a SupabaseProvider', () => {
    // Suppress the expected error from appearing in the console
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let error;
    try {
        render(<TestComponent />);
    } catch (e) {
        error = e;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('useSupabase must be used within a SupabaseProvider');

    consoleErrorSpy.mockRestore();
  });
});