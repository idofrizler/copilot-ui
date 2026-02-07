import React, { useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { CloseIcon, PlusIcon, UploadIcon, CheckIcon } from '../Icons/Icons';
import type { InstructionFile, EvaluationContext } from '../../types/evaluation';

const APPLYTO_DOCS_URL =
  'https://docs.github.com/en/copilot/how-tos/copilot-cli/add-custom-instructions#creating-path-specific-custom-instructions';

/** Check if content has applyTo frontmatter (---\napplyTo: ...\n---) */
function hasApplyToFrontmatter(content: string): boolean {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return false;
  return /applyTo\s*:/.test(match[1]);
}

interface ContextBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (context: EvaluationContext) => void;
  contextNumber: number;
}

export const ContextBuilderModal: React.FC<ContextBuilderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contextNumber,
}) => {
  const [files, setFiles] = useState<InstructionFile[]>([]);
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const hasGlobalFile = files.some((f) => !f.isPathSpecific);

  // For manual write: check if content has applyTo frontmatter
  const draftIsPathSpecific = hasApplyToFrontmatter(draftContent);
  // Disable add if: content is empty, OR would be global but global already exists
  const draftWouldBeGlobal = !draftIsPathSpecific;
  const addDisabled = !draftContent.trim() || (draftWouldBeGlobal && hasGlobalFile);

  const resetDraft = () => {
    setDraftName('');
    setDraftContent('');
    setShowAddForm(false);
    setUploadError(null);
  };

  const openAddForm = () => {
    if (hasGlobalFile) {
      setDraftContent('---\napplyTo: "**"\n---\n\n');
    }
    setShowAddForm(true);
  };

  const handleAddManual = () => {
    if (!draftContent.trim()) return;
    const content = draftContent.trim();
    const isPathSpecific = hasApplyToFrontmatter(content);

    // Block adding a second global file
    if (!isPathSpecific && hasGlobalFile) return;

    const name =
      draftName.trim() ||
      (isPathSpecific
        ? `instruction-${files.length + 1}.instructions.md`
        : 'copilot-instructions.md');
    const newFile: InstructionFile = {
      name,
      content,
      isPathSpecific,
    };
    setFiles((prev) => [...prev, newFile]);
    resetDraft();
  };

  const handleUploadFiles = async () => {
    setUploadError(null);
    try {
      const result = await window.electronAPI.evaluation.pickInstructionFiles();
      if (result.canceled || result.files.length === 0) return;

      const newFiles: InstructionFile[] = [];
      const globalConflicts: string[] = [];

      for (const f of result.files) {
        const isPathSpecific = hasApplyToFrontmatter(f.content);
        if (!isPathSpecific && hasGlobalFile) {
          globalConflicts.push(f.name);
        } else if (!isPathSpecific && newFiles.some((nf) => !nf.isPathSpecific)) {
          globalConflicts.push(f.name);
        } else {
          newFiles.push({ name: f.name, content: f.content, isPathSpecific });
        }
      }

      if (globalConflicts.length > 0) {
        setUploadError(
          `Skipped ${globalConflicts.join(', ')} — only one global instruction file per context. ` +
            `Files without applyTo frontmatter are treated as global. ` +
            `Add an applyTo header to make them path-specific.`
        );
      }

      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('Failed to pick instruction files:', error);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadError(null);
  };

  const handleSave = () => {
    onSave({
      id: `context-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: `Context ${contextNumber}`,
      files,
      overrideExisting,
    });
    setFiles([]);
    setOverrideExisting(false);
    resetDraft();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !addDisabled) {
      handleAddManual();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`New Context (Context ${contextNumber})`}
      width="550px"
    >
      <div className="max-h-[70vh] overflow-y-auto">
        <Modal.Body>
          {/* Override option */}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overrideExisting}
                onChange={(e) => setOverrideExisting(e.target.checked)}
                className="w-4 h-4 accent-copilot-accent"
              />
              <span className="text-sm text-copilot-text">
                Override all existing repo instruction files
              </span>
            </label>
            <p className="text-xs text-copilot-text-muted mt-1 ml-6">
              Removes .github/copilot-instructions.md, AGENTS.md, CLAUDE.md, GEMINI.md, and
              .github/instructions/ from the worktree before writing these files.
            </p>
          </div>

          {/* Added files list */}
          {files.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-1">
                Files ({files.length})
              </label>
              <div className="border border-copilot-border rounded bg-copilot-bg">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-3 py-2 border-b border-copilot-border last:border-b-0 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-copilot-text truncate">{file.name}</div>
                      <div className="text-xs text-copilot-text-muted">
                        {file.isPathSpecific ? 'Path-specific' : 'Global'} · {file.content.length}{' '}
                        chars
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="p-1 text-copilot-text-muted hover:text-copilot-error opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove file"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload error */}
          {uploadError && (
            <div className="mb-3 p-2 border border-amber-500/50 rounded bg-amber-500/10 text-xs text-amber-300">
              <p>{uploadError}</p>
              <a
                href={APPLYTO_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-copilot-accent hover:text-copilot-accent/80 mt-1 inline-block"
              >
                Learn about path-specific instructions →
              </a>
            </div>
          )}

          {/* Add file form */}
          {showAddForm ? (
            <div className="mb-4 border border-copilot-border rounded p-3 bg-copilot-bg">
              <div className="mb-2">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="File name (optional)"
                  className="w-full px-2 py-1.5 bg-copilot-surface border border-copilot-border rounded text-sm text-copilot-text placeholder:text-copilot-text-muted focus:outline-none focus:border-copilot-accent"
                />
              </div>
              <div className="mb-2">
                <textarea
                  value={draftContent}
                  onChange={(e) => {
                    setDraftContent(e.target.value);
                    setUploadError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    hasGlobalFile
                      ? 'Enter instruction content...\nTip: Start with ---\\napplyTo: "**/*.ts"\\n--- for path-specific'
                      : 'Enter instruction content (markdown)...'
                  }
                  className="w-full px-2 py-1.5 bg-copilot-surface border border-copilot-border rounded text-sm text-copilot-text placeholder:text-copilot-text-muted focus:outline-none focus:border-copilot-accent resize-y min-h-[100px] font-mono text-xs"
                  rows={6}
                  autoFocus
                />
              </div>
              {/* Status line showing detected type */}
              <div className="mb-2 text-xs">
                {draftContent.trim() && (
                  <>
                    <span
                      className={
                        draftIsPathSpecific
                          ? 'text-copilot-text-muted'
                          : hasGlobalFile
                            ? 'text-amber-400'
                            : 'text-copilot-text-muted'
                      }
                    >
                      {draftIsPathSpecific
                        ? '✓ Detected applyTo frontmatter — will add as path-specific'
                        : hasGlobalFile
                          ? '⚠ Missing applyTo frontmatter — a global file already exists in this context'
                          : '○ No applyTo frontmatter — will add as global instruction file'}
                    </span>
                    {draftWouldBeGlobal && hasGlobalFile && (
                      <a
                        href={APPLYTO_DOCS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-copilot-accent hover:text-copilot-accent/80 ml-1"
                      >
                        Learn more →
                      </a>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={resetDraft}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleAddManual} disabled={addDisabled}>
                  <CheckIcon size={14} /> Add File
                </Button>
              </div>
              <p className="text-xs text-copilot-text-muted mt-1">Ctrl+Enter to add.</p>
            </div>
          ) : (
            <div className="mb-4">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={openAddForm}>
                  <PlusIcon size={14} /> Write File
                </Button>
                <Button variant="secondary" onClick={handleUploadFiles}>
                  <UploadIcon size={14} /> Upload Files
                </Button>
              </div>
              <p className="text-xs text-copilot-text-muted mt-1">
                Files with <code className="bg-copilot-surface px-1 rounded">applyTo</code>{' '}
                frontmatter are path-specific; without it they are global (one per context).{' '}
                <a
                  href={APPLYTO_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-copilot-accent hover:text-copilot-accent/80"
                >
                  More info →
                </a>
              </p>
            </div>
          )}
        </Modal.Body>
      </div>
      <Modal.Body className="pt-0">
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={files.length === 0}>
            Save Context ({files.length} file{files.length !== 1 ? 's' : ''})
          </Button>
        </Modal.Footer>
      </Modal.Body>
    </Modal>
  );
};

export default ContextBuilderModal;
