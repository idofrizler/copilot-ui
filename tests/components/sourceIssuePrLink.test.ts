import { describe, it, expect } from 'vitest';

/**
 * Tests for PR URL construction with source issue linking.
 * These tests verify the logic used in git:createPullRequest IPC handler.
 */

// Helper function that mirrors the logic in main.ts for constructing PR body with issue reference
function buildPrBodyWithIssueRef(
  sourceIssue: { url: string; number: number; owner: string; repo: string },
  prRepoPath: string // Format: "owner/repo"
): string {
  const [prOwner, prRepo] = prRepoPath.split('/');
  const isSameRepo =
    prOwner.toLowerCase() === sourceIssue.owner.toLowerCase() &&
    prRepo.toLowerCase() === sourceIssue.repo.toLowerCase();

  const issueRef = isSameRepo
    ? `#${sourceIssue.number}` // Same repo: use short reference
    : `${sourceIssue.owner}/${sourceIssue.repo}#${sourceIssue.number}`; // Different repo: use full reference

  return `Closes ${issueRef}`;
}

describe('PR URL construction with source issue', () => {
  describe('same repository', () => {
    it('should use short issue reference (#123) for same repo', () => {
      const sourceIssue = {
        url: 'https://github.com/CooperAgent/cooper/issues/403',
        number: 403,
        owner: 'CooperAgent',
        repo: 'cooper',
      };
      const prRepoPath = 'CooperAgent/cooper';

      const body = buildPrBodyWithIssueRef(sourceIssue, prRepoPath);
      expect(body).toBe('Closes #403');
    });

    it('should handle case-insensitive owner/repo matching', () => {
      const sourceIssue = {
        url: 'https://github.com/CooperAgent/Cooper/issues/123',
        number: 123,
        owner: 'CooperAgent',
        repo: 'Cooper',
      };
      const prRepoPath = 'cooperagent/cooper'; // lowercase

      const body = buildPrBodyWithIssueRef(sourceIssue, prRepoPath);
      expect(body).toBe('Closes #123');
    });
  });

  describe('cross-repository', () => {
    it('should use full reference (owner/repo#123) for different repo', () => {
      const sourceIssue = {
        url: 'https://github.com/upstream/main-repo/issues/50',
        number: 50,
        owner: 'upstream',
        repo: 'main-repo',
      };
      const prRepoPath = 'myuser/my-fork';

      const body = buildPrBodyWithIssueRef(sourceIssue, prRepoPath);
      expect(body).toBe('Closes upstream/main-repo#50');
    });

    it('should use full reference when owner differs but repo is same', () => {
      const sourceIssue = {
        url: 'https://github.com/original-org/shared-lib/issues/99',
        number: 99,
        owner: 'original-org',
        repo: 'shared-lib',
      };
      const prRepoPath = 'my-org/shared-lib';

      const body = buildPrBodyWithIssueRef(sourceIssue, prRepoPath);
      expect(body).toBe('Closes original-org/shared-lib#99');
    });

    it('should use full reference when repo differs but owner is same', () => {
      const sourceIssue = {
        url: 'https://github.com/myorg/repo-a/issues/10',
        number: 10,
        owner: 'myorg',
        repo: 'repo-a',
      };
      const prRepoPath = 'myorg/repo-b';

      const body = buildPrBodyWithIssueRef(sourceIssue, prRepoPath);
      expect(body).toBe('Closes myorg/repo-a#10');
    });
  });

  describe('URL encoding', () => {
    it('should produce URL-safe body content', () => {
      const sourceIssue = {
        url: 'https://github.com/owner/repo/issues/123',
        number: 123,
        owner: 'owner',
        repo: 'repo',
      };
      const prRepoPath = 'owner/repo';

      const body = buildPrBodyWithIssueRef(sourceIssue, prRepoPath);
      const encoded = encodeURIComponent(body);

      // Should be properly encoded for URL query params
      expect(encoded).toBe('Closes%20%23123');
    });
  });
});
