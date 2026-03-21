import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WorkflowTriggers from './WorkflowTriggers';

describe('WorkflowTriggers', () => {
  it('renders the component with the correct title', () => {
    render(<WorkflowTriggers onSetInput={() => {}} />);
    expect(screen.getByText('Workflow Triggers')).toBeInTheDocument();
  });

  it('calls the onSetInput prop with the correct arguments when "Transcription Sprint" is clicked', () => {
    const handleSetInput = vi.fn();
    render(<WorkflowTriggers onSetInput={handleSetInput} />);
    fireEvent.click(screen.getByText('Transcription Sprint'));
    expect(handleSetInput).toHaveBeenCalledWith('trigger transcription sprint');
  });

  it('calls the onSetInput prop with the correct arguments when "Axim Project Initiation" is clicked', () => {
    const handleSetInput = vi.fn();
    render(<WorkflowTriggers onSetInput={handleSetInput} />);
    fireEvent.click(screen.getByText('Axim Project Initiation'));
    expect(handleSetInput).toHaveBeenCalledWith('trigger axim project initiation');
  });

  it('calls the onSetInput prop with the correct arguments when "Lead Nurture Sequence" is clicked', () => {
    const handleSetInput = vi.fn();
    render(<WorkflowTriggers onSetInput={handleSetInput} />);
    fireEvent.click(screen.getByText('Lead Nurture Sequence'));
    expect(handleSetInput).toHaveBeenCalledWith('trigger lead nurture');
  });
});
