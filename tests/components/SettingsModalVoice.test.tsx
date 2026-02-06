import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../../src/renderer/components/SettingsModal/SettingsModal';
import React from 'react';

// Mock the theme context
vi.mock('../../src/renderer/context/ThemeContext', async () => {
  const actual = await vi.importActual('../../src/renderer/context/ThemeContext');
  return {
    ...actual,
    useTheme: () => ({
      themePreference: 'dark',
      setTheme: vi.fn(),
      availableThemes: [
        { id: 'dark', name: 'Dark' },
        { id: 'light', name: 'Light' },
      ],
      activeTheme: { id: 'dark', name: 'Dark' },
      importTheme: vi.fn(),
    }),
  };
});

// Mock telemetry
vi.mock('../../src/renderer/utils/telemetry', () => ({
  trackEvent: vi.fn(),
  TelemetryEvents: { FEATURE_THEME_CHANGED: 'theme_changed' },
}));

describe('SettingsModal Voice Section', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    soundEnabled: true,
    onSoundEnabledChange: vi.fn(),
    voiceSupported: true,
    voiceMuted: false,
    onToggleVoiceMute: vi.fn(),
    pushToTalk: false,
    onTogglePushToTalk: vi.fn(),
    alwaysListening: false,
    onToggleAlwaysListening: vi.fn(),
    isRecording: false,
    isSpeaking: false,
    isModelLoading: false,
    modelLoaded: false,
    voiceError: null,
    alwaysListeningError: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Voice section in sidebar', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('Voice')).toBeInTheDocument();
  });

  it('displays voice settings when Voice section is selected', () => {
    render(<SettingsModal {...defaultProps} />);

    // Click on Voice section
    fireEvent.click(screen.getByText('Voice'));

    // Check for voice settings content
    expect(screen.getByText('Voice Input')).toBeInTheDocument();
    expect(screen.getByText('Voice Output')).toBeInTheDocument();
    expect(screen.getByText('Always Listening')).toBeInTheDocument();
    expect(screen.getByText('Push to Talk')).toBeInTheDocument();
    expect(screen.getByText('Text-to-Speech')).toBeInTheDocument();
    expect(screen.getByText('Voice Commands')).toBeInTheDocument();
  });

  it('shows status indicator with correct text for uninitialized state', () => {
    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Speech-to-Text Status')).toBeInTheDocument();
    expect(screen.getByText('Click mic button to initialize')).toBeInTheDocument();
  });

  it('shows loading status when model is loading', () => {
    render(<SettingsModal {...defaultProps} isModelLoading={true} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Loading model...')).toBeInTheDocument();
  });

  it('shows ready status when model is loaded', () => {
    render(<SettingsModal {...defaultProps} modelLoaded={true} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Ready (Offline)')).toBeInTheDocument();
  });

  it('shows recording status when recording', () => {
    render(<SettingsModal {...defaultProps} isRecording={true} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Recording...')).toBeInTheDocument();
  });

  it('shows speaking status when speaking', () => {
    render(<SettingsModal {...defaultProps} isSpeaking={true} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Speaking...')).toBeInTheDocument();
  });

  it('shows listening for wake words status when always listening is enabled and model is loaded', () => {
    render(<SettingsModal {...defaultProps} alwaysListening={true} modelLoaded={true} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Listening for wake words...')).toBeInTheDocument();
  });

  it('calls onToggleAlwaysListening when Always Listening toggle is clicked', () => {
    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Voice'));

    // Find the Voice Input section and get the first toggle button (Always Listening)
    const voiceInputSection = screen.getByText('Voice Input').closest('div');
    const toggleButtons = voiceInputSection?.querySelectorAll('button');
    // First button is Always Listening toggle
    if (toggleButtons && toggleButtons.length > 0) {
      fireEvent.click(toggleButtons[0]);
    }

    expect(defaultProps.onToggleAlwaysListening).toHaveBeenCalledWith(true);
  });

  it('disables Push to Talk when Always Listening is enabled', () => {
    render(<SettingsModal {...defaultProps} alwaysListening={true} />);
    fireEvent.click(screen.getByText('Voice'));

    // Check the description text changes
    expect(screen.getByText('Disabled when Always Listening is on')).toBeInTheDocument();
  });

  it('shows voice error when present', () => {
    render(<SettingsModal {...defaultProps} voiceError="Test error message" />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('shows always listening error when present and always listening is on', () => {
    render(
      <SettingsModal
        {...defaultProps}
        alwaysListening={true}
        alwaysListeningError="Wake word error"
      />
    );
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText(/Wake word error/)).toBeInTheDocument();
  });

  it('displays voice commands reference', () => {
    render(<SettingsModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText(/Wake Words/)).toBeInTheDocument();
    expect(screen.getByText(/Stop Recording/)).toBeInTheDocument();
    expect(screen.getByText(/Abort\/Cancel/)).toBeInTheDocument();
    expect(screen.getByText(/Extend Input/)).toBeInTheDocument();
  });

  it('shows not supported message when voice is not supported', () => {
    render(<SettingsModal {...defaultProps} voiceSupported={false} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(
      screen.getByText('Voice features are not supported in this environment.')
    ).toBeInTheDocument();
  });
});
