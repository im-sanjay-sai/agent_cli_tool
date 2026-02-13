import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runAgent, ChatRequest } from './agent';
import { quillProxyHandler } from './quillProxy';

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const REQUEST_TIMEOUT_MS = 120_000; // 2 min max per request (tool calls can chain)

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

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  // Set up a request-level timeout via AbortController
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { messages } = req.body as ChatRequest;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: 'messages array is required and must not be empty',
      });
      return;
    }

    // Validate message structure minimally
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.role || !lastMessage.content) {
      res.status(400).json({
        error: 'Last message must have role and content',
      });
      return;
    }

    console.log(`[chat] Received ${messages.length} messages`);

    const result = await runAgent(messages, abort.signal);

    console.log(
      `[chat] Agent responded with ${result.messages.length} new messages`
    );

    res.json({
      messages: result.messages,
      finalContent: result.finalContent,
    });
  } catch (err: any) {
    // Distinguish abort/timeout from other errors
    if (err.name === 'AbortError' || abort.signal.aborted) {
      console.error('[chat] Request timed out');
      res.status(504).json({
        error: 'Request timed out. The agent took too long to respond.',
      });
      return;
    }

    console.error('[chat] Error:', err.message);

    // Surface useful OpenAI errors to the client
    const status = err.status || 500;
    const message =
      err.message?.includes('API key')
        ? 'Invalid or missing OpenAI API key on the server.'
        : err.message || 'Internal server error';

    res.status(status).json({ error: message });
  } finally {
    clearTimeout(timeout);
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
