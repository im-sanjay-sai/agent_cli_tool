# Quill CLI — CLAUDE.md

## What This Is

Quill CLI (`@quill/cli`) is a command-line tool for managing Quill BI resources: dashboards, reports, virtual tables, queries, environments, and AI-powered SQL operations. All output is JSON (stdout), human messages go to stderr. Designed to be both human-usable and machine-parseable (LLM/agent-friendly).

## Project Structure

```
cli/
├── src/
│   ├── index.ts              # Entry point (shebang + parse)
│   ├── cli.ts                # Commander.js setup, registers all 13 command groups
│   ├── commands/             # One file per command group
│   │   ├── auth.ts           # login, logout, whoami
│   │   ├── config.ts         # config init/get/set
│   │   ├── init.ts           # Unified init (auth + project config + connection test)
│   │   ├── dashboard.ts      # dashboard CRUD + setup (compound create)
│   │   ├── report.ts         # report CRUD + run + validate
│   │   ├── virtual-table.ts  # vt CRUD + test + query + validate
│   │   ├── query.ts          # SQL run/parse/build/explain (with --auto-fix)
│   │   ├── ai.ts             # AI query/fix/pivot/edit/search-docs
│   │   ├── tenant.ts         # Tenant mapping operations
│   │   ├── environment.ts    # env list/show/switch/update/delete
│   │   ├── promote.ts        # Cross-environment promotion
│   │   ├── status.ts         # Status info
│   │   └── template.ts       # Template command
│   ├── core/                 # Infrastructure layer
│   │   ├── auth.ts           # Device code flow + token refresh + static token
│   │   ├── client.ts         # API client (30+ task methods via quillFetch)
│   │   ├── config.ts         # Global (~/.quill/) + project (.quill/) config
│   │   └── validator.ts      # Schema validation
│   ├── models/               # Zod schemas
│   │   ├── dashboard.ts      # Dashboard create/filter schemas
│   │   ├── report.ts         # Report schemas (60+ field types)
│   │   ├── virtual-table.ts  # VT schemas
│   │   ├── filter.ts         # Filter schemas
│   │   └── pivot.ts          # Pivot config schemas
│   ├── output/               # Structured output
│   │   ├── formatter.ts      # JSON output, verbose logging, withErrorHandling()
│   │   ├── errors.ts         # CliError class, 10 error factories, Zod error conversion
│   │   └── success.ts        # success(), successList(), successCreated(), etc.
│   └── utils/
│       ├── ast.ts            # Basic SQL structure validation (SELECT-only guard)
│       ├── sql.ts            # SQL parsing helpers
│       ├── id.ts             # ID format validation
│       └── confirm.ts        # Interactive deletion confirmation
├── tests/
│   └── validation/
│       ├── validator.test.ts # Schema validation tests
│       └── sql.test.ts       # SQL validation tests
├── examples/                 # Example JSON files for commands
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Key Architecture Decisions

### Single API Endpoint Pattern
All operations go through `POST /v1/sdk?task=<task_name>`. The `task` query param selects the operation. There is no REST resource routing — everything is RPC-style via one endpoint. This mirrors how the frontend SDK works.

### JSON-Only Output
- **stdout**: Always valid JSON (success or error envelope)
- **stderr**: Verbose logs (`--verbose`) and human UI (spinners, chalk messages during login)
- This makes the CLI pipeable and LLM-parseable

### Two Config Files
- **Global** `~/.quill/config.json`: Auth tokens, server URL, org info
- **Project** `.quill/config.json`: clientId, queryEndpoint, queryHeaders (checked into VCS)
- Merge strategy: project overrides global, env vars are fallback

### Auth Flow
Token precedence: `QUILL_API_TOKEN` env var > `--token` flag > stored config.
Two auth methods: device code flow (interactive, Clerk-based) and static API token.
Tokens auto-refresh when expired (60s buffer).

## Common Patterns

### Command Registration
Every command file exports `registerXxxCommands(program: Command)`. Inside, commands follow this pattern:
```typescript
cmd.command('subcommand')
  .action(withErrorHandling(async (options) => {
    await requireAuth();                    // Auth gate
    const response = await apiCall(...);    // client.ts method
    if (response.error) throw apiError(response.error);  // Error mapping
    output(success(data));                  // JSON output
  }));
```

### Error Handling
- `withErrorHandling()` wraps all command actions — catches errors, converts to JSON, sets exit code
- `apiError(msg)` parses error message text to determine error type (NOT_FOUND, AUTH_REQUIRED, etc.)
- `fromUnknown(err)` converts any thrown value to CliError
- Error factories: `notFound()`, `invalidInput()`, `authRequired()`, `networkError()`, etc.

### Response Envelope
```json
// Success
{ "ok": true, "data": {...}, "warnings": [], "meta": { "source": "remote", "timestamp": "..." } }
// Error
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "suggestions": [...] } }
```

## Build & Run

```bash
npm run build          # tsc + chmod +x
npm run dev            # tsx src/index.ts (no build needed)
npm run test           # vitest run
npm run test:watch     # vitest watch mode
```

Node.js >= 18 required (uses native `fetch`).

## Dependencies

| Package | Purpose |
|---------|---------|
| commander | CLI framework |
| zod | Schema validation |
| chalk | Terminal colors (stderr only) |
| ora | Spinner UI (login flow) |
| open | Open browser (device code auth) |
| conf | Listed but not used directly (config is manual JSON I/O) |

## Improvement Suggestions

### High Priority

1. **`conf` dependency is unused** — Config management in `core/config.ts` uses raw `fs.readFile`/`fs.writeFile` with manual JSON parsing. The `conf` package is listed in `package.json` but never imported. Remove it to reduce bundle size.

2. **Missing `requireAuth()` in `getAuthState()`** — The `whoami` command doesn't call `requireAuth()` (which is correct — it should work unauthenticated), but `getAuthState()` doesn't attempt token refresh for expired tokens. A user with an expired-but-refreshable token will see `authenticated: false` from `whoami` but subsequent commands would auto-refresh and work. This is confusing.

3. **API error responses returned as HTTP 200** — `quillFetch()` handles non-200 status codes well, but most API errors come back as HTTP 200 with `{ error: "..." }`. The `apiError()` function parses error message strings with substring matching to guess the error type. This is fragile — a message like "field is required for validation" would match `INVALID_INPUT` because of "required", which might not be the intent.

4. **No retry logic for transient failures** — Network errors and timeouts fail immediately. A simple retry with exponential backoff for 5xx/timeout errors would improve reliability, especially for the proxy chain path (CLI -> user endpoint -> Quill Cloud).

5. **`dashboard setup` rollback is incomplete** — On failure, it deletes the dashboard but doesn't clean up reports that were already created. If report 3 of 5 fails, reports 1-2 remain orphaned.

### Medium Priority

6. **Heavy type casting** — API responses are typed as `Record<string, unknown>` and constantly cast with `as`. Consider defining response type interfaces for each task (e.g., `DashboardListResponse`, `ReportCreateResponse`) to catch type errors at compile time.

7. **No client-side rate limiting** — Rapid sequential commands (scripts, agents) can hammer the API. A simple token bucket or semaphore in `quillFetch()` would prevent accidental abuse.

8. **`--limit` and `--offset` are client-side** — `dashboard list` and `env list` fetch all items then slice in-memory. For large datasets, this wastes bandwidth. Consider passing pagination params to the API if supported.

9. **`query explain` wraps SQL naively** — It prepends `EXPLAIN ` to the user's SQL. This fails for CTEs (`WITH ... SELECT`) on some databases. Should at minimum handle CTEs.

10. **File reading has no size guard** — Commands like `--file <path>` read entire files with `fs.readFile()`. A malformed or very large file will consume memory. Consider checking file size before reading.

### Low Priority

11. **Test coverage is thin** — Only schema validation and SQL parsing have tests. No tests for commands, API client, auth flow, or config management. Consider adding at least integration tests for the command registration and error handling paths.

12. **`getTokenFn()` is unused** — Defined in `auth.ts` but never called anywhere. Dead code.

13. **`ensureDir` has redundant EEXIST check** — `fs.mkdir({ recursive: true })` already handles existing directories. The try/catch for EEXIST is unnecessary.

14. **Missing `.quill` in `.gitignore` guidance** — Project config (`.quill/config.json`) is meant to be committed, but there's no `.gitignore` template or documentation about what to include/exclude.

15. **`normalizedDatabaseType` only handles postgres alias** — Other database types pass through as-is. If the API expects specific values (e.g., "mysql" not "MySQL"), other types could also benefit from normalization.
