import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Spinner } from '../Spinner';
import { WarningIcon, CheckIcon, CopyIcon } from '../Icons';

interface CliSetupModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

type SetupState =
  | 'checking'
  | 'cli-not-installed'
  | 'installing-cli'
  | 'install-failed'
  | 'auth-required'
  | 'authenticating'
  | 'auth-failed'
  | 'complete';

export const CliSetupModal: React.FC<CliSetupModalProps> = ({ isOpen, onComplete }) => {
  const [state, setState] = useState<SetupState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [npmAvailable, setNpmAvailable] = useState(false);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [deviceUrl, setDeviceUrl] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Check CLI status on mount
  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  // Listen for device flow events from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI.copilot.onAuthDeviceFlow((data) => {
      setDeviceUrl(data.url);
      setDeviceCode(data.code);
    });
    return unsubscribe;
  }, []);

  const checkStatus = async () => {
    setState('checking');
    setError(null);

    try {
      const status = await window.electronAPI.copilot.checkCliStatus();

      if (status.error) {
        setError(status.error);
        setState('cli-not-installed');
        return;
      }

      setNpmAvailable(status.npmAvailable);

      if (!status.cliInstalled) {
        setState('cli-not-installed');
      } else if (!status.authenticated) {
        setState('auth-required');
      } else {
        setState('complete');
        setTimeout(() => onComplete(), 500);
      }
    } catch (err) {
      setError(String(err));
      setState('cli-not-installed');
    }
  };

  const handleInstallCli = async () => {
    if (!npmAvailable) {
      setError('npm is not available. Please install Node.js and npm first.');
      return;
    }

    setState('installing-cli');
    setError(null);

    // Transition to showing instructions
    setState('install-failed');
    setError(
      'Please run the following command in your terminal:\n\nnpm install -g @github/copilot-cli\n\nThen click "Check Again" below.'
    );
  };

  const handleAuthLogin = useCallback(async () => {
    setState('authenticating');
    setError(null);
    setDeviceCode(null);
    setDeviceUrl(null);

    try {
      const result = await window.electronAPI.copilot.authLogin();

      if (result.success) {
        setState('complete');
        setTimeout(() => onComplete(), 500);
      } else {
        setState('auth-failed');
        setError(result.error || 'Authentication failed. Please try again.');
      }
    } catch (err) {
      setState('auth-failed');
      setError(String(err));
    }
  }, [onComplete]);

  const handleOpenDeviceUrl = () => {
    if (deviceUrl) {
      window.open(deviceUrl);
    }
  };

  const handleSkip = () => {
    // Close modal and let user continue (they can retry from settings)
    onComplete();
  };

  const renderContent = () => {
    switch (state) {
      case 'checking':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <Spinner size="lg" />
            <p className="text-sm text-copilot-text-muted">Checking Copilot CLI status...</p>
          </div>
        );

      case 'cli-not-installed':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
              <WarningIcon size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-copilot-text font-medium">Copilot CLI not detected</p>
                <p className="text-xs text-copilot-text-muted mt-1">
                  Cooper requires the GitHub Copilot CLI to function.
                </p>
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded border border-red-500/20">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {npmAvailable ? (
                <>
                  <p className="text-sm text-copilot-text">
                    Would you like to install the Copilot CLI now?
                  </p>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={handleInstallCli}>
                      Install via npm
                    </Button>
                    <Button variant="secondary" onClick={handleSkip}>
                      Skip for now
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-copilot-text">
                    Please install Node.js and npm, then run:
                  </p>
                  <code className="text-xs bg-copilot-surface p-2 rounded border border-copilot-border">
                    npm install -g @github/copilot-cli
                  </code>
                  <Button variant="secondary" onClick={handleSkip} className="mt-2">
                    I'll do this manually
                  </Button>
                </>
              )}
            </div>
          </div>
        );

      case 'installing-cli':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <Spinner size="lg" />
            <p className="text-sm text-copilot-text-muted">
              Installing Copilot CLI... Check the terminal for progress.
            </p>
          </div>
        );

      case 'install-failed':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded">
              <WarningIcon size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-copilot-text font-medium">Installation failed</p>
                <p className="text-xs text-copilot-text-muted mt-1">
                  {error || 'Please try installing manually'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm text-copilot-text">Try installing manually:</p>
              <code className="text-xs bg-copilot-surface p-2 rounded border border-copilot-border">
                npm install -g @github/copilot-cli
              </code>
              <div className="flex gap-2 mt-2">
                <Button variant="secondary" onClick={checkStatus}>
                  Check Again
                </Button>
                <Button variant="secondary" onClick={handleSkip}>
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        );

      case 'auth-required':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded">
              <WarningIcon size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-copilot-text font-medium">Authentication required</p>
                <p className="text-xs text-copilot-text-muted mt-1">
                  Sign in with your GitHub account to use Copilot
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm text-copilot-text">
                Click below to start the sign-in flow. A browser window will open for you to
                authorize Cooper.
              </p>
              <div className="flex gap-2">
                <Button variant="primary" onClick={handleAuthLogin}>
                  Sign in with GitHub
                </Button>
                <Button variant="secondary" onClick={handleSkip}>
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        );

      case 'authenticating':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            {deviceCode ? (
              <>
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-copilot-text">
                    Open the link below and enter this code:
                  </p>
                  <div className="flex items-center gap-2 px-6 py-3 bg-copilot-surface border border-copilot-border rounded-lg">
                    <span className="text-2xl font-mono font-bold text-copilot-text tracking-widest select-all">
                      {deviceCode}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(deviceCode!);
                        setCodeCopied(true);
                        setTimeout(() => setCodeCopied(false), 2000);
                      }}
                      className="p-1 rounded hover:bg-copilot-border/50 text-copilot-text-muted hover:text-copilot-text transition-colors"
                      title="Copy code"
                    >
                      {codeCopied ? (
                        <CheckIcon size={16} className="text-green-500" />
                      ) : (
                        <CopyIcon size={16} />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={handleOpenDeviceUrl}
                    className="text-sm text-blue-400 hover:text-blue-300 underline cursor-pointer"
                  >
                    {deviceUrl}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Spinner size="sm" />
                  <p className="text-xs text-copilot-text-muted">Waiting for authorization...</p>
                </div>
              </>
            ) : (
              <>
                <Spinner size="lg" />
                <p className="text-sm text-copilot-text-muted">Starting sign-in flow...</p>
              </>
            )}
          </div>
        );

      case 'auth-failed':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded">
              <WarningIcon size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-copilot-text font-medium">Authentication failed</p>
                <p className="text-xs text-copilot-text-muted mt-1">
                  {error || 'Please try again'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="primary" onClick={handleAuthLogin}>
                Try Again
              </Button>
              <Button variant="secondary" onClick={handleSkip}>
                Skip for now
              </Button>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckIcon size={24} className="text-green-500" />
            </div>
            <p className="text-sm text-copilot-text font-medium">Setup complete!</p>
            <p className="text-xs text-copilot-text-muted">You're ready to use Cooper.</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={state === 'complete' ? onComplete : () => {}}
      title="Copilot CLI Setup"
      width="500px"
      showCloseButton={false}
    >
      <Modal.Body>{renderContent()}</Modal.Body>
    </Modal>
  );
};
