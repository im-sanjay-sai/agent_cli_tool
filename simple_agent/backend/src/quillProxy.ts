import { Request, Response } from 'express';

/**
 * Quill Server SDK proxy route.
 *
 * This is the same thing the old agent had at /api/quill (Next.js route).
 * The Quill CLI sends requests here, and we forward them to @quillsql/node
 * which handles Quill Cloud communication + database queries.
 *
 * Data flow:
 *   quill CLI  →  POST /api/quill  →  @quillsql/node  →  Quill Cloud + your DB
 *
 * Required env vars:
 *   QUILL_PRIVATE_KEY                 - Your Quill private key (pk_...)
 *   QUILL_DATABASE_TYPE               - postgres | mysql | databricks | ...
 *   QUILL_DATABASE_CONNECTION_STRING  - Full DB connection string
 *     -- OR individual fields: QUILL_DATABASE_HOST, PORT, NAME, USER, PASSWORD
 */

// Dynamic import because @quillsql/node is CJS-only
let Quill: any = null;

  function normalizeDatabaseType(value?: unknown): string {
  if (typeof value !== 'string') return 'postgresql';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'postgresql';
  if (normalized === 'postgres' || normalized === 'postgresql') return 'postgresql';
  return normalized;
}

async function loadQuill() {
  if (!Quill) {
    const mod = await import('@quillsql/node');
    Quill = mod.Quill || mod.default?.Quill || mod.default;
  }
  return Quill;
}

function getDatabaseConfig() {
  // Option 1: Connection string (simplest)
  if (process.env.QUILL_DATABASE_CONNECTION_STRING) {
    return {
      databaseConnectionString: process.env.QUILL_DATABASE_CONNECTION_STRING,
    };
  }

  // Option 2: Individual fields
  const config: Record<string, string | number | undefined> = {};

  if (process.env.QUILL_DATABASE_HOST) config.host = process.env.QUILL_DATABASE_HOST;
  if (process.env.QUILL_DATABASE_PORT)
    config.port = parseInt(process.env.QUILL_DATABASE_PORT, 10);
  if (process.env.QUILL_DATABASE_NAME) config.database = process.env.QUILL_DATABASE_NAME;
  if (process.env.QUILL_DATABASE_USER) config.user = process.env.QUILL_DATABASE_USER;
  if (process.env.QUILL_DATABASE_PASSWORD)
    config.password = process.env.QUILL_DATABASE_PASSWORD;

  // Databricks-specific
  if (process.env.QUILL_DATABASE_PATH) config.path = process.env.QUILL_DATABASE_PATH;
  if (process.env.QUILL_DATABASE_TOKEN) config.token = process.env.QUILL_DATABASE_TOKEN;

  if (Object.keys(config).length > 0) {
    return { databaseConfig: config };
  }

  return {};
}

let quillInstance: any = null;

async function getQuill() {
  if (!quillInstance) {
    const privateKey = process.env.QUILL_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(
        'QUILL_PRIVATE_KEY is not set. Add it to your .env file.'
      );
    }

    const QuillClass = await loadQuill();
    const dbConfig = getDatabaseConfig();
    const databaseType = normalizeDatabaseType(process.env.QUILL_DATABASE_TYPE);

    quillInstance = new QuillClass({
      privateKey,
      databaseType,
      ...dbConfig,
    });
  }
  return quillInstance;
}

/**
 * POST /api/quill
 *
 * The Quill CLI sends:
 *   POST /api/quill?task=dashboards
 *   Body: { metadata: { task, clientId, adminMode: true, ... } }
 */
export async function quillProxyHandler(req: Request, res: Response) {
  try {
    const quill = await getQuill();
    const { metadata } = req.body;

    if (!metadata) {
      res.status(400).json({ error: 'Missing metadata in request body' });
      return;
    }

    const normalizedMetadata = {
      ...metadata,
      databaseType: normalizeDatabaseType(metadata.databaseType),
    };

    console.log(`[quill-proxy] task=${normalizedMetadata.task}`);

    const result = await quill.query({
      tenants: ['QUILL_ALL_TENANTS'],
      metadata: normalizedMetadata,
      adminEnabled: true,
    });

    res.json(result);
  } catch (error) {
    console.error('[quill-proxy] Error:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to process query';

    res.status(500).json({ error: message });
  }
}
