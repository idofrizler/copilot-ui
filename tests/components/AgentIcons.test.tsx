import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RalphIcon, LisaIcon } from '../../src/renderer/components/Icons/Icons';

describe('Agent Icons', () => {
  describe('RalphIcon', () => {
    it('renders with default size', () => {
      render(<RalphIcon />);
      const container = screen.getByRole('img', { name: 'Ralph' }).parentElement;
      expect(container).toHaveStyle({ width: '24px', height: '24px' });
    });

    it('renders with custom size', () => {
      render(<RalphIcon size={32} />);
      const container = screen.getByRole('img', { name: 'Ralph' }).parentElement;
      expect(container).toHaveStyle({ width: '32px', height: '32px' });
    });

    it('has white circular background', () => {
      render(<RalphIcon />);
      const container = screen.getByRole('img', { name: 'Ralph' }).parentElement;
      expect(container).toHaveClass('rounded-full');
      expect(container).toHaveClass('bg-white');
    });

    it('applies custom className', () => {
      render(<RalphIcon className="test-class" />);
      const container = screen.getByRole('img', { name: 'Ralph' }).parentElement;
      expect(container).toHaveClass('test-class');
    });
  });

  describe('LisaIcon', () => {
    it('renders with default size', () => {
      render(<LisaIcon />);
      const container = screen.getByRole('img', { name: 'Lisa' }).parentElement;
      expect(container).toHaveStyle({ width: '24px', height: '24px' });
    });

    it('renders with custom size', () => {
      render(<LisaIcon size={16} />);
      const container = screen.getByRole('img', { name: 'Lisa' }).parentElement;
      expect(container).toHaveStyle({ width: '16px', height: '16px' });
    });

    it('has white circular background', () => {
      render(<LisaIcon />);
      const container = screen.getByRole('img', { name: 'Lisa' }).parentElement;
      expect(container).toHaveClass('rounded-full');
      expect(container).toHaveClass('bg-white');
    });

    it('applies custom className', () => {
      render(<LisaIcon className="custom-class" />);
      const container = screen.getByRole('img', { name: 'Lisa' }).parentElement;
      expect(container).toHaveClass('custom-class');
    });
  });
});
