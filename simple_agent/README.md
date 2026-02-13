# Quill CLI Agent

A simple chat interface backed by a GPT-5.2 agent that can execute Quill CLI commands via tool calling. The agent has the full Quill CLI documentation in its system prompt so it knows every command, flag, and response shape.

## Architecture

```
User  →  Next.js Frontend (Vercel)  →  Express Backend (Render)  →  OpenAI GPT-5.2
                                              ↕
                                        quill CLI (child_process)
                                              ↕
                                        POST /api/quill (same server)
                                              ↕
                                        @quillsql/node  →  Quill Cloud + your DB
```

- **Frontend**: Next.js 15 + Tailwind CSS 4 chat UI (deployed to Vercel)
- **Backend**: Express + OpenAI Node SDK `runTools()` helper (deployed to Render)
- **Quill SDK proxy**: The backend also serves `/api/quill` using `@quillsql/node`, which the CLI loops back to for all Quill API calls
- **Single tool**: `execute_cli_command` — runs any `quill` CLI command and returns the JSON output

## Local Development

### Prerequisites

- Node.js 18+
- npm
- OpenAI API key
- Quill CLI installed and configured (`quill init`)

### Backend

```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Run in dev mode
npm run dev
```

The backend runs on `http://localhost:3001` by default.

### Frontend

```bash
cd frontend
npm install

# Create .env.local (optional — defaults to localhost:3001)
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local

# Run in dev mode
npm run dev
```

The frontend runs on `http://localhost:3000` by default.

## Deployment

Deploy the **backend first** (you need its URL to configure the frontend).

---

### Step 1: Backend → Render

#### 1a. Push the whole monorepo to GitHub

The backend needs access to the `cli/` folder (the Quill CLI source) because it's not published to npm. So you must deploy the **entire repo** — not just the backend folder.

```bash
# From the repo root (where cli/ and simple_agent/ both live)
git add .
git commit -m "Add simple agent"
git push origin main
```

Your repo structure on GitHub should look like:
```
repo-root/
├── cli/                  ← Quill CLI source code
├── simple_agent/
│   ├── backend/          ← Express + OpenAI agent
│   └── frontend/         ← Next.js chat UI
└── ...
```

#### 1b. Create a Web Service on Render

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub account and select your repo
4. Configure the service:

| Setting | Value |
|---------|-------|
| **Name** | `quill-agent-backend` |
| **Region** | Pick the closest to your users |
| **Branch** | `main` |
| **Root Directory** | **Leave blank** (must be repo root so the build can access `cli/`) |
| **Runtime** | **Node** |
| **Build Command** | `cd simple_agent/backend && chmod +x render-build.sh && ./render-build.sh` |
| **Start Command** | `cd simple_agent/backend && npm start` |
| **Instance Type** | Free (or Starter for better performance) |

**Why Root Directory is blank**: The backend build script needs to reach `../../cli` to build and link the Quill CLI binary. If you set root to `simple_agent/backend`, Render would only clone that subfolder and the CLI source wouldn't be available.

The `render-build.sh` script (already included in the backend) does this automatically:
1. `cd ../../cli` → install + build + `npm link` (makes `quill` available globally)
2. `cd` back to backend → install + `npm link @quill/cli` + build
3. Verifies `quill` binary is available

#### 1c. Set environment variables

In the Render dashboard → your service → **Environment** → **Add Environment Variable**:

**Required:**

| Key | Value |
|-----|-------|
| `OPENAI_API_KEY` | `sk-proj-...` (your OpenAI API key) |
| `CORS_ORIGIN` | `*` (temporarily — update after frontend is deployed) |

**Required for Quill CLI to work** (same env vars as your old `agent/.env.local` -- copy directly):

| Key | Value |
|-----|-------|
| `QUILL_PRIVATE_KEY` | Your Quill private key (`pk_...`) |
| `QUILL_CLIENT_ID` | Your Quill client/project ID |
| `QUILL_DATABASE_TYPE` | `postgres` (or your DB type) |
| `QUILL_DATABASE_CONNECTION_STRING` | Your full DB connection string |

**Optional:**

| Key | Value |
|-----|-------|
| `OPENAI_MODEL` | `gpt-5.2` (default) |
| `QUILL_ENV` | `staging` or `prod` |

Note: Render automatically sets `PORT` — you don't need to add it. You do **not** need `QUILL_QUERY_ENDPOINT` -- the backend runs its own Quill SDK proxy at `/api/quill` and the CLI points to it automatically.

#### 1d. Deploy

Click **Deploy** (or it auto-deploys on push). Watch the build logs to confirm:
- `✓ Quill CLI built and linked globally`
- `✓ Backend built`
- `✓ Done`

Once deployed, you'll get a URL like: `https://quill-agent-backend.onrender.com`

Verify it works:
```bash
curl https://quill-agent-backend.onrender.com/health
# Should return: {"status":"ok","model":"gpt-5.2"}
```

---

### Step 2: Frontend → Vercel

#### 2a. Code is already on GitHub

You already pushed the whole repo in Step 1a. The frontend lives at `simple_agent/frontend/`.

#### 2b. Import in Vercel

1. Go to [https://vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select the repo
3. Configure:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Next.js (auto-detected) |
| **Root Directory** | `simple_agent/frontend` (required -- this is where `package.json` lives) |
| **Build Command** | Leave default (`next build`) |
| **Output Directory** | Leave default |
| **Install Command** | Leave default (`npm install`) |

#### 2c. Set environment variables

In the Vercel project settings → **Environment Variables**:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `https://quill-agent-backend.onrender.com` (your Render URL from step 1d) |

**Important**: The variable must start with `NEXT_PUBLIC_` to be available in the browser.

#### 2d. Deploy

Click **Deploy**. Vercel builds and deploys automatically.

Once live, you'll get a URL like: `https://quill-agent-frontend.vercel.app`

#### 2e. Update CORS on Render

Now go back to your Render service → **Environment** and update:

| Key | Value |
|-----|-------|
| `CORS_ORIGIN` | `https://quill-agent-frontend.vercel.app` (your actual Vercel URL) |

Render will auto-redeploy with the new env var.

---

### Step 3: Verify end-to-end

1. Open your Vercel frontend URL in a browser
2. Type "Check my auth status" and send
3. You should see the agent call `quill whoami` and return the result

### Troubleshooting

| Problem | Fix |
|---------|-----|
| "Could not reach the backend server" | Check `NEXT_PUBLIC_API_URL` is set correctly in Vercel env vars. Check Render service is running. |
| Vercel build fails: "cannot find package" | Make sure **Root Directory** is set to `simple_agent/frontend` in Vercel project settings. |
| Frontend loads but API calls go to localhost | `NEXT_PUBLIC_API_URL` was not set before building. Add it in Vercel env vars and **redeploy**. |
| CORS errors in browser console | Update `CORS_ORIGIN` on Render to your exact Vercel domain (no trailing slash). |
| "Invalid or missing OpenAI API key" | Check `OPENAI_API_KEY` is set in Render environment variables. |
| Build fails: "cannot find ../../cli" | Make sure **Root Directory** is blank on Render (not `simple_agent/backend`). The build script needs the repo root. |
| Build fails: "quill: command not found" | The `render-build.sh` didn't run. Check your Build Command is: `cd simple_agent/backend && chmod +x render-build.sh && ./render-build.sh` |
| `quill` commands return AUTH_REQUIRED | Set `QUILL_PRIVATE_KEY` in Render env vars. |
| `quill` commands return NOT_INITIALIZED | The `.quill/config.json` is missing. Check that `render-build.sh` ran successfully (it creates this file). |
| Backend health check works but chat fails | Check Render logs. Usually missing Quill env vars (`QUILL_PRIVATE_KEY`, `QUILL_CLIENT_ID`, `QUILL_DATABASE_CONNECTION_STRING`). |
| Render free tier is slow (cold starts) | First request after idle takes ~30s. Upgrade to Starter ($7/mo) for always-on. |
| "Request timed out" on long operations | Some CLI commands (e.g. `schema explore` on large DBs) can be slow. The backend has a 2-minute timeout. |

## Environment Variables

### Backend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-5.2` | Model to use |
| `PORT` | No | `3001` | Server port |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin |
| `QUILL_PRIVATE_KEY` | Yes | — | Quill private key (`pk_...`) |
| `QUILL_CLIENT_ID` | Yes | — | Quill client/project ID |
| `QUILL_DATABASE_TYPE` | No | `postgres` | Database type |
| `QUILL_DATABASE_CONNECTION_STRING` | Yes | — | Full DB connection string |

### Frontend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001` | Backend API URL |

## How It Works

1. User types a message in the chat UI
2. Frontend sends the full conversation history to `POST /api/chat`
3. Backend prepends the system prompt (with `developer` role) containing full CLI documentation
4. Backend calls OpenAI `runTools()` with the `execute_cli_command` tool
5. If GPT decides to call the tool, the backend executes the `quill` command via `child_process.execFile`
6. The CLI reads `.quill/config.json` and sends requests to `POST /api/quill` on the **same backend server**
7. The `/api/quill` route uses `@quillsql/node` to talk to Quill Cloud and your database
8. CLI result flows back: DB -> @quillsql/node -> /api/quill -> CLI stdout -> backend
9. The tool result is automatically fed back to GPT by the `runTools` helper
10. GPT returns a final text response summarizing the result
11. All messages (including tool calls/results) are sent back to the frontend
12. Frontend renders everything — user messages, tool call indicators (expandable), and assistant responses
