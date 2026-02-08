import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Modal } from '../Modal';
import { Button } from '../Button';

export interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
  releaseNotes: string;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({
  isOpen,
  onClose,
  version,
  releaseNotes,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`What's New in v${version}`}
      width="550px"
      testId="release-notes-modal"
    >
      <Modal.Body className="max-h-[60vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <h4 className="text-copilot-text font-medium">Cooper v{version}</h4>
              <p className="text-copilot-text-muted text-xs">
                You've been updated to the latest version
              </p>
            </div>
          </div>

          <div className="prose prose-sm prose-invert max-w-none">
            <div className="bg-copilot-background rounded-lg p-4 text-copilot-text">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h3: ({ children }) => (
                    <h3 className="text-copilot-text font-semibold text-sm mt-4 mb-2 first:mt-0">
                      {children}
                    </h3>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside space-y-1 text-copilot-text text-sm">
                      {children}
                    </ul>
                  ),
                  li: ({ children }) => (
                    <li className="text-copilot-text-muted">
                      <span className="text-copilot-text">{children}</span>
                    </li>
                  ),
                  p: ({ children }) => (
                    <p className="text-copilot-text-muted text-sm mb-2">{children}</p>
                  ),
                  strong: ({ children }) => (
                    <strong className="text-copilot-text font-semibold">{children}</strong>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {releaseNotes || 'No release notes available for this version.'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="p-4 border-t border-copilot-border">
        <Button variant="primary" onClick={onClose}>
          Got it!
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ReleaseNotesModal;
