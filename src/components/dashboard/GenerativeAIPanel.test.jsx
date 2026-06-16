import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import GenerativeAIPanel from './GenerativeAIPanel';
import onyxAI from '../../services/onyxAI';
import toast from 'react-hot-toast';

vi.mock('../../services/onyxAI', () => ({
  default: {
    routeCommand: vi.fn()
  }
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

// Mock ProviderSelector so it doesn't cause issues
vi.mock('../common/ProviderSelector', () => ({
  default: () => <div data-testid="provider-selector" />
}));

describe('GenerativeAIPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<GenerativeAIPanel />);
    expect(screen.getByText('Generative AI Studio')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter your prompt here/i)).toBeInTheDocument();
  });

  it('routes command through OnyxAI and surfaces success', async () => {
    onyxAI.routeCommand.mockResolvedValueOnce({ content: 'Here is your AI generated content' });

    let container;
    await act(async () => {
      container = render(<GenerativeAIPanel />);
    });

    const textarea = screen.getByPlaceholderText(/Enter your prompt here/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'test command' } });
    });

    const generateBtn = screen.getByRole('button', { name: /Generate/i });

    // We don't await the whole act yet to check for 'Generating...'
    act(() => {
      fireEvent.click(generateBtn);
    });

    expect(screen.getByText('Generating...')).toBeInTheDocument();

    await waitFor(() => {
      expect(onyxAI.routeCommand).toHaveBeenCalledWith('test command');
      expect(screen.getByText('Generated Content:')).toBeInTheDocument();
      expect(screen.getByText('Here is your AI generated content')).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Content generated successfully!');
    });
  });

  it('surfaces errors from command routing', async () => {
    onyxAI.routeCommand.mockRejectedValueOnce(new Error('IntentParsingError: Unrecognized command'));

    let container;
    await act(async () => {
      container = render(<GenerativeAIPanel />);
    });

    const textarea = screen.getByPlaceholderText(/Enter your prompt here/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'invalid command' } });
    });

    const generateBtn = screen.getByRole('button', { name: /Generate/i });
    await act(async () => {
      fireEvent.click(generateBtn);
    });

    await waitFor(() => {
      expect(onyxAI.routeCommand).toHaveBeenCalledWith('invalid command');
      expect(toast.error).toHaveBeenCalledWith('Generation failed: IntentParsingError: Unrecognized command');
      expect(screen.queryByText('Generated Content:')).not.toBeInTheDocument();
    });
  });
});
