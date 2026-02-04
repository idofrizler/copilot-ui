import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ChoiceSelector } from '../../src/renderer/components/ChoiceSelector/ChoiceSelector';
import type { DetectedChoice } from '../../src/renderer/types';

describe('ChoiceSelector Component', () => {
  const mockChoices: DetectedChoice[] = [
    { id: 'rebase', label: 'Rebase', description: 'keeps history clean' },
    { id: 'merge', label: 'Merge', description: 'creates a merge commit' },
  ];

  it('renders nothing when choices is empty', () => {
    const { container } = render(<ChoiceSelector choices={[]} onSelect={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all choice buttons', () => {
    render(<ChoiceSelector choices={mockChoices} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Rebase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Merge/i })).toBeInTheDocument();
  });

  it('displays choice labels', () => {
    render(<ChoiceSelector choices={mockChoices} onSelect={() => {}} />);
    expect(screen.getByText('Rebase')).toBeInTheDocument();
    expect(screen.getByText('Merge')).toBeInTheDocument();
  });

  it('displays choice descriptions as tooltips', () => {
    render(<ChoiceSelector choices={mockChoices} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Rebase/i })).toHaveAttribute(
      'title',
      'keeps history clean'
    );
    expect(screen.getByRole('button', { name: /Merge/i })).toHaveAttribute(
      'title',
      'creates a merge commit'
    );
  });

  it('calls onSelect with choice when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ChoiceSelector choices={mockChoices} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /Rebase/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(mockChoices[0]);
  });

  it('disables buttons when disabled prop is true', () => {
    render(<ChoiceSelector choices={mockChoices} onSelect={() => {}} disabled />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it('renders without descriptions when not provided', () => {
    const choicesWithoutDesc: DetectedChoice[] = [
      { id: 'option1', label: 'Option 1' },
      { id: 'option2', label: 'Option 2' },
    ];
    render(<ChoiceSelector choices={choicesWithoutDesc} onSelect={() => {}} />);

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });
});
