// src/components/commandhub/CommandHub.test.jsx
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import CommandHub from '../CommandHub';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useCommandHandler } from '../../hooks/useCommandHandler';
import { useCommandHubState } from '../../hooks/useCommandHubState';
import { CommandNotFoundError } from '../../services/onyxAI/errors';

// Mock the hooks
vi.mock('../../contexts/SupabaseContext');
vi.mock('../../hooks/useCommandHandler');
vi.mock('../../hooks/useCommandHubState');

// Mock child components for isolation
vi.mock('../command/SystemStatus', () => ({ default: () => <div data-testid="system-status" /> }));
vi.mock('./ChatInterface', () => ({ default: ({ state, handlers }) => {
    const { messages = [] } = state || {};
    const { onClearChat } = handlers || {};
    return (
    <div>
        <button onClick={onClearChat}>Clear Chat</button>
        <div data-testid="chat-interface">
            {messages.map((msg, i) => (
                <div key={i}>
                    {typeof msg.content === 'object' ? JSON.stringify(msg.content) : msg.content}
                </div>
            ))}
        </div>
    </div>
);
}}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('CommandHub Component', () => {
    let mockHandleCommand;
    let mockDispatch;

    const mockState = {
        messages: [{ type: 'assistant', content: 'Welcome!', timestamp: new Date() }],
        inputValue: '',
        systemStats: {},
        recentCommands: ['help', 'status'],
    };

    beforeEach(() => {
        mockHandleCommand = vi.fn();
        mockDispatch = vi.fn();

        useSupabase.mockReturnValue({ supabase: { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) } });
        useCommandHandler.mockReturnValue({
            handleCommand: mockHandleCommand,
            init: vi.fn(),
        });
        useCommandHubState.mockReturnValue([mockState, mockDispatch]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const renderComponent = () => render(<MemoryRouter><CommandHub /></MemoryRouter>);

    it('renders the initial layout with recent commands', () => {
        renderComponent();
        expect(screen.getByText('Onyx Command Hub')).toBeInTheDocument();
        expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
        expect(screen.getByTestId('system-status')).toBeInTheDocument();
        expect(screen.getByText('help')).toBeInTheDocument();
        expect(screen.getByText('status')).toBeInTheDocument();
    });

    it('allows a user to type and submit a command', async () => {
        mockState.inputValue = 'test command';
        renderComponent();

        const submitButton = screen.getByRole('button', { name: /send/i });

        await act(async () => {
            fireEvent.click(submitButton);
        });

        await waitFor(() => {
            expect(mockHandleCommand).toHaveBeenCalledWith('test command', { agentName: 'Onyx (Default)' });
            expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_INPUT_VALUE', payload: '' });
        });
    });

    it('handles the "clear" command via the UI button', async () => {
        renderComponent();
        const clearButton = screen.getByRole('button', { name: /clear chat/i });

        await act(async () => {
            fireEvent.click(clearButton);
        });

        await waitFor(() => {
            expect(mockHandleCommand).toHaveBeenCalledWith('clear');
        });
    });

    it('displays a properly formatted error message for an unknown command', async () => {
        const command = 'unknown command';
        const error = new CommandNotFoundError(`The command "${command}" is not recognized.`);

        const errorState = {
            ...mockState,
            messages: [
                ...mockState.messages,
                {
                    type: 'error',
                    content: { title: 'Command Not Found', details: error.message },
                    timestamp: new Date()
                }
            ]
        };
        useCommandHubState.mockReturnValue([errorState, mockDispatch]);

        renderComponent();

        await waitFor(() => {
            const expectedErrorDetails = JSON.stringify({ title: 'Command Not Found', details: error.message });
            expect(screen.getByText(expectedErrorDetails)).toBeInTheDocument();
        });
    });
});
