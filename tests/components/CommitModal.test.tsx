import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommitModal } from '../../src/renderer/features/git/CommitModal';

describe('CommitModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies commit error into message when copy button is clicked', async () => {
    const user = userEvent.setup();
    const onCopyErrorToMessage = vi.fn();

    render(
      <CommitModal
        showCommitModal={true}
        activeTab={{
          id: 'tab-1',
          name: 'Test Tab',
          messages: [],
          model: 'gpt-4',
          cwd: 'C:\\repo',
          isProcessing: false,
          activeTools: [],
          hasUnreadCompletion: false,
          pendingConfirmations: [],
          needsTitle: false,
          alwaysAllowed: [],
          editedFiles: ['C:\\repo\\file.ts'],
          untrackedFiles: [],
          fileViewMode: 'flat',
          currentIntent: null,
          currentIntentTimestamp: null,
          gitBranchRefresh: 0,
        }}
        commitMessage="Update"
        isCommitting={false}
        commitError="Merge failed"
        commitAction="merge"
        removeWorktreeAfterMerge={false}
        isGeneratingMessage={false}
        mainAheadInfo={null}
        isMergingMain={false}
        conflictedFiles={[]}
        targetBranch="main"
        availableBranches={['main']}
        isLoadingBranches={false}
        pendingMergeInfo={null}
        onClose={() => {}}
        onCommitMessageChange={() => {}}
        onCommitActionChange={() => {}}
        onRemoveWorktreeChange={() => {}}
        onCommitAndPush={() => {}}
        onMergeMainIntoBranch={() => {}}
        onTargetBranchSelect={() => {}}
        onFilePreview={() => {}}
        onUntrackFile={() => {}}
        onRestoreFile={() => {}}
        onCopyErrorToMessage={onCopyErrorToMessage}
        onDismissPendingMerge={() => {}}
        onMergeNow={() => {}}
      />
    );

    const copyButton = screen.getByRole('button', { name: /copy error to message/i });
    await user.click(copyButton);

    expect(onCopyErrorToMessage).toHaveBeenCalledWith(
      'I hit an error while trying to commit and merge (target: main).\n\nMerge failed'
    );
  });
});
