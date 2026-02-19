import { describe, it, expect } from 'vitest';
import { parseGitHubIssueUrl } from './parseGitHubIssueUrl';

describe('parseGitHubIssueUrl', () => {
  describe('valid GitHub issue URLs', () => {
    it('should parse standard HTTPS GitHub issue URL', () => {
      const result = parseGitHubIssueUrl('https://github.com/CooperAgent/cooper/issues/403');
      expect(result).toEqual({
        url: 'https://github.com/CooperAgent/cooper/issues/403',
        owner: 'CooperAgent',
        repo: 'cooper',
        number: 403,
      });
    });

    it('should parse HTTP GitHub issue URL', () => {
      const result = parseGitHubIssueUrl('http://github.com/owner/repo/issues/123');
      expect(result).toEqual({
        url: 'http://github.com/owner/repo/issues/123',
        owner: 'owner',
        repo: 'repo',
        number: 123,
      });
    });

    it('should parse URL without protocol', () => {
      const result = parseGitHubIssueUrl('github.com/owner/repo/issues/456');
      expect(result).toEqual({
        url: 'github.com/owner/repo/issues/456',
        owner: 'owner',
        repo: 'repo',
        number: 456,
      });
    });

    it('should handle repos with dashes and underscores', () => {
      const result = parseGitHubIssueUrl('https://github.com/my-org/my_repo-name/issues/789');
      expect(result).toEqual({
        url: 'https://github.com/my-org/my_repo-name/issues/789',
        owner: 'my-org',
        repo: 'my_repo-name',
        number: 789,
      });
    });

    it('should handle large issue numbers', () => {
      const result = parseGitHubIssueUrl('https://github.com/microsoft/vscode/issues/123456');
      expect(result).toEqual({
        url: 'https://github.com/microsoft/vscode/issues/123456',
        owner: 'microsoft',
        repo: 'vscode',
        number: 123456,
      });
    });

    it('should handle URL with trailing content (query params, anchors)', () => {
      // The regex captures up to the issue number, so trailing content is preserved in URL
      const result = parseGitHubIssueUrl(
        'https://github.com/owner/repo/issues/42#issuecomment-123'
      );
      expect(result).toEqual({
        url: 'https://github.com/owner/repo/issues/42#issuecomment-123',
        owner: 'owner',
        repo: 'repo',
        number: 42,
      });
    });
  });

  describe('invalid URLs', () => {
    it('should return null for non-GitHub URLs', () => {
      expect(parseGitHubIssueUrl('https://gitlab.com/owner/repo/issues/123')).toBeNull();
      expect(parseGitHubIssueUrl('https://bitbucket.org/owner/repo/issues/123')).toBeNull();
    });

    it('should return null for GitHub URLs without issue path', () => {
      expect(parseGitHubIssueUrl('https://github.com/owner/repo')).toBeNull();
      expect(parseGitHubIssueUrl('https://github.com/owner/repo/pulls/123')).toBeNull();
      expect(parseGitHubIssueUrl('https://github.com/owner/repo/discussions/123')).toBeNull();
    });

    it('should return null for malformed issue URLs', () => {
      expect(parseGitHubIssueUrl('https://github.com/owner/issues/123')).toBeNull();
      expect(parseGitHubIssueUrl('https://github.com/owner/repo/issues/')).toBeNull();
      expect(parseGitHubIssueUrl('https://github.com/owner/repo/issues/abc')).toBeNull();
    });

    it('should return null for empty or invalid strings', () => {
      expect(parseGitHubIssueUrl('')).toBeNull();
      expect(parseGitHubIssueUrl('not a url')).toBeNull();
      expect(parseGitHubIssueUrl('github.com')).toBeNull();
    });
  });
});
