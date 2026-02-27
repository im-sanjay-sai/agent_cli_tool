import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  SessionRecord,
  deleteSessionRecord,
  getSessionRecord,
  listSessionRecords,
  pruneExpiredSessionRecords,
  saveSessionRecord,
} from './sessionStore';
import { callHostedSdkTask } from './quillProxy';

const SESSION_SANDBOX_ENABLED =
  String(process.env.SESSION_SANDBOX_ENABLED ?? 'false').toLowerCase() !==
  'false';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || '24');
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
const SESSION_WORKDIR_ROOT = resolve(tmpdir(), 'quill-agent-sessions');
const AUTO_DISCARD_ON_PROMOTE =
  String(process.env.SESSION_AUTO_DISCARD_ON_PROMOTE ?? 'true').toLowerCase() !==
  'false';

export interface SessionExecutionContext {
  sessionId: string;
  workingDir: string;
  sourceClientId: string;
  sandboxClientId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sessionPath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(SESSION_WORKDIR_ROOT, safe);
}

async function readDefaultSourceClientId(): Promise<string | null> {
  const envClientId = process.env.QUILL_CLIENT_ID?.trim();
  if (envClientId) return envClientId;

  try {
    const configPath = resolve(__dirname, '..', '.quill', 'config.json');
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { clientId?: string };
    return parsed.clientId?.trim() || null;
  } catch {
    return null;
  }
}

function getBackendQueryEndpoint(): string {
  if (process.env.QUILL_AGENT_QUERY_ENDPOINT?.trim()) {
    return process.env.QUILL_AGENT_QUERY_ENDPOINT.trim();
  }
  const port = process.env.PORT || '3001';
  return `http://localhost:${port}/api/quill`;
}

async function ensureSessionWorkspace(record: SessionRecord): Promise<string> {
  const root = sessionPath(record.sessionId);
  const quillDir = join(root, '.quill');
  await mkdir(quillDir, { recursive: true });
  const configPath = join(quillDir, 'config.json');
  const config = {
    clientId: record.sandboxClientId,
    queryEndpoint: getBackendQueryEndpoint(),
    currentEnv: 'staging',
  };
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return root;
}

export async function discardSession(sessionId: string): Promise<{
  discarded: boolean;
  sessionId: string;
  sandboxClientId?: string;
}> {
  const existing = getSessionRecord(sessionId);
  if (!existing) {
    return { discarded: false, sessionId };
  }

  try {
    await callHostedSdkTask('delete-client', {
      clientId: existing.sandboxClientId,
      adminEnabled: true,
    });
  } catch (err) {
    console.warn(
      `[session] Failed to delete sandbox ${existing.sandboxClientId}:`,
      err,
    );
  }

  await rm(sessionPath(sessionId), { recursive: true, force: true });
  deleteSessionRecord(sessionId);
  return {
    discarded: true,
    sessionId,
    sandboxClientId: existing.sandboxClientId,
  };
}

export async function cleanupExpiredSessions(): Promise<void> {
  if (!SESSION_SANDBOX_ENABLED) return;
  const expiredIds = pruneExpiredSessionRecords(SESSION_TTL_MS);
  await Promise.all(expiredIds.map((sessionId) => discardSession(sessionId)));
}

export function getSession(sessionId: string): SessionRecord | null {
  return getSessionRecord(sessionId);
}

export function listSessions(): SessionRecord[] {
  return listSessionRecords();
}

export async function ensureSession(
  sessionId: string,
  sourceClientId?: string,
): Promise<SessionRecord> {
  if (!SESSION_SANDBOX_ENABLED) {
    throw new Error('Session sandbox is disabled');
  }

  await cleanupExpiredSessions();

  const existing = getSessionRecord(sessionId);
  if (existing && existing.status !== 'discarded') {
    const updated = saveSessionRecord({
      ...existing,
      updatedAt: nowIso(),
    });
    await ensureSessionWorkspace(updated);
    return updated;
  }

  const source =
    sourceClientId?.trim() || (await readDefaultSourceClientId()) || '';
  if (!source) {
    throw new Error(
      'Missing sourceClientId. Provide it when starting a session or set QUILL_CLIENT_ID.',
    );
  }

  const cloneResponse = (await callHostedSdkTask('clone-environment', {
    fromClientId: source,
    skipWarning: true,
    addMissingTables: true,
    adminEnabled: true,
  })) as { metadata?: Record<string, unknown> };

  const metadata = (cloneResponse.metadata || {}) as {
    error?: string;
    success?: boolean;
    tables?: { errors?: unknown[] };
    dashboards?: { errors?: unknown[] };
    newClientId?: string;
    newClientName?: string;
  };
  if (metadata.error) {
    throw new Error(metadata.error);
  }
  if (metadata.success === false) {
    const tableErrors = Array.isArray(metadata.tables?.errors)
      ? metadata.tables.errors.length
      : 0;
    const dashboardErrors = Array.isArray(metadata.dashboards?.errors)
      ? metadata.dashboards.errors.length
      : 0;
    throw new Error(
      `Clone created a sandbox but failed to copy all resources (tableErrors=${tableErrors}, dashboardErrors=${dashboardErrors}).`,
    );
  }

  const sandboxClientId = metadata.newClientId;
  if (!sandboxClientId) {
    throw new Error(
      'clone-environment did not return newClientId. Update server SDK clone response.',
    );
  }

  const record = saveSessionRecord({
    sessionId,
    sourceClientId: source,
    sandboxClientId,
    sandboxClientName: metadata.newClientName,
    status: 'active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await ensureSessionWorkspace(record);
  return record;
}

export async function getSessionExecutionContext(
  sessionId: string,
  sourceClientId?: string,
): Promise<SessionExecutionContext> {
  const session = await ensureSession(sessionId, sourceClientId);
  const workingDir = await ensureSessionWorkspace(session);
  return {
    sessionId,
    workingDir,
    sourceClientId: session.sourceClientId,
    sandboxClientId: session.sandboxClientId,
  };
}

export async function diffSession(
  sessionId: string,
  compareToClientId?: string,
): Promise<Record<string, unknown>> {
  const session = getSessionRecord(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const response = await callHostedSdkTask('diff-environment', {
    fromClientId: compareToClientId || session.sourceClientId,
    toClientId: session.sandboxClientId,
    adminEnabled: true,
  });
  saveSessionRecord({
    ...session,
    updatedAt: nowIso(),
  });
  return response as Record<string, unknown>;
}

export async function promoteSession(
  sessionId: string,
  targetClientId: string,
  options?: {
    addMissingTables?: boolean;
    skipWarning?: boolean;
    autoDiscard?: boolean;
  },
): Promise<Record<string, unknown>> {
  const session = getSessionRecord(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  if (!targetClientId) {
    throw new Error('targetClientId is required');
  }

  const response = await callHostedSdkTask('promote-environment', {
    fromClientId: session.sandboxClientId,
    toClientId: targetClientId,
    addMissingTables: options?.addMissingTables ?? false,
    skipWarning: true,
    adminEnabled: true,
  });

  const body = (response as Record<string, unknown>) || {};
  const metadata =
    (body.metadata as Record<string, unknown> | undefined) || body;
  const responseError = metadata.error;
  const responseSuccess = metadata.success;
  const tableErrors = Array.isArray(
    (metadata.tables as Record<string, unknown> | undefined)?.errors,
  )
    ? ((metadata.tables as Record<string, unknown>).errors as unknown[]).length
    : 0;
  const dashboardErrors = Array.isArray(
    (metadata.dashboards as Record<string, unknown> | undefined)?.errors,
  )
    ? ((metadata.dashboards as Record<string, unknown>).errors as unknown[])
        .length
    : 0;

  if (responseError || responseSuccess === false) {
    saveSessionRecord({
      ...session,
      status: 'active',
      updatedAt: nowIso(),
    });
    const message =
      typeof responseError === 'string' && responseError
        ? responseError
        : `Promote failed (tableErrors=${tableErrors}, dashboardErrors=${dashboardErrors}).`;
    throw new Error(message);
  }

  saveSessionRecord({
    ...session,
    status: 'promoted',
    updatedAt: nowIso(),
  });

  const shouldDiscard =
    options?.autoDiscard === undefined
      ? AUTO_DISCARD_ON_PROMOTE
      : options.autoDiscard;
  if (shouldDiscard) {
    await discardSession(sessionId);
  }

  return {
    ...((response as Record<string, unknown>) || {}),
    autoDiscarded: shouldDiscard,
  };
}

export function isSessionSandboxEnabled(): boolean {
  return SESSION_SANDBOX_ENABLED;
}
