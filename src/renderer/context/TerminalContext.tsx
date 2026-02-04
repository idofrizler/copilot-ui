import React, { createContext, useContext, useCallback, ReactNode } from 'react';

export interface TerminalContextValue {
  /** Execute a command in the terminal. Opens terminal if closed. */
  runCommand: (command: string) => void;
  /** Whether the terminal panel is currently open/visible */
  isTerminalOpen: boolean;
  /** Open the terminal panel */
  openTerminal: () => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export interface TerminalProviderProps {
  children: ReactNode;
  /** Current session ID for the terminal */
  sessionId: string | null;
  /** Whether the terminal is currently open */
  isTerminalOpen: boolean;
  /** Callback to open the terminal */
  onOpenTerminal: () => void;
  /** Callback to ensure terminal is initialized for the session */
  onInitializeTerminal: () => void;
}

export const TerminalProvider: React.FC<TerminalProviderProps> = ({
  children,
  sessionId,
  isTerminalOpen,
  onOpenTerminal,
  onInitializeTerminal,
}) => {
  const runCommand = useCallback(
    (command: string) => {
      if (!sessionId) {
        console.error('Cannot run command: no active session');
        return;
      }

      // Ensure terminal is initialized and open
      onInitializeTerminal();
      if (!isTerminalOpen) {
        onOpenTerminal();
      }

      // Send command to terminal with newline to execute it
      // Small delay to ensure terminal is ready if it was just opened
      const sendCommand = () => {
        window.electronAPI.pty.write(sessionId, command + '\n');
      };

      // If terminal was closed, give it a moment to initialize
      if (!isTerminalOpen) {
        setTimeout(sendCommand, 150);
      } else {
        sendCommand();
      }
    },
    [sessionId, isTerminalOpen, onOpenTerminal, onInitializeTerminal]
  );

  const openTerminal = useCallback(() => {
    onInitializeTerminal();
    onOpenTerminal();
  }, [onOpenTerminal, onInitializeTerminal]);

  const value: TerminalContextValue = {
    runCommand,
    isTerminalOpen,
    openTerminal,
  };

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
};

/**
 * Hook to access terminal context for running commands.
 * Returns null if used outside of TerminalProvider.
 */
export const useTerminal = (): TerminalContextValue | null => {
  return useContext(TerminalContext);
};

/**
 * Hook to access terminal context, throws if not available.
 * Use this when you expect the context to always be available.
 */
export const useTerminalRequired = (): TerminalContextValue => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminalRequired must be used within a TerminalProvider');
  }
  return context;
};

export default TerminalContext;
