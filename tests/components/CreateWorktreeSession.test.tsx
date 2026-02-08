import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateWorktreeSession } from '../../src/renderer/features/sessions/CreateWorktreeSession';

// Mock the electronAPI
const mockFetchGitHubIssue = vi.fn();
const mockFetchAzureDevOpsWorkItem = vi.fn();
const mockCheckGitVersion = vi.fn();
const mockListBranches = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Mock git version to pass the check (2.38 > 2.20)
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

describe('CreateWorktreeSession', () => {
  it('renders Issue / Work Item label', async () => {
    render(
      <CreateWorktreeSession
        isOpen={true}
        onClose={() => {}}
        repoPath="/test/repo"
        onSessionCreated={() => {}}
      />
    );

    // Wait for git version check to complete
    await waitFor(() => {
      expect(mockCheckGitVersion).toHaveBeenCalled();
    });

    // The label should show "Issue / Work Item"
    expect(screen.getByText(/Issue \/ Work Item/i)).toBeInTheDocument();
  });

  it('calls fetchGitHubIssue for GitHub URLs', async () => {
    mockFetchGitHubIssue.mockResolvedValue({
      title: 'Test Issue',
      body: 'Test body',
      number: 123,
      suggestedBranchName: 'feature/test-issue-123',
    });

    render(
      <CreateWorktreeSession
        isOpen={true}
        onClose={() => {}}
        repoPath="/test/repo"
        onSessionCreated={() => {}}
      />
    );

    // Wait for component to be ready
    await waitFor(() => {
      expect(mockCheckGitVersion).toHaveBeenCalled();
    });

    // Click to expand Issue section
    const issueButton = screen.getByText(/Issue \/ Work Item/i);
    fireEvent.click(issueButton);

    // Find the input and enter a GitHub URL
    const input = screen.getByPlaceholderText(/GitHub or Azure DevOps URL/i);
    fireEvent.change(input, { target: { value: 'https://github.com/owner/repo/issues/123' } });

    // Click Fetch button
    const fetchButton = screen.getByText('Fetch');
    fireEvent.click(fetchButton);

    await waitFor(() => {
      expect(mockFetchGitHubIssue).toHaveBeenCalledWith('https://github.com/owner/repo/issues/123');
    });
  });

  it('calls fetchAzureDevOpsWorkItem for dev.azure.com URLs', async () => {
    mockFetchAzureDevOpsWorkItem.mockResolvedValue({
      title: 'Test Work Item',
      description: 'Test description',
      id: 456,
      suggestedBranchName: 'feature/test-work-item-456',
    });

    render(
      <CreateWorktreeSession
        isOpen={true}
        onClose={() => {}}
        repoPath="/test/repo"
        onSessionCreated={() => {}}
      />
    );

    await waitFor(() => {
      expect(mockCheckGitVersion).toHaveBeenCalled();
    });

    // Click to expand Issue section
    const issueButton = screen.getByText(/Issue \/ Work Item/i);
    fireEvent.click(issueButton);

    // Find the input and enter an Azure DevOps URL
    const input = screen.getByPlaceholderText(/GitHub or Azure DevOps URL/i);
    fireEvent.change(input, {
      target: { value: 'https://dev.azure.com/myorg/myproject/_workitems/edit/456' },
    });

    // Click Fetch button
    const fetchButton = screen.getByText('Fetch');
    fireEvent.click(fetchButton);

    await waitFor(() => {
      expect(mockFetchAzureDevOpsWorkItem).toHaveBeenCalledWith(
        'https://dev.azure.com/myorg/myproject/_workitems/edit/456'
      );
    });
  });

  it('calls fetchAzureDevOpsWorkItem for visualstudio.com URLs', async () => {
    mockFetchAzureDevOpsWorkItem.mockResolvedValue({
      title: 'Test Work Item',
      description: 'Test description',
      id: 789,
      suggestedBranchName: 'feature/test-work-item-789',
    });

    render(
      <CreateWorktreeSession
        isOpen={true}
        onClose={() => {}}
        repoPath="/test/repo"
        onSessionCreated={() => {}}
      />
    );

    await waitFor(() => {
      expect(mockCheckGitVersion).toHaveBeenCalled();
    });

    // Click to expand Issue section
    const issueButton = screen.getByText(/Issue \/ Work Item/i);
    fireEvent.click(issueButton);

    // Find the input and enter a visualstudio.com URL
    const input = screen.getByPlaceholderText(/GitHub or Azure DevOps URL/i);
    fireEvent.change(input, {
      target: { value: 'https://msazure.visualstudio.com/One/_workitems/edit/789' },
    });

    // Click Fetch button
    const fetchButton = screen.getByText('Fetch');
    fireEvent.click(fetchButton);

    await waitFor(() => {
      expect(mockFetchAzureDevOpsWorkItem).toHaveBeenCalledWith(
        'https://msazure.visualstudio.com/One/_workitems/edit/789'
      );
    });
  });

  it('shows error for unsupported URL format', async () => {
    render(
      <CreateWorktreeSession
        isOpen={true}
        onClose={() => {}}
        repoPath="/test/repo"
        onSessionCreated={() => {}}
      />
    );

    await waitFor(() => {
      expect(mockCheckGitVersion).toHaveBeenCalled();
    });

    // Click to expand Issue section
    const issueButton = screen.getByText(/Issue \/ Work Item/i);
    fireEvent.click(issueButton);

    // Find the input and enter an invalid URL
    const input = screen.getByPlaceholderText(/GitHub or Azure DevOps URL/i);
    fireEvent.change(input, { target: { value: 'https://invalid.com/something' } });

    // Click Fetch button
    const fetchButton = screen.getByText('Fetch');
    fireEvent.click(fetchButton);

    await waitFor(() => {
      expect(screen.getByText(/Unsupported URL format/i)).toBeInTheDocument();
    });
  });

  it('displays Azure DevOps authentication error with instructions', async () => {
    mockFetchAzureDevOpsWorkItem.mockRejectedValue(
      new Error(
        'Azure DevOps authentication required. To access private work items, please set up Azure CLI:\n' +
          '1. Install Azure CLI: https://aka.ms/installazurecli\n' +
          '2. Add DevOps extension: az extension add --name azure-devops\n' +
          '3. Login: az login'
      )
    );

    render(
      <CreateWorktreeSession
        isOpen={true}
        onClose={() => {}}
        repoPath="/test/repo"
        onSessionCreated={() => {}}
      />
    );

    await waitFor(() => {
      expect(mockCheckGitVersion).toHaveBeenCalled();
    });

    // Click to expand Issue section
    const issueButton = screen.getByText(/Issue \/ Work Item/i);
    fireEvent.click(issueButton);

    // Find the input and enter an Azure DevOps URL
    const input = screen.getByPlaceholderText(/GitHub or Azure DevOps URL/i);
    fireEvent.change(input, {
      target: { value: 'https://msazure.visualstudio.com/One/_workitems/edit/12345' },
    });

    // Click Fetch button
    const fetchButton = screen.getByText('Fetch');
    fireEvent.click(fetchButton);

    await waitFor(() => {
      expect(screen.getByText(/Azure DevOps authentication required/i)).toBeInTheDocument();
    });
  });
});
