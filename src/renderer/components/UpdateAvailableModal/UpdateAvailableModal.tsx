import React from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';

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
  const handleDontRemind = () => {
    onDontRemind();
    onClose();
  };

  const handleOpenReleases = () => {
    window.electronAPI.updates.openDownloadUrl('https://github.com/idofrizler/cooper');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Update Available"
      width="500px"
      testId="update-available-modal"
      showCloseButton
    >
      <Modal.Body>
        <div className="space-y-4">
          <div className="flex items-center justify-center mb-2">
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
            A new version of <span className="font-semibold">Cooper</span> is available!
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
            Pull the latest version and rebuild to upgrade.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <div className="text-copilot-text-muted mb-1">macOS</div>
              <pre className="bg-copilot-background rounded p-2 overflow-auto whitespace-pre-wrap">
                {`cd cooper\ngit pull\nnpm install\nnpm run dist\nopen release/Cooper-*-arm64.dmg`}
              </pre>
            </div>
            <div>
              <div className="text-copilot-text-muted mb-1">Windows (PowerShell)</div>
              <pre className="bg-copilot-background rounded p-2 overflow-auto whitespace-pre-wrap">
                {`cd cooper\ngit pull\npwsh -NoProfile -File .\\scripts\\setup-windows.ps1\nnpm run dist:win`}
              </pre>
            </div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="p-4 border-t border-copilot-border">
        <div className="flex flex-col w-full gap-2">
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>
              Later
            </Button>
            <Button variant="primary" onClick={handleOpenReleases}>
              Open Repository
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
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default UpdateAvailableModal;
