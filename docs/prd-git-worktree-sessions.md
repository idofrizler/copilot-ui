# PRD: Multi-Session Support via Git Worktrees

**Author:** Copilot CLI Team  
**Created:** 2026-01-23  
**Status:** Implemented  
**Version:** 1.1

---

## Implementation Summary

✅ **Core Module:** `src/main/worktree.ts` - Complete git worktree session management  
✅ **IPC Handlers:** Added to `src/main/main.ts` - All worktree operations exposed  
✅ **Preload API:** `src/preload/preload.ts` - Renderer can access worktree functions  
✅ **UI Components:** `src/renderer/components/WorktreeSessions/` - List and create modals  
✅ **Unit Tests:** `src/main/worktree.test.ts` - 5 tests covering core functionality  

### Files Added/Modified:
- `src/main/worktree.ts` (new) - Core worktree session manager
- `src/main/worktree.test.ts` (new) - Unit tests
- `src/main/main.ts` (modified) - Added IPC handlers
- `src/preload/preload.ts` (modified) - Exposed worktree API
- `src/renderer/components/WorktreeSessions/` (new) - UI components
- `src/renderer/components/index.ts` (modified) - Export new components

---

## 1. Overview

### 1.1 Problem Statement

Currently, users cannot run multiple Copilot CLI sessions on the same repository simultaneously. Attempting to do so causes:
- File lock conflicts
- Uncommitted change collisions
- Branch switching interference between sessions
- Lost work when sessions overwrite each other's changes

This limits users who want to work on multiple features/bugs in parallel or collaborate with AI on different tasks within the same codebase.

### 1.2 Proposed Solution

Leverage Git worktrees to create isolated working directories for each session. Each worktree:
- Has its own working directory, index, and HEAD
- Shares commit history, remotes, and refs with the main repository
- Is tied to a specific branch (one branch = one session)

### 1.3 Success Metrics

| Metric | Target |
|--------|--------|
| Sessions can run in parallel without conflicts | 100% |
| Session startup time (excluding npm install) | < 5 seconds |
| Disk overhead per session (excluding node_modules) | < 50MB |
| User-reported data loss incidents | 0 |

---

## 2. User Stories

### 2.1 Primary Use Cases

**US-1: Parallel Feature Development**
> As a developer, I want to start a new Copilot session on a feature branch while another session is working on a different branch, so I can context-switch between tasks without losing progress.

**US-2: Isolated Experimentation**
> As a developer, I want to experiment with a risky refactor in an isolated session, so I can easily discard it without affecting my main working directory.

**US-3: Long-Running Sessions**
> As a developer, I want to leave a session open for a multi-day feature, while still being able to do quick fixes on other branches in separate sessions.

### 2.2 Out of Scope (v1)

- Multiple sessions on the same branch (by design—branches are session identifiers)
- Automatic merge/rebase between sessions
- Session sharing between users
- Remote/cloud session persistence

---

## 3. Functional Requirements

### 3.1 Session Lifecycle

#### 3.1.1 Session Creation

| Requirement | Description |
|-------------|-------------|
| **FR-1.1** | When user starts a session specifying a branch, system SHALL create a git worktree for that branch |
| **FR-1.2** | Worktree SHALL be created at `~/.copilot-sessions/<repo-name>--<branch-name>/` |
| **FR-1.3** | If branch does not exist, system SHALL create it based on current HEAD of main/master |
| **FR-1.4** | If branch exists, system SHALL check it out in the new worktree |
| **FR-1.5** | System SHALL detect if branch is already checked out in another worktree and reject with clear error |
| **FR-1.6** | System SHALL change working directory to the new worktree |

#### 3.1.2 Session Active State

| Requirement | Description |
|-------------|-------------|
| **FR-2.1** | All file operations SHALL occur within the worktree directory |
| **FR-2.2** | Git commands SHALL operate on the worktree's branch |
| **FR-2.3** | System SHALL track session metadata (start time, repo, branch) in `~/.copilot-sessions/sessions.json` |
| **FR-2.4** | User MAY commit and push changes at any time |

#### 3.1.3 Session Termination

| Requirement | Description |
|-------------|-------------|
| **FR-3.1** | On graceful session end, system SHALL prompt user: "Commit changes? Push? Discard?" |
| **FR-3.2** | If user chooses to keep changes, system SHALL ensure changes are committed |
| **FR-3.3** | System SHALL remove worktree via `git worktree remove <path>` |
| **FR-3.4** | System SHALL update `sessions.json` to mark session as closed |
| **FR-3.5** | System SHALL NOT delete the branch (user may want to continue later) |

#### 3.1.4 Session Recovery

| Requirement | Description |
|-------------|-------------|
| **FR-4.1** | On startup, system SHALL check for orphaned worktrees (session crashed) |
| **FR-4.2** | For orphaned sessions with uncommitted changes, system SHALL prompt: "Recover session <branch>?" |
| **FR-4.3** | System SHALL provide command to list all active sessions: `copilot sessions list` |
| **FR-4.4** | System SHALL provide command to clean up stale sessions: `copilot sessions prune` |

### 3.2 Dependency Management

| Requirement | Description |
|-------------|-------------|
| **FR-5.1** | System SHALL install dependencies in the worktree if `package.json` (or equivalent) exists |
| **FR-5.2** | On macOS (APFS), system SHOULD use copy-on-write (`cp -c`) to clone `node_modules` from main repo |
| **FR-5.3** | If CoW not available, system SHALL run standard `npm install` / `yarn` / `pnpm install` |
| **FR-5.4** | System SHALL detect package manager from lockfile (package-lock.json → npm, yarn.lock → yarn, pnpm-lock.yaml → pnpm) |

### 3.3 User Interface

| Requirement | Description |
|-------------|-------------|
| **FR-6.1** | Session prompt SHALL indicate current branch and that it's a worktree session |
| **FR-6.2** | `copilot sessions list` SHALL display: branch name, repo, created date, status, disk usage |
| **FR-6.3** | `copilot sessions switch <branch>` SHALL allow switching between existing sessions |
| **FR-6.4** | Tab completion SHALL work for branch names in session commands |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Requirement | Target |
|-------------|--------|
| **NFR-1.1** | Worktree creation (excluding deps) | < 3 seconds |
| **NFR-1.2** | Worktree removal | < 1 second |
| **NFR-1.3** | Session list command | < 500ms |
| **NFR-1.4** | CoW node_modules copy (when available) | < 5 seconds |

### 4.2 Reliability

| Requirement | Description |
|-------------|-------------|
| **NFR-2.1** | System SHALL NOT lose uncommitted changes on crash—they remain in worktree |
| **NFR-2.2** | System SHALL handle git lock files gracefully (retry with backoff) |
| **NFR-2.3** | System SHALL validate worktree integrity before operations |

### 4.3 Disk Management

| Requirement | Description |
|-------------|-------------|
| **NFR-3.1** | System SHALL warn if disk space < 1GB before creating new session |
| **NFR-3.2** | `sessions prune` SHALL remove worktrees older than 30 days (configurable) |
| **NFR-3.3** | System SHALL track and display per-session disk usage |

### 4.4 Compatibility

| Requirement | Description |
|-------------|-------------|
| **NFR-4.1** | SHALL support Git 2.20+ (worktree features stabilized) |
| **NFR-4.2** | SHALL work on macOS, Linux, Windows (WSL) |
| **NFR-4.3** | SHALL support repos with submodules (submodules cloned per worktree) |
| **NFR-4.4** | SHALL work with GitHub, GitLab, Bitbucket, Azure DevOps remotes |

---

## 5. Technical Design

### 5.1 Directory Structure

```
~/.copilot-sessions/
├── sessions.json                          # Session registry
├── copilot-ui--fix-auth-bug/              # Worktree for branch 'fix-auth-bug'
│   ├── .git                               # File pointing to main repo's .git
│   ├── src/
│   ├── node_modules/
│   └── ...
├── copilot-ui--add-dark-mode/             # Another session
└── other-repo--refactor-api/              # Session for different repo
```

### 5.2 Session Registry Schema

```json
{
  "version": 1,
  "sessions": [
    {
      "id": "copilot-ui--fix-auth-bug",
      "repoPath": "/Users/dev/Git/copilot-ui",
      "branch": "fix-auth-bug",
      "worktreePath": "/Users/dev/.copilot-sessions/copilot-ui--fix-auth-bug",
      "createdAt": "2026-01-23T08:45:00Z",
      "lastAccessedAt": "2026-01-23T10:30:00Z",
      "status": "active",
      "pid": 12345
    }
  ]
}
```

### 5.3 Core Commands

| Command | Git Operation |
|---------|---------------|
| Create session | `git worktree add <path> -b <branch>` or `git worktree add <path> <existing-branch>` |
| Remove session | `git worktree remove <path>` |
| List sessions | `git worktree list` + `sessions.json` metadata |
| Prune orphans | `git worktree prune` |
| Check conflicts | `git worktree list --porcelain` (parse for branch) |

### 5.4 Dependency Optimization Flow

```
┌─────────────────────────────────────────────────────────┐
│               DEPENDENCY INSTALLATION                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Check if main repo has node_modules/                 │
│     └─ No  → Run package manager install                 │
│     └─ Yes → Continue                                    │
│                                                          │
│  2. Check if APFS (macOS) or Btrfs/XFS (Linux)          │
│     └─ No  → Run package manager install                 │
│     └─ Yes → Continue                                    │
│                                                          │
│  3. Compare package-lock.json between main & worktree    │
│     └─ Different → Run package manager install           │
│     └─ Same      → Copy with CoW                         │
│                                                          │
│  4. Execute: cp -c -r <main>/node_modules <worktree>/    │
│     └─ Failure → Fallback to package manager install     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 6. User Experience

### 6.1 Session Start Flow

```
$ copilot start --branch fix-auth-bug

Creating session for branch 'fix-auth-bug'...
  ✓ Worktree created at ~/.copilot-sessions/copilot-ui--fix-auth-bug
  ✓ Dependencies installed (CoW copy, 2.1s)
  ✓ Session ready

You are now in: copilot-ui (fix-auth-bug) [worktree]
```

### 6.2 Session List Flow

```
$ copilot sessions list

BRANCH              REPO          CREATED       STATUS    DISK
fix-auth-bug        copilot-ui    2 hours ago   active    245 MB
add-dark-mode       copilot-ui    1 day ago     idle      312 MB
refactor-api        backend       3 days ago    orphaned  189 MB

Total: 3 sessions, 746 MB
Tip: Run 'copilot sessions prune' to clean up orphaned sessions
```

### 6.3 Session End Flow

```
$ copilot end

Session: copilot-ui (fix-auth-bug)

You have uncommitted changes:
  M  src/auth/login.ts
  A  src/auth/oauth.ts

What would you like to do?
  [c] Commit and keep branch
  [p] Commit and push
  [d] Discard changes
  [a] Abort (keep session open)

> p

Commit message: Implement OAuth login flow
  ✓ Changes committed
  ✓ Pushed to origin/fix-auth-bug
  ✓ Worktree removed
  ✓ Session closed

Switched back to: /Users/dev/Git/copilot-ui (main)
```

---

## 7. Error Handling

| Scenario | Behavior |
|----------|----------|
| Branch already in use by another worktree | Error: "Branch 'X' is already checked out in session at <path>. Use `copilot sessions switch X` to switch to it." |
| Git version too old | Error: "Git 2.20+ required for worktree support. Found: 2.17. Please upgrade." |
| Disk space low | Warning: "Low disk space (450MB free). Session may fail if dependencies are large. Continue? [y/N]" |
| Worktree creation fails | Error with git output, suggest: "Try `git worktree prune` to clean up stale references." |
| Main repo has uncommitted changes when creating session | Warning: "Main repo has uncommitted changes. They will NOT be in new session. Continue? [y/N]" |

---

## 8. Configuration

Users may configure via `~/.copilot/config.json`:

```json
{
  "sessions": {
    "directory": "~/.copilot-sessions",
    "pruneAfterDays": 30,
    "autoInstallDeps": true,
    "preferCoW": true,
    "warnDiskThresholdMB": 1024
  }
}
```

---

## 9. Migration & Rollout

### 9.1 Rollout Phases

| Phase | Scope | Timeline |
|-------|-------|----------|
| **Alpha** | Internal team testing | Week 1-2 |
| **Beta** | Opt-in via feature flag | Week 3-4 |
| **GA** | Default for new sessions | Week 5+ |

### 9.2 Feature Flag

```
COPILOT_WORKTREE_SESSIONS=1 copilot start --branch my-feature
```

### 9.3 Backward Compatibility

- Existing sessions (non-worktree) continue to work
- Users can opt-out by omitting `--branch` flag (runs in main repo as before)
- No migration needed for existing repos

---

## 10. Future Considerations (v2+)

| Feature | Description |
|---------|-------------|
| **Session templates** | Pre-configure branches with specific settings |
| **Session sharing** | Export/import session state for collaboration |
| **Auto-sync** | Automatically rebase on main branch updates |
| **Cloud backup** | Persist session state to cloud for cross-machine access |
| **Sparse checkout** | Combine with sparse-checkout for large monorepos |
| **Containerized sessions** | Run each session in isolated container with deps |

---

## 11. Open Questions

1. **Q: Should we support anonymous/detached sessions (no branch name)?**
   - Current answer: No, branch name is the session identifier. Keeps model simple.

2. **Q: What happens if user deletes branch on remote while session is active?**
   - Proposed: Warn on next push attempt, offer to recreate branch or rename.

3. **Q: Should sessions auto-pause/resume to save resources?**
   - Proposed: Out of scope for v1. Sessions are just directories; no running processes.

4. **Q: How to handle monorepos with multiple packages?**
   - Proposed: Worktree covers entire repo. Package-specific concerns are user's responsibility.

---

## 12. Appendix

### A. Git Worktree Command Reference

```bash
# Create worktree with new branch
git worktree add <path> -b <new-branch>

# Create worktree with existing branch
git worktree add <path> <existing-branch>

# Create detached worktree (not used in this design)
git worktree add --detach <path> <commit>

# List worktrees
git worktree list

# Remove worktree
git worktree remove <path>

# Clean up stale worktree references
git worktree prune
```

### B. Copy-on-Write Commands

```bash
# macOS (APFS)
cp -c -r source/ dest/

# Linux (Btrfs)
cp --reflink=auto -r source/ dest/

# Check if CoW is supported
# macOS: diskutil info / | grep "File System"
# Linux: stat -f -c %T /
```
