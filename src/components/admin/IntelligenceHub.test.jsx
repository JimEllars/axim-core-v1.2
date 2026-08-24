import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IntelligenceHub from './IntelligenceHub';
import { useAuth } from '../../contexts/AuthContext';
import { useSupabase } from '../../contexts/SupabaseContext';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../contexts/SupabaseContext', () => ({
  useSupabase: vi.fn(),
}));

// Mock Framer Motion to render children directly
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => {
      const { initial, animate, exit, transition, ...validProps } = props;
      return <div {...validProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('IntelligenceHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders correctly and performs a RAG query', async () => {
    useAuth.mockReturnValue({ user: { id: 'test-id', token: 'mock-token' }, settings: { default_model: 'gpt-4o' } });

    // Mock Supabase with a valid channel implementation
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    };
    useSupabase.mockReturnValue({
      supabase: {
        channel: vi.fn().mockReturnValue(mockChannel),
        removeChannel: vi.fn(),
      },
      session: { access_token: 'mock-token' }
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'This is a mocked AI response from RAG.',
        sources: [
          { content: 'Mocked context source 1', similarity: 0.95 },
          { content: 'Mocked context source 2', similarity: 0.88 }
        ]
      })
    });

    render(<IntelligenceHub />);

    expect(screen.getByText('Intelligence Hub (RAG)')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Ask a question about your knowledge base...');
    const button = screen.getByRole('button', { name: /ask/i });

    fireEvent.change(input, { target: { value: 'How does the ecosystem work?' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/document-qa'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: 'How does the ecosystem work?',
            user_id: 'test-id',
            provider: 'openai'
          })
        })
      );
    });

    await waitFor(() => {
       expect(screen.getByText('This is a mocked AI response from RAG.')).toBeInTheDocument();
       expect(screen.getByText('Mocked context source 1')).toBeInTheDocument();
       expect(screen.getByText('Mocked context source 2')).toBeInTheDocument();
    });
  });

  it('handles 502 Bad Gateway gracefully', async () => {
    useAuth.mockReturnValue({ user: { id: 'test-id', token: 'mock-token' } });

    const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
    };
    useSupabase.mockReturnValue({
        supabase: { channel: vi.fn().mockReturnValue(mockChannel), removeChannel: vi.fn() },
    });

    global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway'
    });

    render(<IntelligenceHub />);

    const input = screen.getByPlaceholderText('Ask a question about your knowledge base...');
    fireEvent.change(input, { target: { value: 'Test query' } });
    fireEvent.click(screen.getByRole('button', { name: /ask/i }));

    await waitFor(() => {
        expect(screen.getByText('Upstream AI provider is currently unreachable.')).toBeInTheDocument();
    });
  });
});
