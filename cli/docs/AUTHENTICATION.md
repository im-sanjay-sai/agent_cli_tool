# CLI Login & Authentication

## Context

Quill is a BI product where two types of power users interact with the system:

- **Developers** -- work with the frontend/backend SDKs and use the CLI from their IDE (Cursor, etc.)
- **Data people** -- work in the Quill BI platform UI in the browser

The CLI needs authentication that works for both interactive developer use (from a terminal or Cursor) and non-interactive automation (CI/CD pipelines, GitHub Actions).

Quill uses **Clerk** as its authentication provider. The React SDK and Admin library authenticate via `getAuthorizationToken()` callbacks that return Clerk JWTs. The CLI needs to obtain the same kind of token.

---

## Decisions Made

### Two Authentication Methods

We implemented two methods that cover all use cases:

| Method | Command | Use Case | Token Type |
|--------|---------|----------|------------|
| **Device Code Flow** | `quill login` | Developers in terminal/Cursor | Clerk JWT (short-lived) + refresh token |
| **API Token** | `quill login --token <token>` | CI/CD, GitHub Actions, scripts | Long-lived API key |

### Why Device Code Flow (not OAuth redirect)

Standard OAuth authorization code flow requires a localhost callback server, which:
- Doesn't work well in remote/containerized dev environments
- Has port conflict issues
- Requires complex state management

Device code flow is the industry standard for CLIs (used by GitHub CLI, Azure CLI, Vercel CLI) because:
- No localhost server needed
- Works in any environment (SSH, containers, Cursor)
- Simple user experience: open browser, approve, done
- The CLI never sees the user's password

### Token Storage

All credentials are stored in `~/.quill/config.json` (the global config file):

```json
{
  "token": "eyJhbG...",
  "refreshToken": "rt_abc123...",
  "tokenExpiresAt": "2025-02-06T13:00:00.000Z",
  "clerkOrgId": "org_abc123",
  "email": "developer@company.com",
  "orgName": "Acme Corp",
  "defaultEnv": "staging"
}
```

For API token auth (`--token`), only the `token` field is set. The refresh/expiry/identity fields are cleared.

### Token Resolution Precedence

When any CLI command needs a token, resolution follows this order:

```
1. QUILL_API_TOKEN environment variable  (CI/CD)
2. --token CLI flag                      (one-off override)
3. ~/.quill/config.json stored token     (from quill login)
   └─ If expired + refresh token exists → auto-refresh transparently
   └─ If expired + no refresh token    → fail, prompt re-login
```

This means:
- CI/CD pipelines use env vars and never touch the config file
- Developers run `quill login` once and stay authenticated for weeks
- The `--token` flag overrides everything for one-off commands

### Auto-Refresh

When the stored access token is expired (checked 60 seconds before actual expiry to avoid race conditions), the CLI automatically calls the refresh endpoint. If the refresh succeeds, the new token is stored and the command proceeds. The user never notices.

If the refresh fails (e.g., refresh token revoked), the CLI throws `AUTH_REQUIRED` with a suggestion to run `quill login`.

---

## What the CLI Implements (done)

### `core/auth.ts`

| Function | Description |
|----------|-------------|
| `startDeviceCodeFlow()` | Calls `POST /cli/auth/device-code`, returns device code + verification URL |
| `pollForToken(deviceCode, interval, expiresIn)` | Polls `POST /cli/auth/token` every N seconds until approved or expired |
| `refreshAccessToken(refreshToken)` | Calls `POST /cli/auth/refresh` to get a new access token |
| `getToken()` | Resolves token with precedence (env > flag > config) + auto-refresh |
| `loginWithToken(token)` | Stores a static API token |
| `loginWithDeviceCode(tokenResponse)` | Stores access token + refresh token + identity from device flow |
| `logout()` | Clears all auth fields from config |
| `getAuthState()` | Returns auth status including email, orgName, clerkOrgId |
| `requireAuth()` | Throws `AUTH_REQUIRED` if no valid token found |

### `commands/auth.ts`

| Command | Behavior |
|---------|----------|
| `quill login` | Starts device code flow: requests code, opens browser, polls with spinner |
| `quill login --token <t>` | Stores static API token directly |
| `quill logout` | Clears all stored credentials |
| `quill whoami` | Shows auth status, email, org name, token source |

### User Experience for Device Code Flow

```
$ quill login

  Opening browser to authenticate...

  If the browser doesn't open, visit:
  https://app.quill.co/cli/auth?code=ABC-123

  Your code: ABC-123

⠋ Waiting for approval...
✔ Authenticated as developer@company.com (Acme Corp)
{"ok":true,"data":{"message":"Successfully logged in","method":"device_code","email":"developer@company.com",...}}
```

---

## What the Backend Needs to Implement

The CLI is ready. The following 3 endpoints + 1 web page need to be built on the Quill backend.

### Endpoint 1: `POST /cli/auth/device-code`

Generates a device code for the CLI to begin the auth flow.

**Request:**
```json
{}
```

**Response:**
```json
{
  "deviceCode": "dc_a1b2c3d4e5f6g7h8",
  "userCode": "ABC-123",
  "verificationUrl": "https://app.quill.co/cli/auth",
  "interval": 5,
  "expiresIn": 600
}
```

**Backend logic:**
1. Generate a random `deviceCode` (internal identifier, not shown to user)
2. Generate a human-readable `userCode` (e.g., 6-8 alphanumeric characters, shown to user)
3. Store the mapping `{ deviceCode, userCode, status: 'pending', createdAt }` in a temporary store (Redis or MongoDB TTL collection)
4. Set TTL to `expiresIn` seconds (recommended: 600 = 10 minutes)
5. Return the device code, user code, verification URL, polling interval, and expiry

**Design notes:**
- `userCode` should be short and easy to type (uppercase letters + digits, no ambiguous chars like 0/O, 1/I/l)
- `deviceCode` should be a longer random string (UUID or similar) since it's not user-facing
- `interval` is the minimum seconds between poll requests (5 is standard)

### Endpoint 2: `POST /cli/auth/token`

The CLI polls this endpoint to check if the user has approved the device code.

**Request:**
```json
{
  "deviceCode": "dc_a1b2c3d4e5f6g7h8"
}
```

**Response (pending -- user hasn't approved yet):**
```json
{
  "status": "pending"
}
```

**Response (success -- user approved):**
```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "rt_x9y8z7w6v5u4t3s2",
  "expiresAt": "2025-02-06T14:00:00.000Z",
  "clerkOrgId": "org_abc123",
  "email": "developer@company.com",
  "orgName": "Acme Corp"
}
```

**Response (expired -- code timed out):**
```json
{
  "status": "expired"
}
```

**Backend logic:**
1. Look up `deviceCode` in the temporary store
2. If not found or TTL expired: return `{ status: 'expired' }`
3. If found and `status === 'pending'`: return `{ status: 'pending' }`
4. If found and `status === 'approved'`:
   - Generate a Clerk JWT (or equivalent API token) for the user who approved
   - Generate a refresh token and store it server-side
   - Return the full token response with user identity
   - Delete the device code from the temporary store (one-time use)

**Design notes:**
- Rate-limit this endpoint per `deviceCode` to the `interval` value
- The `accessToken` should be a Clerk JWT or a token that the existing `/v1/sdk` endpoint accepts
- The `clerkOrgId` lets the CLI know which organization the user belongs to
- The `email` and `orgName` are for display purposes only (shown by `quill whoami`)

### Endpoint 3: `POST /cli/auth/refresh`

Exchanges a refresh token for a new access token.

**Request:**
```json
{
  "refreshToken": "rt_x9y8z7w6v5u4t3s2"
}
```

**Response (success):**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "rt_new_a1b2c3d4e5f6",
  "expiresAt": "2025-02-06T15:00:00.000Z"
}
```

**Response (failure -- refresh token revoked/expired):**
```
HTTP 401 Unauthorized
```

**Backend logic:**
1. Look up the refresh token in the server-side store
2. If not found or revoked: return 401
3. If valid:
   - Generate a new access token (Clerk JWT or equivalent)
   - Optionally rotate the refresh token (recommended for security)
   - Return the new tokens
4. If rotating refresh tokens: invalidate the old one

**Design notes:**
- Refresh tokens should be long-lived (30-90 days)
- Implement refresh token rotation (issue new refresh token on each use, invalidate old one) to limit damage if a refresh token is leaked
- Store refresh tokens server-side (MongoDB) so they can be revoked (e.g., when user changes password, org admin revokes access)

### Web Page: CLI Auth Approval Page

A page at the `verificationUrl` (e.g., `https://app.quill.co/cli/auth`) where the user:

1. Lands on the page (URL includes `?code=ABC-123`)
2. If not logged in: redirected to Clerk login first, then back to this page
3. Sees a confirmation screen: "Approve CLI access for code ABC-123?"
4. Clicks "Approve"
5. Backend updates the device code status from `pending` to `approved` and associates it with the authenticated user's Clerk session
6. Page shows "CLI authenticated. You can close this tab."

**Design notes:**
- If the user is already logged into Quill in the browser (Clerk session exists), this is a one-click approval
- If not logged in, Clerk handles the login flow, then redirects back to the approval page
- The approval page should show what the CLI will have access to (the user's org, environments, etc.)
- The `userCode` from the URL should be validated against the backend before showing the approval button
- Multi-org: if the user belongs to multiple Clerk orgs, the approval page should let them pick which org the CLI connects to

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Token stored on disk | `~/.quill/config.json` is user-readable only (standard for CLI tools). Tokens in env vars are preferred for CI/CD. |
| Refresh token leaked | Server-side revocation via the MongoDB store. Rotate on each use. |
| Device code brute force | Short `userCode` but time-limited (10 min). Rate-limit the poll endpoint. |
| Man-in-the-middle | All endpoints use HTTPS. |
| Token in shell history | `quill login` (device flow) avoids tokens in shell history. `--token` flag does appear in history -- recommend env vars for CI/CD. |

---

## Open Questions for Discussion

1. **Token type**: Should the CLI receive the same Clerk JWT that the React SDK uses, or a separate long-lived "CLI token" type? Clerk JWTs expire every 60 minutes by default, which means frequent auto-refreshes. A longer-lived CLI-specific token (e.g., 24 hours) would reduce refresh overhead.

2. **Multi-org**: If a user belongs to multiple Clerk organizations, the device code flow needs a way to select which org to authenticate against. Options:
   - Let the user pick on the approval web page (recommended)
   - Add a `--org` flag to `quill login`
   - Default to the user's primary org, let them switch with `quill env switch`

3. **API key generation**: For the `quill login --token` flow, where does the user get the token? Options:
   - Generated in the Quill BI platform UI (Settings > API Keys)
   - Generated via `quill token create` CLI command (requires device-code auth first)

4. **Token scoping**: Should CLI tokens have the same permissions as the user's browser session, or a more restricted scope (e.g., read-only, specific environments only)?

5. **Revocation UI**: Should there be a way to see and revoke active CLI sessions from the Quill BI platform? (e.g., Settings > Active Sessions > "CLI on Sanjay's MacBook" > Revoke)
