import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleManagementModal from './RoleManagementModal';

describe('RoleManagementModal', () => {
  it('prevents changes to a root-protected Super User', () => {
    render(
      <RoleManagementModal
        user={{ id: 'root-user', email: 'jrellars@gmail.com', role: 'admin' }}
        onClose={vi.fn()}
        onRoleUpdate={vi.fn()}
        isRootProtected
      />
    );

    expect(screen.getByText(/Super User \(Root Protected\)/)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Root Protected' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Root Protected' }).closest('form'));
    expect(screen.getByText(/cannot be changed/)).toBeInTheDocument();
  });
});
