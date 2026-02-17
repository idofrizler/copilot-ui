import { SourceIssue } from '../types';

/**
 * Parse a GitHub issue URL and extract owner, repo, and issue number.
 * Returns null if the URL is not a valid GitHub issue URL.
 */
export function parseGitHubIssueUrl(url: string): SourceIssue | null {
  const match = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match) return null;
  return {
    url,
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10),
  };
}
