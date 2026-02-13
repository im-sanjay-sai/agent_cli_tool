# CLI Improvement Analysis: Making Quill CLI Agent-Ready

Deep analysis of the CLI from the perspective of an AI agent (Claude Code, Cursor, etc.) that needs to use this CLI by reading its help text and documentation.

---

## Executive Summary

The CLI has a strong foundation -- structured JSON output, consistent `{ok: true/false}` response envelope, error codes with suggestions, and a `withErrorHandling` wrapper. However, there are **critical documentation mismatches**, **inconsistent identifier types**, **undocumented JSON schemas**, and **silent failures** that would cause an AI agent to fail, guess wrong, or waste tokens.

**34 issues found: 6 Critical, 8 High, 12 Medium, 8 Low**

---

## Critical Issues (Agent Will Call Wrong Commands)

### C1. README shows wrong interface for `ai pivot`

**README says:**
```bash
quill ai pivot "Group revenue by product category" --report <id>
```

**Code actually expects:**
```bash
quill ai pivot --file pivot-config.json
```

No positional argument. No `--report` flag. Requires `--file` with structured JSON. An agent following the README will get a parse error every time.

**File:** `src/commands/ai.ts` line 69 vs README line 269

### C2. README shows wrong interface for `tenant validate`

**README says:**
```bash
quill tenant validate --file mapping.json
```

**Code actually expects:**
```bash
quill tenant validate --query "SELECT ..." --from-field tenant_id --to-field org_id
```

No `--file` flag. Three separate required options. Completely different invocation.

**File:** `src/commands/tenant.ts` line 72 vs README line 324

### C3. README shows `--from staging --to prod` but code expects client IDs

**README says:**
```bash
quill promote dashboard <id> --from staging --to prod
```

**Code expects:**
```bash
quill promote dashboard <name> --from <clientId> --to <clientId>
```

Three mismatches: argument is `<name>` not `<id>`, and `--from`/`--to` expect MongoDB client IDs not environment names.

**File:** `src/commands/promote.ts` line 22-24 vs README line 224-234

### C4. README shows `<dashboard-id>` but code takes `<name>`

All dashboard commands in README use `<dashboard-id>` but the actual CLI takes `<name>`:

```bash
# README says:
quill dashboard show <dashboard-id>

# Code expects:
quill dashboard show <name>
```

Affects: `show`, `update`, `delete`, `set-filters`, `set-section-order`

**File:** `src/commands/dashboard.ts` line 65-67 vs README line 154

### C5. `config set` corrupts numeric strings

```bash
quill config set --global token 1234567890
```

Stores `1234567890` as a **Number**, not a string. The Zod schema expects `z.string()` for tokens. Authentication will silently break.

**File:** `src/commands/config.ts` line 99-103

```typescript
else if (!isNaN(Number(value))) parsedValue = Number(value);
```

### C6. `confirmDeletion` auto-confirms in non-TTY (dangerous in CI)

When `process.stdin.isTTY` is false (agents, CI pipelines), delete commands proceed without confirmation even without `--force`:

```typescript
if (!process.stdin.isTTY) {
  return true;  // silently auto-confirms
}
```

An agent accidentally running `quill dashboard delete "Production Dashboard"` will succeed without any safety gate.

**File:** `src/utils/confirm.ts` line 12

---

## High Issues (Agent Automation Blockers)

### H1. Only `QUILL_API_TOKEN` env var exists

An agent/CI cannot configure the CLI purely through env vars:

| Setting | Env Var? | Workaround |
|---------|---------|------------|
| API Token | `QUILL_API_TOKEN` | -- |
| Server URL | **NO** | `quill config set --global serverUrl` |
| Query Endpoint | **NO** | `quill config set queryEndpoint` |
| Client ID | **NO** | `quill config set clientId` or `quill init --client-id` |
| Default Environment | **NO** | `quill config set --global defaultEnv` or `--env` flag |

**Needed:** `QUILL_SERVER_URL`, `QUILL_QUERY_ENDPOINT`, `QUILL_CLIENT_ID`, `QUILL_ENV`

### H2. `--file` options don't document expected JSON shape

Every command with `--file` says something vague:

| Command | Help text |
|---------|-----------|
| `dashboard create --file` | "JSON file with full dashboard config" |
| `report create --file` | "JSON file with report config" |
| `report update --file` | "JSON file with updates" |
| `env update --file` | "JSON file with updates" |
| `dashboard set-filters --file` | "JSON file with filters" |
| `dashboard set-section-order --file` | "JSON file with section order" |
| `ai pivot --file` | Best -- lists field names in description |

An agent has no way to know the JSON schema without reading source code.

### H3. Inconsistent `<id>` vs `<name>` across resource types

| Resource | CRUD commands | Promote commands |
|----------|--------------|-----------------|
| Dashboard | `<name>` | `<name>` |
| Report | `<id>` | `<id>` |
| Virtual Table | `<id>` | `<name>` |

Virtual tables use `<id>` for CRUD but `<name>` for promote. An agent working with VTs needs to track both and know which to use where.

### H4. No `--file` input validation on update commands

6 commands pass raw JSON directly to the API with no validation:

- `dashboard update --file`
- `dashboard set-section-order --file`
- `report update --file`
- `env update --file`
- `query run --filters`
- `report run --filters`

Invalid JSON shapes silently pass through to the API and produce cryptic server errors.

### H5. `promote` commands lack `--dry-run`

Promotion overwrites resources in the target environment. There's `--skip-warning` and `--auto-resolve` but no `--dry-run` to preview what would change. An agent cannot safely test a promotion.

### H6. `schema test-connection` returns `ok: true` on connection failure

```json
{ "ok": true, "data": { "connected": false, "message": "Connection refused" } }
```

Exit code 0, `ok: true`. An agent checking `ok` or exit code thinks the connection succeeded. Only `data.connected` reveals the truth.

**File:** `src/commands/schema.ts` line 96-101

### H7. `query run --auto-fix` failure returns `ok: true`

When both original and AI-fixed SQL fail, the response is `ok: true` with `data.autoFix.resolved: false` and empty rows. An agent would need to check `data.autoFix.resolved` specifically.

**File:** `src/commands/query.ts` line 50-72

### H8. Example JSON files don't match current code

`examples/report.json` uses `baseSql` but the API now expects `query`/`queryString`. The examples haven't been updated to reflect the field name changes made in the audit fixes.

---

## Medium Issues (Code Quality / Edge Cases)

### M1. `--json` flag is a no-op

The `--json` flag defaults to `true` and is never checked. Output is always JSON. There's no human-readable mode. The flag confuses agents into thinking it needs to be explicitly passed.

**File:** `src/cli.ts` line 24

### M2. ~100 lines of dead code in formatter.ts

`prettyPrint()`, `formatTable()`, `formatObject()`, `outputSuccess()`, `info()`, `warn()` are defined but never called by any command.

**File:** `src/output/formatter.ts` lines 30-176

### M3. Chalk ANSI codes in stderr not suppressed for non-TTY

`verbose()`, `warn()`, `info()` use chalk colors on stderr. When piped, ANSI escape codes pollute log files.

**File:** `src/output/formatter.ts` lines 52-73

### M4. `fromUnknown()` matches 'fetch' substring too broadly

```typescript
if (error.message.includes('fetch'))
```

Any error containing "fetch" (e.g., "failed to fetch user preferences") gets misclassified as `NETWORK_ERROR`.

**File:** `src/output/errors.ts` line 169

### M5. `successDeleted` wraps dashboard name as `id`

`successDeleted(name, 'dashboard', ...)` produces `{ deleted: { id: "My Dashboard" } }`. The `name` is semantically not an `id`.

**File:** `src/commands/dashboard.ts` line 180

### M6. `getMergedConfig().token` skips env var check

`getMergedConfig()` resolves token from flag or config file but not `QUILL_API_TOKEN`. Code calling `getMergedConfig().token` directly would miss env var tokens.

**File:** `src/core/config.ts` line 283

### M7. `as any` casts in `config set` bypass type safety

```typescript
await setGlobalConfigValue(key as any, parsedValue as any);
```

**File:** `src/commands/config.ts` lines 111, 118

### M8. `vt create` silently swallows column extraction failure

If `queryVirtualTable()` fails, the VT is created without columns and no warning is emitted.

**File:** `src/commands/virtual-table.ts` lines 98-106

### M9. `dashboard create --name` silently ignored when `--file` is provided

`--name` is required but when `--file` is also given, `--name` is discarded. No warning.

**File:** `src/commands/dashboard.ts` lines 90-97

### M10. Missing `env` in meta for schema/tenant commands

`schema`, `tenant`, and `environment` commands don't include the environment in their response metadata, unlike dashboard/report/VT commands.

### M11. `--env` flag collision between global and `init`

Global `--env` means "target this environment for this operation." `init --env` means "set default environment persistently." Different semantics, same flag name.

**File:** `src/cli.ts` line 23 vs `src/commands/init.ts` line 16

### M12. Version hardcoded instead of reading from package.json

```typescript
.version('0.1.0')
```

Should read from `package.json` so it stays in sync.

**File:** `src/cli.ts` line 22

---

## Low Issues (Nice-to-Have)

### L1. `login` without `--token` is interactive-only

Device code flow opens browser and uses spinner. No warning in `--help` that this is agent-incompatible.

### L2. `logout` has no confirmation

Silently clears all credentials without `--force` or any prompt.

### L3. `promote` commands lack `--force` for destructive overwrites

`--skip-warning` exists but isn't the same as a confirmation gate.

### L4. No `--file-template` or `--example` subcommand

No way for an agent to programmatically discover the expected JSON format.

### L5. No `quill status` command

No single command to check: am I authenticated? what environment? what endpoint? Is the connection working? An agent must run 3+ commands to diagnose issues.

### L6. No `quill dashboard list --names-only`

Listing dashboards returns full objects. No lightweight mode to just get names (the `dashnames` task exists in the SDK but isn't exposed).

### L7. No shell completion support

No `--completions` or `install-completions` command for bash/zsh.

### L8. No `--timeout` flag

Global 30s timeout is hardcoded. No way to increase for slow operations.

---

## Recommendations: Making a Perfect Agent-Ready CLI

### Priority 1: Fix Documentation (30 min)

1. **Update README** to match actual command interfaces (C1-C4)
2. **Update example JSON files** to use current field names (`query` not `baseSql`)
3. **Add JSON schema hints** to every `--file` option description
4. **Document non-interactive setup**: "For agents/CI, set `QUILL_API_TOKEN` env var. Do not use `quill login`."

### Priority 2: Agent Safety (1-2 hours)

5. **Fix `config set` numeric coercion** -- always store strings for string fields (C5)
6. **Change non-TTY delete behavior** to fail without `--force` instead of auto-confirming (C6)
7. **Return `ok: false` for actual failures** -- `test-connection` when not connected, `--auto-fix` when not resolved (H6, H7)
8. **Emit warnings** for silent swallows (VT column extraction, `--name` override) (M8, M9)

### Priority 3: Env Var Support (1 hour)

9. **Add env vars**: `QUILL_CLIENT_ID`, `QUILL_QUERY_ENDPOINT`, `QUILL_SERVER_URL`, `QUILL_ENV`
10. **Read env vars in `getMergedConfig()`** before config files
11. **Document all env vars** in README and `--help`

### Priority 4: Consistency & Clean-up (2-3 hours)

12. **Standardize identifiers** -- either accept both `<id>` and `<name>` on every command, or document clearly which is which
13. **Add input validation** on all `--file` update commands
14. **Remove dead code** (~100 lines in formatter.ts)
15. **Remove `--json` flag** or implement actual text mode
16. **Read version from package.json**
17. **Add `--dry-run`** to promote commands
18. **Add `quill status`** command for quick agent diagnostics

### Priority 5: Agent DX Enhancements (future)

19. **Add `--file-template <command>`** to generate example JSON
20. **Add `--output-fields`** to select specific response fields
21. **Add `quill dashboard list --names-only`** (uses `dashnames` task)
22. **Support `QUILL_*` env vars for all config** for zero-file container deployment
