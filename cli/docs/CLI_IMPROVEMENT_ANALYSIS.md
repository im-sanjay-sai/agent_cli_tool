# CLI Improvement Analysis: Remaining Issues

Updated analysis after all Priority 1-5 fixes have been applied. This document tracks only **issues that still exist** in the current codebase.

**Previous status:** 34 issues found, 19 of 22 recommendations implemented.

**Current status:** 13 remaining issues (1 Critical, 5 Medium, 7 Low)

---

## Critical

### 1. `--env` Commander default breaks the entire environment cascade

The global flag in `cli.ts` has a default value of `'staging'`:

```typescript
.option('--env <environment>', 'Target environment (staging|prod)', 'staging')
```

Commander sets `opts.env` to `'staging'` even when the user doesn't pass `--env`. Then `getCurrentEnv()` checks:

```typescript
if (opts.env && (opts.env === 'staging' || opts.env === 'prod')) {
  return opts.env as Environment;  // always hits this branch
}
```

This is **always true** because the default guarantees `opts.env === 'staging'`. The entire fallback chain is dead code:
- `QUILL_ENV` env var -- never checked
- Project config `currentEnv` -- never checked
- Global config `defaultEnv` -- never checked
- `quill env switch prod` -- has no effect (next command reverts to staging)

**Fix:** Remove the Commander default. Use `undefined` as the absence marker:

```typescript
.option('--env <environment>', 'Target environment (staging|prod)')
```

Then in `getCurrentEnv()`, only use `opts.env` when it's explicitly set.

---

## Medium

### 2. `fromUnknown()` 'fetch' substring match too broad

```typescript
if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch')) {
```

Any error containing "fetch" (e.g., "failed to fetch column metadata") gets misclassified as `NETWORK_ERROR`.

**Fix:** Match `'Failed to fetch'` or `'TypeError: fetch'` instead of bare `'fetch'`.

**File:** `src/output/errors.ts` line 169

### 3. `successDeleted` wraps dashboard name as `id`

`successDeleted(name, 'dashboard', ...)` produces `{ deleted: { id: "Sales Analytics" } }`. Dashboards use names, not IDs. Semantically wrong.

**Fix:** Either rename the field to `identifier` or add a `name` field alongside `id`.

**File:** `src/output/success.ts` line 95, `src/commands/dashboard.ts` line 195

### 4. `as any` casts in `config set`

```typescript
await setGlobalConfigValue(key as any, parsedValue as any);
await setProjectConfigValue(key as any, parsedValue as any);
```

Bypasses type safety. Could store wrong types.

**Fix:** Use a validated key map or type assertion with runtime check.

**File:** `src/commands/config.ts` lines 111, 118

### 5. Missing `env` in `meta` for schema/tenant/environment commands

Dashboard, report, and VT commands include `{ source: 'remote', env }` in metadata. But schema, tenant, and environment commands only include `{ source: 'remote' }` with no `env` field. An agent checking `meta.env` to verify the target environment gets `undefined`.

**Fix:** Add `const env = await getCurrentEnv()` and include in meta for all schema/tenant/env commands.

### 6. `--env` flag collision between global and `init`

Global `--env` means "target this environment for this operation." Init's `--env` means "set default environment persistently." Same flag, different semantics. `quill --env prod init` is ambiguous.

**Fix:** Rename init's flag to `--default-env`.

**File:** `src/cli.ts` line 30 vs `src/commands/init.ts` line 16

---

## Low

### 7. `login` without `--token` has no non-TTY guard

Calling `quill login` without `--token` starts the device code flow (opens browser, hangs). No `isTTY` check to fail fast in non-interactive environments. README warns about it, but the CLI itself doesn't protect agents.

**Fix:** Add `if (!process.stdin.isTTY && !options.token)` check that returns structured error.

**File:** `src/commands/auth.ts`

### 8. No `--timeout` global flag

Timeout is hardcoded to 30s in `client.ts`. No way to increase for slow operations.

**Fix:** Add `--timeout <ms>` global flag, pass to `quillFetch`.

### 9. No input validation on update commands

`dashboard update --file`, `report update --file`, `env update --file` pass raw JSON to the API with no validation. Malformed payloads produce cryptic server errors.

**Fix:** Add Zod schemas for update payloads, or at minimum validate the JSON is a valid object.

### 10. README lists phantom `--json` flag

The global flags table in README still shows `--json` which was removed. An agent might try to pass it.

**Fix:** Remove `--json` row from the global flags table in README.

### 11. `template` command not wrapped in `withErrorHandling`

Only command not using the error wrapper. Unexpected errors produce unstructured stack traces instead of JSON.

**Fix:** Wrap the action in `withErrorHandling`.

**File:** `src/commands/template.ts` line 82

### 12. `config set queryHeaders` is unusable

`queryHeaders` is `z.record(z.string())` (an object) but `config set` stores a single string value. Running `quill config set queryHeaders '{"X-Custom":"value"}'` stores the literal string, not the parsed object. Fails Zod validation on next read.

**Fix:** Parse JSON strings for object-type config keys, or remove `queryHeaders` from settable keys.

**File:** `src/commands/config.ts` line 114

### 13. `--env` accepts invalid values silently

No Commander-level validation. `--env development` is accepted but falls through silently. (Currently masked by Issue 1's default stomping, but would surface once Issue 1 is fixed.)

**Fix:** Add `.choices(['staging', 'prod'])` to the Commander option.

---

## What's Been Completed (removed from previous version)

All of these were in the original 34-issue analysis and have been **fully fixed**:

- C1-C4: README/code mismatches for ai pivot, tenant validate, promote, dashboard args
- C5: config set numeric coercion
- C6: non-TTY auto-confirm on delete
- H1: Missing env vars (QUILL_CLIENT_ID, QUILL_QUERY_ENDPOINT, etc.)
- H2: Undocumented --file JSON schemas
- H5: promote --dry-run
- H6: test-connection ok:true on failure
- H7: auto-fix ok:true on failure
- H8: Example JSON outdated
- M1: --json no-op flag
- M2: Dead code in formatter.ts
- M3: Chalk ANSI in non-TTY stderr
- M6: getMergedConfig token skips env var
- M8: VT create column extraction silent failure
- M9: Dashboard --name override silent
- M12: Hardcoded version
- L3: Promote --skip-warning
- L4: --file-template command
- L5: quill status command
- L6: dashboard list --names-only

---

## Recommended Fix Order

### Must fix (blocks agent reliability)

1. **Issue 1**: Remove `--env` Commander default -- this breaks `QUILL_ENV`, `env switch`, and project config

### Should fix (improves agent experience)

2. **Issue 10**: Remove `--json` from README global flags table
3. **Issue 2**: Tighten `fromUnknown()` 'fetch' match
4. **Issue 5**: Add `env` to meta for schema/tenant/env commands
5. **Issue 11**: Wrap `template` command in `withErrorHandling`
6. **Issue 13**: Add `.choices()` validation to `--env`
7. **Issue 6**: Rename init's `--env` to `--default-env`

### Nice to have

8. **Issue 3**: Fix `successDeleted` name-as-id semantic
9. **Issue 4**: Remove `as any` in config set
10. **Issue 7**: Add non-TTY guard to `login`
11. **Issue 8**: Add `--timeout` flag
12. **Issue 9**: Add validation to update commands
13. **Issue 12**: Fix `config set queryHeaders` JSON parsing
