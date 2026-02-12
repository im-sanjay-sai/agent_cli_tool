# Quill AI Agent

A chat interface that lets you manage Quill BI dashboards, reports, and data using natural language. Powered by GPT and the Quill CLI.

## Repository Structure

| Folder | Description | Individual Repo |
|--------|-------------|-----------------|
| `agent/` | Next.js chat UI + GPT tool-calling agent | [cli_agent_tools](https://github.com/im-sanjay-sai/cli_agent_tools) (`feature/dry-run-mode`) |
| `cli/` | Quill CLI — manages dashboards, reports, queries | [quill-cli](https://github.com/im-sanjay-sai/quill-cli) (`test_tool_call`) |

> **Note:** Dry-run mode is enabled by default. The agent will log CLI commands without executing them so you can test safely. Once you're comfortable, set `DRY_RUN=false` in `agent/.env.local` to enable real execution.

### Clone

```bash
git clone https://github.com/im-sanjay-sai/agent_cli_tool.git
cd agent_cli_tool
```

## Prerequisites

1. **Node.js 18+**
2. **OpenAI API key** with access to GPT-4.1 or later
3. **Quill credentials**: a `privateKey` (pk\_...) and database connection details

## Quick Start

### 1. Install dependencies

```bash
cd agent
npm install
```

### 2. Install and link the Quill CLI

```bash
cd ../cli
npm install
npm run build
npm link  # Makes `quill` available globally as `quill`
```

### 3. Configure environment

Copy the example env file and fill in your credentials:

```bash
cp agent/.env.example agent/.env.local
```

Edit `agent/.env.local` with:

```env
# Required: OpenAI
OPENAI_API_KEY=sk-proj-your-key-here

# Required: Quill Server SDK
QUILL_PRIVATE_KEY=pk_your_private_key_here
QUILL_DATABASE_TYPE=postgres
QUILL_DATABASE_CONNECTION_STRING=postgresql://user:password@host:5432/dbname
```

### 4. Configure the CLI to use the local proxy (ignore if followed STEP 3)

**Option A: Run the setup script** (easiest)

```bash
./agent/scripts/setup-cli-config.sh
```

**Option B: Manual setup**

Create `~/.quill/config.json` (global CLI auth):

```json
{
  "token": "local-dev-proxy",
  "defaultEnv": "staging",
  "queryEndpoint": "http://localhost:3000/api/quill"
}
```

Then update `agent/.quill/config.json` (project config) with your real `clientId`:

```json
{
  "clientId": "YOUR_QUILL_PUBLIC_KEY",
  "queryEndpoint": "http://localhost:3000/api/quill",
  "currentEnv": "staging"
}
```

### 5. Run the agent

```bash
cd agent
npm run dev
# Open http://localhost:3000
```

### 6. Verify it works

In the chat, try:
- "Show me all my dashboards"
- "List the database schemas"
- "What reports exist?"

## How It Works

```
Browser (Chat UI)
  │ POST /api/chat (no auth needed)
  ▼
Next.js API Route (/api/chat)
  │ Calls OpenAI Chat Completions API (with 38 tool definitions)
  ▼
GPT-4.1
  │ tool_call: quill_dashboard_list
  ▼
CLI Executor → spawns: quill dashboard list --json
  │ CLI sends POST http://localhost:3000/api/quill?task=dashboards
  ▼
Local Proxy Route (/api/quill)
  │ @quillsql/node Server SDK (privateKey + databaseConfig)
  ▼
Quill Cloud + Your Database
  │ JSON response
  ▼
Back to GPT → final text response → Browser
```

### Two API routes

| Route | Purpose |
|-------|---------|
| `POST /api/chat` | Chat endpoint — receives messages, calls GPT, executes tool calls |
| `POST /api/quill` | Quill proxy — the CLI sends requests here instead of api.quillsql.com |

## Configuration

### Environment Variables (`agent/.env.local`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | Your OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4.1` | Model to use |
| `DRY_RUN` | No | `true` | Log CLI commands without executing (disable after testing) |
| `QUILL_PRIVATE_KEY` | Yes | — | Quill private key (pk\_...) |
| `QUILL_DATABASE_TYPE` | No | `postgres` | Database type |
| `QUILL_DATABASE_CONNECTION_STRING` | Yes* | — | DB connection string |
| `QUILL_DATABASE_HOST` | — | — | Alternative to connection string |
| `QUILL_DATABASE_PORT` | — | — | Alternative to connection string |
| `QUILL_DATABASE_NAME` | — | — | Alternative to connection string |
| `QUILL_DATABASE_USER` | — | — | Alternative to connection string |
| `QUILL_DATABASE_PASSWORD` | — | — | Alternative to connection string |

\* Either `QUILL_DATABASE_CONNECTION_STRING` or the individual `QUILL_DATABASE_*` fields are required.

### CLI Config Files

| File | Purpose |
|------|---------|
| `~/.quill/config.json` | Global CLI auth + default endpoint |
| `agent/.quill/config.json` | Project-level clientId + endpoint override |

## Dry Run Mode

Dry-run mode is **enabled by default** (`DRY_RUN=true`). In this mode, the agent logs the CLI commands GPT wants to run without actually executing them — this lets you safely test the tool-calling flow end to end.

Once you've verified everything works as expected, disable it:

```env
DRY_RUN=false
```

## Pointing at a Remote Server SDK

If someone else is already hosting the Quill Server SDK, you don't need `QUILL_PRIVATE_KEY` or database credentials. Just update both config files to point at their endpoint:

```json
// ~/.quill/config.json
{
  "token": "their-auth-token-if-needed",
  "defaultEnv": "staging",
  "queryEndpoint": "https://their-server.com/api/quill"
}
```

```json
// agent/.quill/config.json
{
  "clientId": "their-client-id",
  "queryEndpoint": "https://their-server.com/api/quill",
  "currentEnv": "staging"
}
```
