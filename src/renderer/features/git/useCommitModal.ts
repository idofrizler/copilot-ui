import { useState, useCallback } from 'react';
import { TabState } from '../../types';
import { getCleanEditedFiles } from './getCleanEditedFiles';

export interface MainAheadInfo {
  isAhead: boolean;
  commits: string[];
  targetBranch?: string;
}

export interface PendingMergeInfo {
  incomingFiles: string[];
  targetBranch: string;
}

export type CommitAction = 'push' | 'merge' | 'pr';

export interface UseCommitModalReturn {
  // Modal visibility
  showCommitModal: boolean;
  setShowCommitModal: React.Dispatch<React.SetStateAction<boolean>>;

  // Commit state
  commitMessage: string;
  setCommitMessage: React.Dispatch<React.SetStateAction<string>>;
  isCommitting: boolean;
  commitError: string | null;
  setCommitError: React.Dispatch<React.SetStateAction<string | null>>;
  commitAction: CommitAction;
  setCommitAction: React.Dispatch<React.SetStateAction<CommitAction>>;
  removeWorktreeAfterMerge: boolean;
  setRemoveWorktreeAfterMerge: React.Dispatch<React.SetStateAction<boolean>>;
  isGeneratingMessage: boolean;

  // Merge info
  pendingMergeInfo: PendingMergeInfo | null;
  setPendingMergeInfo: React.Dispatch<React.SetStateAction<PendingMergeInfo | null>>;
  mainAheadInfo: MainAheadInfo | null;
  setMainAheadInfo: React.Dispatch<React.SetStateAction<MainAheadInfo | null>>;
  isMergingMain: boolean;
  conflictedFiles: string[];
  setConflictedFiles: React.Dispatch<React.SetStateAction<string[]>>;

  // Target branch
  targetBranch: string | null;
  setTargetBranch: React.Dispatch<React.SetStateAction<string | null>>;
  availableBranches: string[];
  isLoadingBranches: boolean;

  // Handlers
  handleOpenCommitModal: (
    activeTab: TabState,
    updateTab: (tabId: string, updates: Partial<TabState>) => void
  ) => Promise<void>;
  handleCommitAndPush: (
    activeTab: TabState,
    updateTab: (tabId: string, updates: Partial<TabState>) => void,
    handleCloseTab: (tabId: string) => void
  ) => Promise<void>;
  handleMergeMainIntoBranch: (
    activeTab: TabState,
    updateTab: (tabId: string, updates: Partial<TabState>) => void
  ) => Promise<void>;
  handleMergeNow: (
    activeTab: TabState,
    updateTab: (tabId: string, updates: Partial<TabState>) => void,
    handleCloseTab: (tabId: string) => void
  ) => Promise<void>;
  handleTargetBranchSelect: (activeTab: TabState, branch: string) => Promise<void>;
  closeCommitModal: () => void;
}

export function useCommitModal(options?: {
  onAutoResolveConflicts?: (files: string[]) => void;
}): UseCommitModalReturn {
  const onAutoResolveConflicts = options?.onAutoResolveConflicts;
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitAction, setCommitAction] = useState<CommitAction>('push');
  const [removeWorktreeAfterMerge, setRemoveWorktreeAfterMerge] = useState(false);
  const [pendingMergeInfo, setPendingMergeInfo] = useState<PendingMergeInfo | null>(null);
  const [mainAheadInfo, setMainAheadInfo] = useState<MainAheadInfo | null>(null);
  const [isMergingMain, setIsMergingMain] = useState(false);
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([]);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  // Target branch selection state
  const [targetBranch, setTargetBranch] = useState<string | null>(null);
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  const closeCommitModal = useCallback(() => {
    setShowCommitModal(false);
    setMainAheadInfo(null);
    setConflictedFiles([]);
  }, []);

  const handleOpenCommitModal = useCallback(
    async (activeTab: TabState, updateTab: (tabId: string, updates: Partial<TabState>) => void) => {
      setCommitError(null);
      setIsCommitting(false);
      setCommitMessage('Checking files...');
      setIsGeneratingMessage(true);
      setMainAheadInfo(null);
      setShowCommitModal(true);
      setIsLoadingBranches(true);

      try {
        // Load branches and persisted target branch in parallel with other checks
        const branchesPromise = window.electronAPI.git.listBranches(activeTab.cwd);
        const savedTargetBranchPromise = window.electronAPI.settings.getTargetBranch(activeTab.cwd);

        // Get ALL changed files in the repo, not just the ones we tracked
        const changedResult = await window.electronAPI.git.getChangedFiles(
          activeTab.cwd,
          activeTab.editedFiles,
          true // includeAll: get all changed files, including package-lock.json etc.
        );

        const actualChangedFiles = changedResult.success
          ? changedResult.files
          : activeTab.editedFiles;

        // Update the tab's editedFiles list with all changed files
        if (changedResult.success) {
          updateTab(activeTab.id, { editedFiles: actualChangedFiles });
        }

        // Load branches
        try {
          const branchesResult = await branchesPromise;
          if (branchesResult.success) {
            setAvailableBranches(branchesResult.branches);
          }
        } catch {
          // Ignore branch loading errors
        }
        setIsLoadingBranches(false);

        // Load persisted target branch first, then check if it's ahead
        let effectiveTargetBranch = 'main';
        try {
          const savedTargetResult = await savedTargetBranchPromise;
          if (savedTargetResult.success && savedTargetResult.targetBranch) {
            effectiveTargetBranch = savedTargetResult.targetBranch;
            setTargetBranch(savedTargetResult.targetBranch);
          } else {
            setTargetBranch('main');
          }
        } catch {
          setTargetBranch('main');
        }

        // Now check if target branch is ahead using the persisted target branch
        const checkTargetAhead = async () => {
          try {
            const mainAheadResult = await window.electronAPI.git.checkMainAhead(
              activeTab.cwd,
              effectiveTargetBranch
            );
            if (mainAheadResult.success && mainAheadResult.isAhead) {
              setMainAheadInfo({
                isAhead: true,
                commits: mainAheadResult.commits,
                targetBranch: effectiveTargetBranch,
              });
            }
          } catch {
            // Ignore errors checking target branch ahead
          }
        };

        // If no files have changes, allow merge/PR without commit
        if (actualChangedFiles.length === 0) {
          setCommitMessage('');
          setIsGeneratingMessage(false);
          // Default to merge when no files, since "push" alone doesn't make sense
          setCommitAction((prev) => (prev === 'push' ? 'merge' : prev));
          await checkTargetAhead();
          return;
        }

        // Get diff for actual changed files
        setCommitMessage('Generating commit message...');
        const diffResult = await window.electronAPI.git.getDiff(activeTab.cwd, actualChangedFiles);
        if (diffResult.success && diffResult.diff) {
          // Generate AI commit message from diff
          const message = await window.electronAPI.git.generateCommitMessage(diffResult.diff);
          setCommitMessage(message);
        } else {
          // Fallback to simple message
          const fileNames = actualChangedFiles.map((f) => f.split(/[/\\]/).pop()).join(', ');
          setCommitMessage(`Update ${fileNames}`);
        }

        // Check if target branch is ahead
        await checkTargetAhead();
      } catch (error) {
        console.error('Failed to generate commit message:', error);
        const fileNames = activeTab.editedFiles.map((f) => f.split(/[/\\]/).pop()).join(', ');
        setCommitMessage(`Update ${fileNames}`);
      } finally {
        setIsGeneratingMessage(false);
      }
    },
    []
  );

  const handleCommitAndPush = useCallback(
    async (
      activeTab: TabState,
      updateTab: (tabId: string, updates: Partial<TabState>) => void,
      handleCloseTab: (tabId: string) => void
    ) => {
      // Filter out untracked files from the commit
      const filesToCommit = activeTab.editedFiles.filter(
        (f) => !(activeTab.untrackedFiles || []).includes(f)
      );
      const hasFilesToCommit = filesToCommit.length > 0;
      const effectiveTargetBranch = targetBranch || 'main';

      // Require commit message only if there are files to commit
      if (hasFilesToCommit && !commitMessage.trim()) return;

      // If no files and just "push" action, nothing to do
      if (!hasFilesToCommit && commitAction === 'push') return;

      setIsCommitting(true);
      setCommitError(null);

      try {
        // Only commit and push if there are files to commit
        if (hasFilesToCommit) {
          const result = await window.electronAPI.git.commitAndPush(
            activeTab.cwd,
            filesToCommit, // Use filtered list without stashed files
            commitMessage.trim()
          );

          if (!result.success) {
            setCommitError(result.error || 'Commit failed');
            setIsCommitting(false);
            return;
          }

          // If merge synced with main and brought in changes, notify user to test first
          if ((result as any).mainSyncedWithChanges && commitAction === 'merge') {
            setPendingMergeInfo({
              incomingFiles: (result as any).incomingFiles || [],
              targetBranch: effectiveTargetBranch,
            });
            // Clear only the committed files, keep untracked files in editedFiles
            const remainingEditedFiles = activeTab.untrackedFiles || [];
            updateTab(activeTab.id, {
              editedFiles: remainingEditedFiles,
              gitBranchRefresh: (activeTab.gitBranchRefresh || 0) + 1,
            });
            setShowCommitModal(false);
            setCommitMessage('');
            setIsCommitting(false);
            return;
          }
        }

        // Handle merge/PR actions (whether or not there was a commit)
        if (commitAction === 'pr') {
          const prResult = await window.electronAPI.git.createPullRequest(
            activeTab.cwd,
            commitMessage.split('\n')[0] || undefined,
            undefined, // draft
            effectiveTargetBranch,
            activeTab.untrackedFiles || []
          );
          if (prResult.success && prResult.prUrl) {
            window.open(prResult.prUrl, '_blank');
          } else if (!prResult.success) {
            setCommitError(prResult.error || 'Failed to create PR');
            setIsCommitting(false);
            return;
          }
        }

        // If merge was selected and removeWorktreeAfterMerge is checked, remove the worktree and close session
        const isWorktreePath = activeTab.cwd.includes('.copilot-sessions');
        if (commitAction === 'merge') {
          const mergeResult = await window.electronAPI.git.mergeToMain(
            activeTab.cwd,
            false,
            effectiveTargetBranch,
            activeTab.untrackedFiles || []
          );
          if (!mergeResult.success) {
            setCommitError(mergeResult.error || 'Merge failed');
            setIsCommitting(false);
            return;
          }

          if (removeWorktreeAfterMerge && isWorktreePath) {
            // Find the worktree session by path
            const sessionId = activeTab.cwd.split(/[/\\]/).pop() || '';
            if (sessionId) {
              await window.electronAPI.worktree.removeSession({ sessionId, force: true });
              // Close this tab
              handleCloseTab(activeTab.id);
              setShowCommitModal(false);
              setCommitMessage('');
              setCommitAction('push');
              setRemoveWorktreeAfterMerge(false);
              setIsCommitting(false);
              return;
            }
          }
        }

        // Clear only the committed files, keep untracked files in editedFiles
        const remainingEditedFiles = activeTab.untrackedFiles || [];
        updateTab(activeTab.id, {
          editedFiles: remainingEditedFiles,
          gitBranchRefresh: (activeTab.gitBranchRefresh || 0) + 1,
        });
        setShowCommitModal(false);
        setCommitMessage('');
        setCommitAction('push');
        setRemoveWorktreeAfterMerge(false);
      } catch (error) {
        setCommitError(String(error));
      } finally {
        setIsCommitting(false);
      }
    },
    [targetBranch, commitMessage, commitAction, removeWorktreeAfterMerge]
  );

  const handleMergeMainIntoBranch = useCallback(
    async (activeTab: TabState, updateTab: (tabId: string, updates: Partial<TabState>) => void) => {
      setIsMergingMain(true);
      setCommitError(null);
      try {
        const result = await window.electronAPI.git.mergeMainIntoBranch(
          activeTab.cwd,
          targetBranch || 'main'
        );
        if (!result.success) {
          setCommitError(result.error || 'Failed to merge');
          return;
        }
        // Show warning if stash pop had issues
        if (result.warning) {
          setCommitError(result.warning);
        }
        // Set conflicted files if any
        if (result.conflictedFiles && result.conflictedFiles.length > 0) {
          setConflictedFiles(result.conflictedFiles);
          // Auto-resolve: send conflicted files to chat for AI resolution
          if (onAutoResolveConflicts) {
            onAutoResolveConflicts(result.conflictedFiles);
          }
        } else {
          setConflictedFiles([]);
        }
        // Refresh the changed files list
        const changedResult = await window.electronAPI.git.getChangedFiles(
          activeTab.cwd,
          activeTab.editedFiles,
          true
        );
        if (changedResult.success) {
          updateTab(activeTab.id, { editedFiles: changedResult.files });
        }
        // Re-check if target branch is still ahead
        const mainAheadResult = await window.electronAPI.git.checkMainAhead(
          activeTab.cwd,
          targetBranch || undefined
        );
        if (mainAheadResult.success && mainAheadResult.isAhead) {
          setMainAheadInfo({
            isAhead: true,
            commits: mainAheadResult.commits,
            targetBranch: mainAheadResult.targetBranch,
          });
        } else {
          setMainAheadInfo(null);
        }
      } catch (error) {
        setCommitError(String(error));
      } finally {
        setIsMergingMain(false);
      }
    },
    [targetBranch]
  );

  const handleMergeNow = useCallback(
    async (
      activeTab: TabState,
      updateTab: (tabId: string, updates: Partial<TabState>) => void,
      handleCloseTab: (tabId: string) => void
    ) => {
      setIsCommitting(true);
      try {
        const mergeTarget = pendingMergeInfo?.targetBranch || targetBranch || 'main';
        const result = await window.electronAPI.git.mergeToMain(
          activeTab.cwd,
          removeWorktreeAfterMerge,
          mergeTarget,
          activeTab.untrackedFiles || []
        );
        if (result.success) {
          if (removeWorktreeAfterMerge && activeTab.cwd.includes('.copilot-sessions')) {
            const sessionId = activeTab.cwd.split(/[/\\]/).pop() || '';
            if (sessionId) {
              await window.electronAPI.worktree.removeSession({
                sessionId,
                force: true,
              });
              handleCloseTab(activeTab.id);
            }
          }
          updateTab(activeTab.id, {
            gitBranchRefresh: (activeTab.gitBranchRefresh || 0) + 1,
          });
        } else {
          setCommitError(result.error || 'Merge failed');
        }
      } catch (error) {
        setCommitError(String(error));
      } finally {
        setIsCommitting(false);
        setPendingMergeInfo(null);
        setCommitAction('push');
        setRemoveWorktreeAfterMerge(false);
      }
    },
    [pendingMergeInfo, targetBranch, removeWorktreeAfterMerge]
  );

  const handleTargetBranchSelect = useCallback(async (activeTab: TabState, branch: string) => {
    setTargetBranch(branch);
    // Persist the selection
    await window.electronAPI.settings.setTargetBranch(activeTab.cwd, branch);
    // Re-check if target branch is ahead
    try {
      const mainAheadResult = await window.electronAPI.git.checkMainAhead(activeTab.cwd, branch);
      if (mainAheadResult.success && mainAheadResult.isAhead) {
        setMainAheadInfo({
          isAhead: true,
          commits: mainAheadResult.commits,
          targetBranch: branch,
        });
      } else {
        setMainAheadInfo(null);
      }
    } catch {
      // Ignore errors
    }
  }, []);

  return {
    showCommitModal,
    setShowCommitModal,
    commitMessage,
    setCommitMessage,
    isCommitting,
    commitError,
    setCommitError,
    commitAction,
    setCommitAction,
    removeWorktreeAfterMerge,
    setRemoveWorktreeAfterMerge,
    isGeneratingMessage,
    pendingMergeInfo,
    setPendingMergeInfo,
    mainAheadInfo,
    setMainAheadInfo,
    isMergingMain,
    conflictedFiles,
    setConflictedFiles,
    targetBranch,
    setTargetBranch,
    availableBranches,
    isLoadingBranches,
    handleOpenCommitModal,
    handleCommitAndPush,
    handleMergeMainIntoBranch,
    handleMergeNow,
    handleTargetBranchSelect,
    closeCommitModal,
  };
}
