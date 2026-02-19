export const resolveSessionName = ({
  storedName,
  persistedName,
  summary,
}: {
  storedName?: string;
  persistedName?: string;
  summary?: string;
}): string | undefined => {
  return storedName || persistedName || summary || undefined;
};

export const mergeSessionCwds = <T extends { sessionId: string; cwd?: string }>(
  existing: Record<string, string>,
  openSessions: T[]
): Record<string, string> => {
  const merged = { ...existing };
  for (const session of openSessions) {
    if (session.cwd) {
      merged[session.sessionId] = session.cwd;
    }
  }
  return merged;
};
