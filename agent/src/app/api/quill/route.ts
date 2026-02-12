import { NextResponse } from "next/server";
import { Quill } from "@quillsql/node";

/**
 * Local Quill Server SDK proxy.
 *
 * This route lets the Quill CLI talk to Quill's cloud + your database
 * without needing Clerk auth or backend API-key endpoints.
 *
 * The CLI sends:
 *   POST /api/quill?task=dashboards
 *   Body: { metadata: { task, clientId, adminMode: true, ... } }
 *
 * We pass `metadata` straight through to @quillsql/node which handles
 * cloud communication (via privateKey) and database queries (via databaseConfig).
 *
 * Required env vars:
 *   QUILL_PRIVATE_KEY           - Your Quill private key (pk_...)
 *   QUILL_DATABASE_TYPE         - postgres | mysql | databricks | snowflake | ...
 *
 * Plus ONE of these for database connection:
 *   QUILL_DATABASE_CONNECTION_STRING  - Full connection string
 *   -- OR individual fields: --
 *   QUILL_DATABASE_HOST
 *   QUILL_DATABASE_PORT
 *   QUILL_DATABASE_NAME
 *   QUILL_DATABASE_USER
 *   QUILL_DATABASE_PASSWORD
 */

function getDatabaseConfig() {
  // Option 1: Connection string (simplest)
  if (process.env.QUILL_DATABASE_CONNECTION_STRING) {
    return {
      databaseConnectionString: process.env.QUILL_DATABASE_CONNECTION_STRING,
    };
  }

  // Option 2: Individual fields (for Databricks-style or standard DBs)
  const config: Record<string, string | number | undefined> = {};

  if (process.env.QUILL_DATABASE_HOST) config.host = process.env.QUILL_DATABASE_HOST;
  if (process.env.QUILL_DATABASE_PORT) config.port = parseInt(process.env.QUILL_DATABASE_PORT, 10);
  if (process.env.QUILL_DATABASE_NAME) config.database = process.env.QUILL_DATABASE_NAME;
  if (process.env.QUILL_DATABASE_USER) config.user = process.env.QUILL_DATABASE_USER;
  if (process.env.QUILL_DATABASE_PASSWORD) config.password = process.env.QUILL_DATABASE_PASSWORD;

  // Databricks-specific fields
  if (process.env.QUILL_DATABASE_PATH) config.path = process.env.QUILL_DATABASE_PATH;
  if (process.env.QUILL_DATABASE_TOKEN) config.token = process.env.QUILL_DATABASE_TOKEN;

  if (Object.keys(config).length > 0) {
    return { databaseConfig: config };
  }

  return {};
}

function createQuillInstance() {
  const privateKey = process.env.QUILL_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "QUILL_PRIVATE_KEY is not set. Add it to agent/.env.local"
    );
  }

  const dbConfig = getDatabaseConfig();
  const databaseType = process.env.QUILL_DATABASE_TYPE || "postgres";

  return new Quill({
    privateKey,
    databaseType: databaseType as any,
    ...dbConfig,
  } as any);
}

// Lazily initialize so we fail at request time, not at import time
let quillInstance: Quill | null = null;

function getQuill(): Quill {
  if (!quillInstance) {
    quillInstance = createQuillInstance();
  }
  return quillInstance;
}

export async function POST(request: Request) {
  try {
    const quill = getQuill();
    const body = await request.json();
    const { metadata } = body;

    if (!metadata) {
      return NextResponse.json(
        { error: "Missing metadata in request body" },
        { status: 400 }
      );
    }

    console.log(`[quill-proxy] task=${metadata.task}`);

    const result = await quill.query({
      tenants: ["QUILL_ALL_TENANTS"],
      metadata,
      adminEnabled: true,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[quill-proxy] Error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to process query";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
