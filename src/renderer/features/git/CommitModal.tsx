import React from 'react';
import {
  Modal,
  Button,
  Dropdown,
  IconButton,
  CommitIcon,
  CopyIcon,
  FileIcon,
  ArchiveIcon,
  UnarchiveIcon,
  SearchableBranchSelect,
} from '../../components';
import { TabState } from '../../types';
import type { MainAheadInfo, PendingMergeInfo, CommitAction } from './useCommitModal';

interface CommitModalProps {
  // State
  showCommitModal: boolean;
  activeTab: TabState | undefined;
  commitMessage: string;
  isCommitting: boolean;
  commitError: string | null;
  commitAction: CommitAction;
  removeWorktreeAfterMerge: boolean;
  isGeneratingMessage: boolean;
  mainAheadInfo: MainAheadInfo | null;
  isMergingMain: boolean;
  conflictedFiles: string[];
  targetBranch: string | null;
  availableBranches: string[];
  isLoadingBranches: boolean;
  pendingMergeInfo: PendingMergeInfo | null;

  // Handlers
  onClose: () => void;
  onCommitMessageChange: (message: string) => void;
  onCommitActionChange: (action: CommitAction) => void;
  onRemoveWorktreeChange: (checked: boolean) => void;
  onCommitAndPush: () => void;
  onMergeMainIntoBranch: () => void;
  onTargetBranchSelect: (branch: string) => void;
  onFilePreview: (filePath: string) => void;
  onUntrackFile: (filePath: string) => void;
  onRestoreFile: (filePath: string) => void;
  onCopyErrorToMessage: (message: string) => void;

  // Incoming changes modal
  onDismissPendingMerge: () => void;
  onMergeNow: () => void;
}

export const CommitModal: React.FC<CommitModalProps> = ({
  showCommitModal,
  activeTab,
  commitMessage,
  isCommitting,
  commitError,
  commitAction,
  removeWorktreeAfterMerge,
  isGeneratingMessage,
  mainAheadInfo,
  isMergingMain,
  conflictedFiles,
  targetBranch,
  availableBranches,
  isLoadingBranches,
  pendingMergeInfo,
  onClose,
  onCommitMessageChange,
  onCommitActionChange,
  onRemoveWorktreeChange,
  onCommitAndPush,
  onMergeMainIntoBranch,
  onTargetBranchSelect,
  onFilePreview,
  onUntrackFile,
  onRestoreFile,
  onCopyErrorToMessage,
  onDismissPendingMerge,
  onMergeNow,
}) => {
  return (
    <>
      {/* Commit Modal */}
      <Modal
        isOpen={showCommitModal && !!activeTab}
        onClose={onClose}
        title="Commit & Push Changes"
      >
        <Modal.Body>
          {activeTab &&
            (() => {
              // Compute files to commit (excluding untracked files)
              const filesToCommit = activeTab.editedFiles.filter(
                (f) => !(activeTab.untrackedFiles || []).includes(f)
              );
              const untrackedFilesList = (activeTab.untrackedFiles || []).filter((f) =>
                activeTab.editedFiles.includes(f)
              );
              const hasFilesToCommit = filesToCommit.length > 0;
              const buildErrorMessage = (error: string) => {
                const actionDescription = (() => {
                  if (hasFilesToCommit) {
                    if (commitAction === 'pr') return 'commit and create a PR';
                    if (commitAction === 'merge') return 'commit and merge';
                    return 'commit and push';
                  }
                  if (commitAction === 'pr') return 'create a PR';
                  if (commitAction === 'merge') return 'merge';
                  return 'push';
                })();
                const targetSuffix =
                  commitAction === 'push' ? '' : targetBranch ? ` (target: ${targetBranch})` : '';
                return `I hit an error while trying to ${actionDescription}${targetSuffix}.\n\n${error}`;
              };

              return (
                <>
                  {/* Files to commit */}
                  <div className="mb-3">
                    {hasFilesToCommit ? (
                      <>
                        <div className="text-xs text-copilot-text-muted mb-2">
                          Files to commit ({filesToCommit.length}):
                        </div>
                        <div className="bg-copilot-bg rounded border border-copilot-surface max-h-32 overflow-y-auto">
                          {filesToCommit.map((filePath) => {
                            const fileName = filePath.split(/[/\\]/).pop() || '';
                            const isConflicted = conflictedFiles.some(
                              (cf) => filePath.endsWith(cf) || cf.endsWith(fileName)
                            );
                            return (
                              <div
                                key={filePath}
                                className={`group flex items-center gap-2 px-3 py-1.5 text-xs font-mono hover:bg-copilot-surface transition-colors ${isConflicted ? 'text-copilot-error' : 'text-copilot-success'}`}
                              >
                                <button
                                  onClick={() => onFilePreview(filePath)}
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                  title={
                                    isConflicted
                                      ? `${filePath} (conflict) - Click to preview diff`
                                      : `${filePath} - Click to preview diff`
                                  }
                                >
                                  <FileIcon
                                    size={10}
                                    className={`shrink-0 ${isConflicted ? 'text-copilot-error' : 'text-copilot-success'}`}
                                  />
                                  <span className="truncate">{filePath}</span>
                                  {isConflicted && (
                                    <span className="text-[10px] text-copilot-error">!</span>
                                  )}
                                </button>
                                <button
                                  onClick={() => onUntrackFile(filePath)}
                                  className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text transition-all"
                                  title="Untrack file (exclude from commit)"
                                >
                                  <ArchiveIcon size={10} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-copilot-text-muted italic">
                        No files to commit. You can still merge or create a PR for already committed
                        changes.
                      </div>
                    )}

                    {/* Untracked files section */}
                    {untrackedFilesList.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs text-copilot-text-muted mb-2 flex items-center gap-1">
                          <ArchiveIcon size={10} />
                          Untracked files ({untrackedFilesList.length}) - not included in commit:
                        </div>
                        <div className="bg-copilot-bg/50 rounded border border-copilot-surface/50 max-h-24 overflow-y-auto">
                          {untrackedFilesList.map((filePath) => (
                            <div
                              key={filePath}
                              className="group flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-copilot-text-muted/50"
                            >
                              <FileIcon size={10} className="shrink-0" />
                              <span className="truncate line-through">{filePath}</span>
                              <button
                                onClick={() => onRestoreFile(filePath)}
                                className="ml-auto shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text transition-all"
                                title="Restore file (include in commit)"
                              >
                                <UnarchiveIcon size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Warning if origin/main is ahead */}
                  {mainAheadInfo?.isAhead && (
                    <div className="mb-3 bg-copilot-warning/10 border border-copilot-warning/30 rounded p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-copilot-warning text-sm">⚠️</span>
                        <div className="flex-1">
                          <div className="text-xs text-copilot-warning font-medium mb-1">
                            origin/{mainAheadInfo.targetBranch || targetBranch || 'main'} is{' '}
                            {mainAheadInfo.commits.length} commit
                            {mainAheadInfo.commits.length > 1 ? 's' : ''} ahead
                          </div>
                          <div className="text-xs text-copilot-text-muted mb-2">
                            Merge the latest changes into your branch to stay up to date.
                          </div>
                          <button
                            onClick={onMergeMainIntoBranch}
                            disabled={isMergingMain || isCommitting}
                            className="px-3 py-1 text-xs bg-copilot-warning/20 hover:bg-copilot-warning/30 text-copilot-warning border border-copilot-warning/30 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {isMergingMain ? (
                              <>
                                <span className="w-3 h-3 border border-copilot-warning/30 border-t-copilot-warning rounded-full animate-spin"></span>
                                Merging...
                              </>
                            ) : (
                              <>
                                Merge origin/
                                {mainAheadInfo.targetBranch || targetBranch || 'main'} into branch
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Commit message - only show if there are files to commit */}
                  {hasFilesToCommit && (
                    <div className="mb-3 relative">
                      <label className="text-xs text-copilot-text-muted mb-2 block">
                        Commit message:
                      </label>
                      <textarea
                        value={commitMessage}
                        onChange={(e) => onCommitMessageChange(e.target.value)}
                        className={`w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text placeholder-copilot-text-muted focus:border-copilot-accent outline-none resize-none ${isGeneratingMessage ? 'opacity-50' : ''}`}
                        rows={3}
                        placeholder="Enter commit message..."
                        autoFocus
                        disabled={isGeneratingMessage}
                      />
                      {isGeneratingMessage && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="w-4 h-4 border-2 border-copilot-accent/30 border-t-copilot-accent rounded-full animate-spin"></span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Target branch selector - always visible at top */}
                  <div className="mb-4">
                    <SearchableBranchSelect
                      label="Target branch:"
                      value={targetBranch}
                      branches={availableBranches}
                      onSelect={onTargetBranchSelect}
                      isLoading={isLoadingBranches}
                      disabled={isCommitting}
                      placeholder="Select target branch..."
                    />
                  </div>

                  {/* Options */}
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-xs text-copilot-text-muted">
                      {hasFilesToCommit ? 'After push:' : 'Action:'}
                    </span>
                    <Dropdown
                      value={commitAction}
                      options={
                        hasFilesToCommit
                          ? [
                              { id: 'push' as const, label: 'Nothing' },
                              { id: 'merge' as const, label: 'Merge to target branch' },
                              { id: 'pr' as const, label: 'Create PR' },
                            ]
                          : [
                              { id: 'merge' as const, label: 'Merge to target branch' },
                              { id: 'pr' as const, label: 'Create PR' },
                            ]
                      }
                      onSelect={(id) => {
                        onCommitActionChange(id);
                        if (id !== 'merge') onRemoveWorktreeChange(false);
                      }}
                      disabled={isCommitting}
                      align="left"
                      minWidth="160px"
                    />
                  </div>

                  {/* Remove worktree option - only visible when merge is selected and in a worktree */}
                  {commitAction === 'merge' && activeTab?.cwd.includes('.copilot-sessions') && (
                    <div className="mb-4 flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-copilot-text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={removeWorktreeAfterMerge}
                          onChange={(e) => onRemoveWorktreeChange(e.target.checked)}
                          className="rounded border-copilot-border bg-copilot-bg accent-copilot-accent"
                          disabled={isCommitting}
                        />
                        Remove worktree after merge
                      </label>
                    </div>
                  )}

                  {/* Error message */}
                  {commitError && (
                    <div className="mb-3 px-3 py-2 bg-copilot-error-muted border border-copilot-error rounded text-xs text-copilot-error max-h-32 overflow-y-auto break-words whitespace-pre-wrap">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0 whitespace-pre-wrap break-words">
                          {commitError}
                        </div>
                        <IconButton
                          icon={<CopyIcon size={12} />}
                          size="xs"
                          variant="error"
                          onClick={() => onCopyErrorToMessage(buildErrorMessage(commitError))}
                          title="Copy error to message"
                          aria-label="Copy error to message"
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <Modal.Footer>
                    <Button variant="ghost" onClick={onClose} disabled={isCommitting}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={onCommitAndPush}
                      disabled={
                        (hasFilesToCommit && !commitMessage.trim()) ||
                        isCommitting ||
                        isGeneratingMessage ||
                        (!hasFilesToCommit && commitAction === 'push')
                      }
                      isLoading={isCommitting}
                      leftIcon={!isCommitting ? <CommitIcon size={12} /> : undefined}
                    >
                      {isCommitting
                        ? 'Processing...'
                        : !hasFilesToCommit
                          ? commitAction === 'pr'
                            ? 'Create PR'
                            : 'Merge'
                          : commitAction === 'pr'
                            ? 'Commit & Create PR'
                            : commitAction === 'merge'
                              ? 'Commit & Merge'
                              : 'Commit & Push'}
                    </Button>
                  </Modal.Footer>
                </>
              );
            })()}
        </Modal.Body>
      </Modal>

      {/* Incoming Changes Modal - shown when merge from target branch brought changes */}
      <Modal
        isOpen={!!pendingMergeInfo && !!activeTab}
        onClose={onDismissPendingMerge}
        title="Target Branch Had Changes"
        width="500px"
      >
        <Modal.Body>
          <div className="mb-4">
            <div className="text-sm text-copilot-text mb-2">
              Your branch has been synced with the latest changes from{' '}
              {pendingMergeInfo?.targetBranch || targetBranch || 'main'}. The following files were
              updated:
            </div>
            {pendingMergeInfo && pendingMergeInfo.incomingFiles.length > 0 ? (
              <div className="bg-copilot-bg rounded border border-copilot-surface max-h-40 overflow-y-auto">
                {pendingMergeInfo.incomingFiles.map((filePath) => (
                  <div
                    key={filePath}
                    className="px-3 py-1.5 text-xs text-copilot-warning font-mono truncate"
                    title={filePath}
                  >
                    {filePath}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-copilot-text-muted italic">
                (Unable to determine changed files)
              </div>
            )}
          </div>
          <div className="text-sm text-copilot-text-muted mb-4">
            We recommend testing your changes before completing the merge to{' '}
            {pendingMergeInfo?.targetBranch || targetBranch || 'main'}.
          </div>
          <Modal.Footer>
            <Button variant="ghost" onClick={onDismissPendingMerge}>
              Test First
            </Button>
            <Button variant="primary" onClick={onMergeNow} isLoading={isCommitting}>
              Merge Now
            </Button>
          </Modal.Footer>
        </Modal.Body>
      </Modal>
    </>
  );
};
