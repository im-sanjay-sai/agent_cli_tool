# Quill Agent Auth — Clerk Integration (Implementation Complete)

## What Was Done

Integrated the agent backend into the server SDK using the **existing Clerk `attachClerkUser` middleware** — the same pattern used by `/cloud/engine`.

---

## Auth Flow

```
Portal Frontend                         Server SDK
───────────────                         ──────────────────────────
1. User is already logged in via Clerk
2. useAuth().getToken() → Clerk JWT
3. fetch('/agent/chat', {
     Authorization: Bearer <jwt>,        → 4. clerkMiddleware (global, validates JWT)
     body: { messages, sourceClientId }       ↓
   })                                    5. attachClerkUser (fetches user + org list, cached 5 min)
                                              ↓
                                         6. requireAgentAuth (checks req.clerkUser exists)
                                              ↓
                                         7. verifyOrgAccess (Client.findById → clerkOrgIds.includes)
                                              ↓
                                         8. Agent handler runs with userId + clerkOrgId
                                              ↓
                                         9. Session service clones env (QUILL_PRIVATE_KEY, internal)
                                              ↓
                                         10. OpenAI agent streams response via SSE
```

---

## Files Created / Modified

### Server SDK (`server_sdk/quill-server/`)

| File | Status | What |
|------|--------|------|
| `src/middleware/clerkAuth.js` | **NEW** | Extracted `attachClerkUser` + cache to shared module |
| `src/router/AgentRouter.js` | **NEW** | All agent routes with Clerk auth on every endpoint |
| `src/agent/agent.ts` | **NEW** | OpenAI integration (ported from simple_agent) |
| `src/agent/executeCli.ts` | **NEW** | CLI execution (ported, added userContext) |
| `src/agent/sessionService.ts` | **NEW** | Session lifecycle (ported, added userId/orgId ownership) |
| `src/agent/sessionStore.ts` | **NEW** | In-memory store (added userId, getSessionByUserId) |
| `src/agent/quillProxy.ts` | **NEW** | Quill SDK proxy (ported from simple_agent) |
| `src/agent/systemPrompt.ts` | **NEW** | Agent system prompt (ported as-is) |
| `src/index.js` | **MODIFIED** | Added import of agentRouter + shared middleware, mounted `/agent` |

### Portal Frontend (`frontend/apps/portal/`)

| File | Status | What |
|------|--------|------|
| `app/agent/page.tsx` | **NEW** | Agent chat page with Clerk auth (sends JWT on every request) |
| `app/Header.tsx` | **MODIFIED** | Added "Agent" nav link |

---

## How Auth Works on Each Endpoint

Every `/agent/*` route has this middleware chain:

```
clerkMiddleware (global)  →  attachClerkUser  →  requireAgentAuth  →  verifyOrgAccess  →  handler
```

1. **clerkMiddleware** — already runs globally on all routes. Validates the Clerk JWT, sets `req.auth.userId`.
2. **attachClerkUser** — fetches full user object + org list from Clerk API (cached 5 min). Sets `req.clerkUser` and `req.clerkOrgIds`.
3. **requireAgentAuth** — returns 401 if no `req.clerkUser`, 403 if no org membership.
4. **verifyOrgAccess** — looks up the `Client` by `sourceClientId`, checks `req.clerkOrgIds.includes(client.clerkOrgId)`. Returns 403 if mismatch.

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/agent/chat` | Clerk JWT + org check | SSE streaming chat |
| POST | `/agent/session` | Clerk JWT + org check | Create/get user session |
| GET | `/agent/session/:id` | Clerk JWT + ownership check | Get session info |
| POST | `/agent/session/:id/diff` | Clerk JWT + ownership check | Diff session vs source |
| POST | `/agent/session/:id/promote` | Clerk JWT + ownership check | Promote session changes |
| POST | `/agent/session/:id/discard` | Clerk JWT + ownership check | Discard session |
| POST | `/agent/quill` | None (internal CLI proxy) | Quill SDK proxy for CLI subprocess |

---

## Session Model (One Per User)

```typescript
interface SessionRecord {
  sessionId: string;        // "agent-session-{userId}"
  userId: string;           // From req.clerkUser.id
  clerkOrgId: string;       // From client.clerkOrgId
  sourceClientId: string;   // Original environment
  sandboxClientId: string;  // Cloned sandbox
  status: 'active' | 'promoted' | 'discarded';
  createdAt: string;
  updatedAt: string;
}
```

- **One session per user** (keyed by userId, not per conversation)
- Multiple chat conversations share the same sandbox
- Session ownership enforced: `session.userId === req.clerkUser.id`
- Session persists until promoted or discarded

---

## Frontend Auth Integration

The portal agent page (`app/agent/page.tsx`) uses Clerk auth that's already provided by the `ClerkProvider` in `layout.tsx`:

```typescript
const { getToken, orgId } = useAuth();  // From @clerk/nextjs

// On every chat request:
const token = await getToken();
fetch(`${AGENT_API_URL}/agent/chat`, {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,  // Clerk JWT
  },
  body: JSON.stringify({ messages, sourceClientId }),
});
```

No additional Clerk setup needed — the portal already has `ClerkProvider`, middleware, and `useAuth()`.

---

## Environment Variables

### Server SDK (add to .env)

```bash
# Already exists:
CLERK_SECRET_KEY=sk_live_xxxxx
CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
QUILL_PRIVATE_KEY=pk_xxxxx

# New (for agent):
OPENAI_API_KEY=sk-xxxxx
OPENAI_MODEL=gpt-5.2                           # optional, defaults to gpt-5.2
QUILL_METADATA_SERVER_URL=http://localhost:8080  # for clone/promote/diff (self-referencing)
```

### Portal Frontend (add to .env)

```bash
# New:
NEXT_PUBLIC_AGENT_API_URL=https://your-server-sdk-url  # points to server SDK
```
