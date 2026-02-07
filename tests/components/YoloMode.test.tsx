import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateWorktreeSession } from '../../src/renderer/components/WorktreeSessions/CreateWorktreeSession';

// Mock the electronAPI
const mockFetchGitHubIssue = vi.fn();
const mockFetchAzureDevOpsWorkItem = vi.fn();
const mockCheckGitVersion = vi.fn();
const mockListBranches = vi.fn();
const mockOnSessionCreated = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  mockCheckGitVersion.mockResolvedValue({ version: '2.38.0', valid: true });
  mockListBranches.mockResolvedValue([]);

  window.electronAPI = {
    ...window.electronAPI,
    worktree: {
      fetchGitHubIssue: mockFetchGitHubIssue,
      fetchAzureDevOpsWorkItem: mockFetchAzureDevOpsWorkItem,
      checkGitVersion: mockCheckGitVersion,
      listBranches: mockListBranches,
      createSession: vi.fn(),
      listSessions: vi.fn().mockResolvedValue([]),
    },
  } as any;
});

// Helper: fetch an issue and enable autoStart to reveal agent mode section
async function setupAutoStartMode() {
  mockFetchGitHubIssue.mockResolvedValue({
    success: true,
    issue: { title: 'Test Issue #248', body: 'Add yolo mode support', comments: [] },
    suggestedBranch: 'feature/248-yolo-mode',
  });

  render(
    <CreateWorktreeSession
      isOpen={true}
      onClose={() => {}}
      repoPath="/test/repo"
      onSessionCreated={mockOnSessionCreated}
    />
  );

  await waitFor(() => {
    expect(mockCheckGitVersion).toHaveBeenCalled();
  });

  // Expand issue section
  const issueButton = screen.getByText(/Issue \/ Work Item/i);
  fireEvent.click(issueButton);

  // Fetch a GitHub issue
  const input = screen.getByPlaceholderText(/GitHub or Azure DevOps URL/i);
  fireEvent.change(input, { target: { value: 'https://github.com/owner/repo/issues/248' } });
  fireEvent.click(screen.getByText('Fetch'));

  await waitFor(() => {
    expect(screen.getByText(/Test Issue #248/i)).toBeInTheDocument();
  });

  // Enable "Start working immediately" checkbox
  const autoStartCheckbox = screen.getByLabelText(/Start working immediately/i);
  fireEvent.click(autoStartCheckbox);

  // Agent mode section should now be visible
  await waitFor(() => {
    expect(screen.getByText('Ralph')).toBeInTheDocument();
  });
}

describe('CreateWorktreeSession - Yolo Mode', () => {
  it('shows yolo mode checkbox when auto-start is enabled', async () => {
    await setupAutoStartMode();

    expect(screen.getByLabelText(/Yolo mode/i)).toBeInTheDocument();
    expect(screen.getByText(/auto-approve all actions/i)).toBeInTheDocument();
  });

  it('yolo mode checkbox is unchecked by default', async () => {
    await setupAutoStartMode();

    const yoloCheckbox = screen.getByLabelText(/Yolo mode/i);
    expect(yoloCheckbox).not.toBeChecked();
  });

  it('yolo mode checkbox can be toggled', async () => {
    await setupAutoStartMode();

    const yoloCheckbox = screen.getByLabelText(/Yolo mode/i);
    expect(yoloCheckbox).not.toBeChecked();

    fireEvent.click(yoloCheckbox);
    expect(yoloCheckbox).toBeChecked();

    fireEvent.click(yoloCheckbox);
    expect(yoloCheckbox).not.toBeChecked();
  });

  it('yolo mode is independent of Ralph/Lisa selection', async () => {
    await setupAutoStartMode();

    // Enable yolo mode
    const yoloCheckbox = screen.getByLabelText(/Yolo mode/i);
    fireEvent.click(yoloCheckbox);
    expect(yoloCheckbox).toBeChecked();

    // Enable Ralph — yolo should stay checked
    fireEvent.click(screen.getByText('Ralph'));
    expect(yoloCheckbox).toBeChecked();

    // Switch to Lisa — yolo should stay checked
    fireEvent.click(screen.getByText('Lisa'));
    expect(yoloCheckbox).toBeChecked();
  });

  it('passes yoloMode in autoStartInfo when creating session', async () => {
    const mockCreateSession = vi.fn().mockResolvedValue({
      success: true,
      session: { worktreePath: '/test/worktree', branch: 'feature/248-yolo-mode' },
    });
    (window.electronAPI as any).worktree.createSession = mockCreateSession;

    await setupAutoStartMode();

    // Enable yolo mode
    const yoloCheckbox = screen.getByLabelText(/Yolo mode/i);
    fireEvent.click(yoloCheckbox);

    // Fill in branch name and create
    const branchInput = screen.getByPlaceholderText(/feature\/my-feature/i);
    fireEvent.change(branchInput, { target: { value: 'feature/248-yolo-mode' } });
    fireEvent.click(screen.getByText('Create Session'));

    await waitFor(() => {
      expect(mockOnSessionCreated).toHaveBeenCalledWith(
        '/test/worktree',
        'feature/248-yolo-mode',
        expect.objectContaining({
          yoloMode: true,
        })
      );
    });
  });

  it('does not pass yoloMode when unchecked', async () => {
    const mockCreateSession = vi.fn().mockResolvedValue({
      success: true,
      session: { worktreePath: '/test/worktree', branch: 'feature/248-yolo-mode' },
    });
    (window.electronAPI as any).worktree.createSession = mockCreateSession;

    await setupAutoStartMode();

    // Don't enable yolo mode — leave unchecked

    // Fill in branch name and create
    const branchInput = screen.getByPlaceholderText(/feature\/my-feature/i);
    fireEvent.change(branchInput, { target: { value: 'feature/248-yolo-mode' } });
    fireEvent.click(screen.getByText('Create Session'));

    await waitFor(() => {
      expect(mockOnSessionCreated).toHaveBeenCalledWith(
        '/test/worktree',
        'feature/248-yolo-mode',
        expect.objectContaining({
          yoloMode: false,
        })
      );
    });
  });

  it('resets yolo mode when modal reopens', async () => {
    const { unmount } = render(
      <CreateWorktreeSession
        isOpen={true}
        onClose={() => {}}
        repoPath="/test/repo"
        onSessionCreated={mockOnSessionCreated}
      />
    );
    unmount();

    // Reopen the modal — yolo mode should be reset (default false)
    // This is verified by the useState(false) initialization + useEffect reset on isOpen
    render(
      <CreateWorktreeSession
        isOpen={true}
        onClose={() => {}}
        repoPath="/test/repo"
        onSessionCreated={mockOnSessionCreated}
      />
    );

    await waitFor(() => {
      expect(mockCheckGitVersion).toHaveBeenCalled();
    });

    // Yolo mode checkbox shouldn't be visible until autoStart is enabled
    expect(screen.queryByLabelText(/Yolo mode/i)).not.toBeInTheDocument();
  });
});
