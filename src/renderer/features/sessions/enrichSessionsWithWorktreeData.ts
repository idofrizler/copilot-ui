import { PreviousSession } from '../../types';

export const enrichSessionsWithWorktreeData = async (
  sessions: PreviousSession[]
): Promise<PreviousSession[]> => {
  try {
    const worktreeSessions = await window.electronAPI.worktree.listSessions();
    const worktreeMap = new Map(worktreeSessions.sessions.map((wt) => [wt.worktreePath, wt]));

    return sessions.map((session) => {
      const worktree = session.cwd ? worktreeMap.get(session.cwd) : null;
      if (worktree) {
        return {
          ...session,
          worktree: {
            id: worktree.id,
            repoPath: worktree.repoPath,
            branch: worktree.branch,
            worktreePath: worktree.worktreePath,
            status: worktree.status,
            diskUsage: worktree.diskUsage,
          },
        };
      }
      // Worktree no longer exists - clear stale worktree data
      if (session.worktree) {
        const { worktree: _, ...sessionWithoutWorktree } = session;
        return sessionWithoutWorktree;
      }
      return session;
    });
  } catch (error) {
    console.error('Failed to enrich sessions with worktree data:', error);
    return sessions;
  }
};
