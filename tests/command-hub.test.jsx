import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InputForm from '../src/components/commandhub/InputForm';
import { dispatchCommand } from '../src/services/apiClient';

vi.mock('../src/services/apiClient', () => ({
  dispatchCommand: vi.fn(),
}));

// Mock Supabase
vi.mock('../src/contexts/SupabaseContext', () => ({
  useSupabase: () => ({
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'mock_token' } } })
      }
    }
  })
}));

// Mock MatchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});


describe('InputForm - Command Hub Parser', () => {
  let mockOnInputValueChange;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnInputValueChange = vi.fn();
    window.dispatchEvent = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: 'mock_stream',
      json: () => Promise.resolve({}),
    });
  });

  it('parses standard text and sends to Onyx RAG', async () => {
    render(
      <InputForm
        inputValue="Hello Onyx"
        onInputValueChange={mockOnInputValueChange}
        isProcessing={false}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /send command/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
        const fetchCall = global.fetch.mock.calls[0];
        expect(fetchCall[0]).toContain('onyx-bridge');
        expect(JSON.parse(fetchCall[1].body).prompt).toBe('Hello Onyx');
    });

    expect(dispatchCommand).not.toHaveBeenCalled();
  });

  it('detects slash command and routes to universal dispatcher', async () => {
    dispatchCommand.mockResolvedValueOnce({ message: 'Success' });

    render(
      <InputForm
        inputValue="/crm update record 123"
        onInputValueChange={mockOnInputValueChange}
        isProcessing={false}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /send command/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dispatchCommand).toHaveBeenCalledWith({
        intent: 'crm',
        parameters: 'update record 123'
      });
    });

    expect(global.fetch).not.toHaveBeenCalled();

    // Check if the agent status event was dispatched
    const eventCalls = window.dispatchEvent.mock.calls;
    const statusCall = eventCalls.find(call => call[0].type === 'onyx-agent-status' && call[0].detail.status === 'Success');
    expect(statusCall).toBeDefined();
  });

  it('detects slash command without parameters', async () => {
    dispatchCommand.mockResolvedValueOnce({ message: 'Success' });

    render(
      <InputForm
        inputValue="/analyze"
        onInputValueChange={mockOnInputValueChange}
        isProcessing={false}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /send command/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(dispatchCommand).toHaveBeenCalledWith({
        intent: 'analyze',
        parameters: ''
      });
    });
  });
});
