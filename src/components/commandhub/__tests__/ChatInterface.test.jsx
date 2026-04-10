import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChatInterface from '../ChatInterface';

// Mock the ChatMessage component as its internals are not relevant to this test
vi.mock('../../command/ChatMessage', () => ({
  default: ({ message }) => <div data-testid="chat-message">{message.content}</div>,
}));

describe('ChatInterface', () => {
  const mockMessages = [
    { type: 'user', content: 'Hello' },
    { type: 'assistant', content: 'Hi there!' },
  ];

  const defaultHandlers = {
    onClearChat: vi.fn(),
    onCopyContent: vi.fn(),
  };

  it('renders the session log title', () => {
    render(<ChatInterface state={{ messages: [] }} handlers={defaultHandlers} />);
    expect(screen.getByText('Operational Timeline')).toBeInTheDocument();
  });

  it('renders a list of messages', () => {
    render(<ChatInterface state={{ messages: mockMessages }} handlers={defaultHandlers} />);
    const messageElements = screen.getAllByTestId('chat-message');
    expect(messageElements).toHaveLength(mockMessages.length);
    expect(messageElements[0]).toHaveTextContent('Hello');
  });

  it('calls onClearChat when the "Clear" button is clicked', () => {
    const onClearChatMock = vi.fn();
    render(<ChatInterface state={{ messages: mockMessages }} handlers={{ ...defaultHandlers, onClearChat: onClearChatMock }} />);

    // Find the button by its accessible name (aria-label) or text content
    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    expect(onClearChatMock).toHaveBeenCalledTimes(1);
  });

  it('displays the "Clear" text on the clear button', () => {
    render(<ChatInterface state={{ messages: [] }} handlers={defaultHandlers} />);
    const clearButton = screen.getByRole('button', { name: /clear/i });

    // Check for the span containing the text "Clear"
    const buttonText = clearButton.querySelector('span');
    expect(buttonText).toBeInTheDocument();
    expect(buttonText).toHaveTextContent('Clear');
  });
});
