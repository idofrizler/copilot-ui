import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Spinner } from '../Spinner';

type UpdateStage = 'idle' | 'checking' | 'pulling' | 'installing' | 'building' | 'ready' | 'error';

export interface UpdateAvailableModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
  newVersion: string;
  onDontRemind: () => void;
}

export const UpdateAvailableModal: React.FC<UpdateAvailableModalProps> = ({
  isOpen,
  onClose,
  currentVersion,
  newVersion,
  onDontRemind,
}) => {
  const [canAutoUpdate, setCanAutoUpdate] = useState<boolean | null>(null);
  const [updateStage, setUpdateStage] = useState<UpdateStage>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if auto-update is available when modal opens
  useEffect(() => {
    if (isOpen && canAutoUpdate === null) {
      window.electronAPI.updates.canAutoUpdate().then((result) => {
        setCanAutoUpdate(result.canAutoUpdate);
      });
    }
  }, [isOpen, canAutoUpdate]);

  const handleDontRemind = () => {
    onDontRemind();
    onClose();
  };

  const handleUpdate = async () => {
    if (!canAutoUpdate) {
      // Fallback: open GitHub releases page
      window.electronAPI.updates.openDownloadUrl(
        `https://github.com/idofrizler/copilot-ui/releases`
      );
      return;
    }

    setUpdateStage('pulling');
    setErrorMessage(null);

    try {
      const result = await window.electronAPI.updates.performUpdate();

      if (result.success) {
        if (result.needsRestart) {
          setUpdateStage('ready');
        } else {
          // Already up to date
          onClose();
        }
      } else {
        setUpdateStage('error');
        setErrorMessage(result.error || 'Update failed');
      }
    } catch (error) {
      setUpdateStage('error');
      setErrorMessage(String(error));
    }
  };

  const handleRestart = () => {
    window.electronAPI.updates.restartApp();
  };

  const getStageText = () => {
    switch (updateStage) {
      case 'pulling':
        return 'Pulling latest changes...';
      case 'installing':
        return 'Installing dependencies...';
      case 'building':
        return 'Building application...';
      case 'ready':
        return 'Update complete!';
      case 'error':
        return 'Update failed';
      default:
        return '';
    }
  };

  const isUpdating = ['pulling', 'installing', 'building'].includes(updateStage);

  return (
    <Modal
      isOpen={isOpen}
      onClose={isUpdating ? undefined : onClose}
      title="Update Available"
      width="400px"
      testId="update-available-modal"
      showCloseButton={!isUpdating}
    >
      <Modal.Body data-clarity-mask="true">
        <div className="space-y-4">
          {updateStage === 'idle' && (
            <>
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </div>
              </div>

              <p className="text-copilot-text text-center">
                A new version of <span className="font-semibold">Copilot Skins</span> is available!
              </p>

              <div className="bg-copilot-background rounded-lg p-3 text-center">
                <div className="text-copilot-text-muted text-xs mb-1">Version</div>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-copilot-text-muted">{currentVersion}</span>
                  <span className="text-copilot-text-muted">→</span>
                  <span className="text-green-500 font-semibold">{newVersion}</span>
                </div>
              </div>

              <p className="text-copilot-text-muted text-xs text-center">
                {canAutoUpdate
                  ? 'Click Update to automatically pull, build, and restart with the new version.'
                  : 'Click Update to view the latest release on GitHub.'}
              </p>
            </>
          )}

          {isUpdating && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Spinner size="lg" />
              <p className="text-copilot-text text-sm">{getStageText()}</p>
              <p className="text-copilot-text-muted text-xs">This may take a minute...</p>
            </div>
          )}

          {updateStage === 'ready' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-copilot-text text-center">
                Update complete! Restart to use{' '}
                <span className="font-semibold text-green-500">v{newVersion}</span>
              </p>
            </div>
          )}

          {updateStage === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="text-copilot-text text-center">Update failed</p>
              <p className="text-copilot-text-muted text-xs text-center max-w-[300px] break-words">
                {errorMessage}
              </p>
              <p className="text-copilot-text-muted text-xs text-center">
                Try running{' '}
                <code className="bg-copilot-background px-1 rounded">
                  git pull && npm install && npm run build
                </code>{' '}
                manually.
              </p>
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer className="p-4 border-t border-copilot-border">
        <div className="flex flex-col w-full gap-2">
          {updateStage === 'idle' && (
            <>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={onClose}>
                  Later
                </Button>
                <Button variant="primary" onClick={handleUpdate}>
                  Update
                </Button>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={handleDontRemind}
                  className="text-copilot-text-muted text-xs hover:text-copilot-text transition-colors underline"
                >
                  Don't remind me about this version
                </button>
              </div>
            </>
          )}

          {updateStage === 'ready' && (
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose}>
                Later
              </Button>
              <Button variant="primary" onClick={handleRestart}>
                Restart Now
              </Button>
            </div>
          )}

          {updateStage === 'error' && (
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button variant="primary" onClick={() => setUpdateStage('idle')}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default UpdateAvailableModal;
