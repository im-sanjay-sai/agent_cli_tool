export type SessionStatus = 'active' | 'promoted' | 'discarded' | 'error';

export interface SessionRecord {
  sessionId: string;
  sourceClientId: string;
  sandboxClientId: string;
  sandboxClientName?: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  lastError?: string;
}

const sessions = new Map<string, SessionRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

export function getSessionRecord(sessionId: string): SessionRecord | null {
  return sessions.get(sessionId) ?? null;
}

export function saveSessionRecord(
  session: Omit<SessionRecord, 'createdAt' | 'updatedAt'> & {
    createdAt?: string;
    updatedAt?: string;
  },
): SessionRecord {
  const existing = sessions.get(session.sessionId);
  const record: SessionRecord = {
    ...existing,
    ...session,
    createdAt: session.createdAt ?? existing?.createdAt ?? nowIso(),
    updatedAt: session.updatedAt ?? nowIso(),
  };
  sessions.set(session.sessionId, record);
  return record;
}

export function deleteSessionRecord(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listSessionRecords(): SessionRecord[] {
  return Array.from(sessions.values());
}

export function pruneExpiredSessionRecords(ttlMs: number): string[] {
  const expired: string[] = [];
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    const updatedAt = new Date(session.updatedAt).getTime();
    if (Number.isNaN(updatedAt)) continue;
    if (now - updatedAt > ttlMs) {
      expired.push(sessionId);
    }
  }
  return expired;
}
