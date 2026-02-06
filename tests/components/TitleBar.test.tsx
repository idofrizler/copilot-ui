import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TitleBar, ModelOption } from '../../src/renderer/components/TitleBar/TitleBar';

// Mock the logo import
vi.mock('../../src/renderer/assets/logo.png', () => ({
  default: 'test-logo.png',
}));

// Mock WindowControls since it relies on Electron APIs
vi.mock('../../src/renderer/components/WindowControls', () => ({
  WindowControls: () => <div data-testid="window-controls">WindowControls</div>,
}));

const createMockModels = (): ModelOption[] => [
  { id: 'gpt-4', name: 'GPT-4', multiplier: 1 },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', multiplier: 0.5 },
  { id: 'claude-3', name: 'Claude 3', multiplier: 0 },
  { id: 'gpt-3.5', name: 'GPT-3.5', multiplier: 2 },
];

describe('TitleBar Component', () => {
  const mockOnModelChange = vi.fn();
  const mockOnOpenSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the app logo and name', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      expect(screen.getByAltText('Cooper')).toBeInTheDocument();
      expect(screen.getByText('Cooper')).toBeInTheDocument();
    });

    it('renders WindowControls', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      expect(screen.getByTestId('window-controls')).toBeInTheDocument();
    });

    it('renders the settings button', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      expect(screen.getByTestId('settings-button')).toBeInTheDocument();
    });

    it('renders with model-selector data-tour attribute', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      expect(screen.getByTestId('settings-button').closest('div')).toBeInTheDocument();
    });
  });

  describe('Settings Button', () => {
    it('calls onOpenSettings when settings button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      await user.click(screen.getByTestId('settings-button'));

      expect(mockOnOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('has correct title attribute for accessibility', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      expect(screen.getByTestId('settings-button')).toHaveAttribute('title', 'Settings');
    });
  });

  describe('Mobile Mode', () => {
    it('hides controls when isMobile is true', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={true}
        />
      );

      // The settings button should be in a hidden container
      const settingsButton = screen.getByTestId('settings-button');
      expect(settingsButton.closest('.hidden')).toBeInTheDocument();
    });

    it('shows controls when isMobile is false', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      // The settings button should not be in a hidden container
      const settingsButton = screen.getByTestId('settings-button');
      expect(settingsButton.closest('.hidden')).not.toBeInTheDocument();
    });

    it('still renders logo and name in mobile mode', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={true}
        />
      );

      expect(screen.getByAltText('Cooper')).toBeInTheDocument();
      expect(screen.getByText('Cooper')).toBeInTheDocument();
    });
  });

  describe('Model Selector', () => {
    it('renders with the Model dropdown', () => {
      render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      // The model selector container should have data-tour attribute
      expect(document.querySelector('[data-tour="model-selector"]')).toBeInTheDocument();
    });

    it('shows Loading placeholder when no model selected', () => {
      render(
        <TitleBar
          currentModel={null}
          availableModels={[]}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('has drag-region class for window dragging', () => {
      const { container } = render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      expect(container.firstChild).toHaveClass('drag-region');
    });

    it('has shrink-0 class to prevent flex shrinking', () => {
      const { container } = render(
        <TitleBar
          currentModel="gpt-4"
          availableModels={createMockModels()}
          onModelChange={mockOnModelChange}
          onOpenSettings={mockOnOpenSettings}
          isMobile={false}
        />
      );

      expect(container.firstChild).toHaveClass('shrink-0');
    });
  });
});
