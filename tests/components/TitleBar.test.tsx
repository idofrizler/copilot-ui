import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TitleBar } from '../../src/renderer/components/TitleBar/TitleBar';

// Mock the logo import
vi.mock('../../src/renderer/assets/logo.png', () => ({
  default: 'test-logo.png',
}));

// Mock WindowControls since it relies on Electron APIs
vi.mock('../../src/renderer/components/WindowControls', () => ({
  WindowControls: () => <div data-testid="window-controls">WindowControls</div>,
}));

describe('TitleBar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the app logo and name', () => {
      render(<TitleBar />);

      expect(screen.getByAltText('Cooper')).toBeInTheDocument();
      expect(screen.getByText('Cooper')).toBeInTheDocument();
    });

    it('renders WindowControls', () => {
      render(<TitleBar />);

      expect(screen.getByTestId('window-controls')).toBeInTheDocument();
    });

    it('renders logo and name in mobile mode', () => {
      render(<TitleBar isMobile={true} />);

      expect(screen.getByAltText('Cooper')).toBeInTheDocument();
      expect(screen.getByText('Cooper')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('has drag-region class for window dragging', () => {
      const { container } = render(<TitleBar />);

      expect(container.firstChild).toHaveClass('drag-region');
    });

    it('has shrink-0 class to prevent flex shrinking', () => {
      const { container } = render(<TitleBar />);

      expect(container.firstChild).toHaveClass('shrink-0');
    });
  });
});
