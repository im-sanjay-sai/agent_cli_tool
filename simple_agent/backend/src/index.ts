import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runAgentStreaming, ChatRequest } from './agent';
import { quillProxyHandler } from './quillProxy';
import {
  diffSession,
  discardSession,
  ensureSession,
  getSession,
  getSessionExecutionContext,
  isSessionSandboxEnabled,
  promoteSession,
} from './sessionService';

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ---------- Startup validation ----------

if (!process.env.OPENAI_API_KEY) {
  console.error(
    'FATAL: OPENAI_API_KEY environment variable is not set.\n' +
      'Set it via: export OPENAI_API_KEY=your-key-here'
  );
  process.exit(1);
}

if (!process.env.QUILL_PRIVATE_KEY) {
  console.warn(
    'WARNING: QUILL_PRIVATE_KEY is not set. The Quill SDK proxy will not work.\n' +
      'CLI commands that need the Quill API will fail.'
  );
}

// ---------- Middleware ----------

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

// ---------- Routes ----------

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: process.env.OPENAI_MODEL || 'gpt-5.2' });
});

// Quill Server SDK proxy (the CLI sends requests here)
app.post('/api/quill', quillProxyHandler);

// Session APIs for sandbox workflows
app.post('/api/session/start', async (req, res) => {
  const { sessionId, sourceClientId } = req.body as {
    sessionId?: string;
    sourceClientId?: string;
  };
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }
  try {
    const session = await ensureSession(sessionId, sourceClientId);
    res.json({
      sessionId: session.sessionId,
      sourceClientId: session.sourceClientId,
      sandboxClientId: session.sandboxClientId,
      sandboxClientName: session.sandboxClientName,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to start session',
    });
  }
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: `Session not found: ${req.params.sessionId}` });
    return;
  }
  res.json(session);
});

app.post('/api/session/:sessionId/diff', async (req, res) => {
  const { compareToClientId } = req.body as { compareToClientId?: string };
  try {
    const result = await diffSession(req.params.sessionId, compareToClientId);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to diff session',
    });
  }
});

app.post('/api/session/:sessionId/promote', async (req, res) => {
  const {
    targetClientId,
    addMissingTables,
    skipWarning,
    autoDiscard,
  } = req.body as {
    targetClientId?: string;
    addMissingTables?: boolean;
    skipWarning?: boolean;
    autoDiscard?: boolean;
  };
  if (!targetClientId) {
    res.status(400).json({ error: 'targetClientId is required' });
    return;
  }
  try {
    const result = await promoteSession(req.params.sessionId, targetClientId, {
      addMissingTables,
      skipWarning,
      autoDiscard,
    });
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to promote session',
    });
  }
});

app.post('/api/session/:sessionId/discard', async (req, res) => {
  try {
    const result = await discardSession(req.params.sessionId);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to discard session',
    });
  }
});

// Chat endpoint (SSE streaming)
app.post('/api/chat', async (req, res) => {
  const { messages, sessionId, sourceClientId } = req.body as ChatRequest & {
    sourceClientId?: string;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      error: 'messages array is required and must not be empty',
    });
    return;
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage.role || !lastMessage.content) {
    res.status(400).json({
      error: 'Last message must have role and content',
    });
    return;
  }

  console.log(`[chat] Received ${messages.length} messages (streaming)`);

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    let executionContext:
      | {
          sessionId: string;
          workingDir: string;
        }
      | undefined;

    if (isSessionSandboxEnabled()) {
      if (!sessionId) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            message:
              'sessionId is required when SESSION_SANDBOX_ENABLED is true',
          })}\n\n`,
        );
        res.end();
        return;
      }
      const context = await getSessionExecutionContext(sessionId, sourceClientId);
      executionContext = {
        sessionId: context.sessionId,
        workingDir: context.workingDir,
      };
    }

    await runAgentStreaming(
      messages,
      (event, data) => {
        if (!res.destroyed) {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      },
      undefined,
      executionContext,
    );
  } catch (err: any) {
    console.error('[chat] Error:', err.message);
    if (!res.destroyed) {
      const message =
        err.message?.includes('API key')
          ? 'Invalid or missing OpenAI API key on the server.'
          : err.message || 'Internal server error';
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    }
  } finally {
    if (!res.destroyed) {
      res.end();
    }
  }
});

// ---------- Server ----------

const server = app.listen(PORT, () => {
  console.log(`Quill Agent Backend running on port ${PORT}`);
  console.log(`Model: ${process.env.OPENAI_MODEL || 'gpt-5.2'}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
  console.log(`Quill SDK proxy: http://localhost:${PORT}/api/quill`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after 5s if connections don't close
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
