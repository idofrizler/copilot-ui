#!/usr/bin/env node
/**
 * Example: Create a complete worktree session from a GitHub issue
 *
 * Usage:
 *   node examples/create-worktree-from-issue.js <repo-path> <issue-url-or-branch>
 *
 * Examples:
 *   node examples/create-worktree-from-issue.js /path/to/repo https://github.com/user/repo/issues/123
 *   node examples/create-worktree-from-issue.js /path/to/repo feature/my-branch
 */

const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createWorktreeSession(repoPath, branchOrIssueUrl) {
  console.log('Creating worktree session...\n');

  let branch = branchOrIssueUrl;

  if (branchOrIssueUrl.includes('github.com') && branchOrIssueUrl.includes('/issues/')) {
    console.log('Fetching GitHub issue...');
    const issueResponse = await request('POST', '/ipc/worktree/fetchGitHubIssue', branchOrIssueUrl);

    if (!issueResponse.data.success) {
      console.error('Failed to fetch issue:', issueResponse.data.error);
      process.exit(1);
    }

    const issue = issueResponse.data.data;
    console.log(`   Issue #${issue.number}: ${issue.title}`);
    branch = `issue-${issue.number}`;
    console.log(`   Using branch: ${branch}\n`);
  }

  console.log('Creating git worktree...');
  const worktreeResponse = await request('POST', '/ipc/worktree/createSession', {
    repoPath,
    branch,
  });

  if (!worktreeResponse.data.success) {
    console.error('Failed to create worktree:', worktreeResponse.data.error);
    process.exit(1);
  }

  const session = worktreeResponse.data.data.session;
  console.log(`   Worktree: ${session.worktreePath}`);
  console.log(`   Session ID: ${session.id}\n`);

  console.log('Creating Copilot session...');
  const copilotResponse = await request('POST', '/ipc/copilot/createSession', {
    cwd: session.worktreePath,
  });

  if (!copilotResponse.data.success) {
    console.error('Failed to create Copilot session:', copilotResponse.data.error);
    process.exit(1);
  }

  const copilotSession = copilotResponse.data.data;
  console.log(`   Copilot Session: ${copilotSession.sessionId}`);
  console.log(`   Model: ${copilotSession.model}\n`);

  console.log('Session ready!');
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node create-worktree-from-issue.js <repo-path> <issue-url-or-branch>');
  process.exit(1);
}

createWorktreeSession(args[0], args[1]).catch(console.error);
