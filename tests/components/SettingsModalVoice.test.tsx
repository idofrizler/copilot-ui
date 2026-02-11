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
    zoomFactor: 1,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
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

  it('shows Accessibility section in sidebar', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText('Accessibility')).toBeInTheDocument();
  });

  it('displays voice settings when Voice section is selected', () => {
    render(<SettingsModal {...defaultProps} modelLoaded={true} />);

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
    render(<SettingsModal {...defaultProps} onInitVoice={vi.fn()} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Speech-to-Text')).toBeInTheDocument();
    expect(screen.getByText(/Click to initialize/)).toBeInTheDocument();
  });

  it('shows loading status when model is loading', () => {
    render(<SettingsModal {...defaultProps} isModelLoading={true} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText('Setting up voice...')).toBeInTheDocument();
  });

  it('shows ready status when model is loaded', () => {
    render(<SettingsModal {...defaultProps} modelLoaded={true} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText(/Ready.*use mic button/)).toBeInTheDocument();
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
    render(<SettingsModal {...defaultProps} modelLoaded={true} />);
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
    render(<SettingsModal {...defaultProps} modelLoaded={true} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(screen.getByText(/Wake:/)).toBeInTheDocument();
    expect(screen.getByText(/Stop:/)).toBeInTheDocument();
    expect(screen.getByText(/Cancel:/)).toBeInTheDocument();
    expect(screen.getByText(/Extend:/)).toBeInTheDocument();
  });

  it('shows not supported message when voice is not supported', () => {
    render(<SettingsModal {...defaultProps} voiceSupported={false} />);
    fireEvent.click(screen.getByText('Voice'));

    expect(
      screen.getByText('Voice features are not supported in this environment.')
    ).toBeInTheDocument();
  });

  it('displays zoom controls when Accessibility section is selected', () => {
    render(<SettingsModal {...defaultProps} zoomFactor={1.2} />);
    fireEvent.click(screen.getByText('Accessibility'));

    expect(screen.getByText('Zoom & Font Size')).toBeInTheDocument();
    expect(screen.getByText('120%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset zoom (Ctrl/Cmd 0)' })).toBeInTheDocument();
  });
});

describe('SettingsModal Diagnostics Section', () => {
  it('shows diagnostics paths and triggers reveal handlers', () => {
    const onRevealLogFile = vi.fn();
    const onOpenCrashDumps = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        soundEnabled={true}
        onSoundEnabledChange={vi.fn()}
        diagnosticsPaths={{
          logFilePath: 'C:\\logs\\main.log',
          crashDumpsPath: 'C:\\crash-dumps',
        }}
        onRevealLogFile={onRevealLogFile}
        onOpenCrashDumps={onOpenCrashDumps}
      />
    );

    fireEvent.click(screen.getByText('Diagnostics'));

    expect(screen.getByText('Crash Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Crash dumps')).toBeInTheDocument();

    const revealButtons = screen.getAllByText('Reveal');
    fireEvent.click(revealButtons[0]);
    fireEvent.click(revealButtons[1]);

    expect(onRevealLogFile).toHaveBeenCalledWith('C:\\logs\\main.log');
    expect(onOpenCrashDumps).toHaveBeenCalledWith('C:\\crash-dumps');
  });
});
