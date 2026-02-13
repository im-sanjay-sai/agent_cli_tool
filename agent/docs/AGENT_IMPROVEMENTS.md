# Agent-Readiness Analysis & Improvement Plan

Deep analysis of whether an AI agent (Claude Code, Cursor, GPT) can effectively use this CLI from documentation alone, and what needs to change to make it perfect.

---

## Agent-Readiness Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Output format (JSON) | 10/10 | All commands return structured `{ ok, data/error }` JSON |
| Error handling | 9/10 | Structured errors with codes + suggestions; JSON.parse failures lose specificity |
| Confirmation prompts | 10/10 | Auto-bypass in non-TTY + `--force` everywhere |
| Dependency chains | 6/10 | Up to 4-deep chains; report ops require dashboard name first |
| File dependencies | 4/10 | 7 commands require temp files with no inline alternative |
| Naming consistency | 5/10 | VT commands split between ID and name; promote uses opaque clientIds |
| Tool descriptions (tools.ts) | 3/10 | Critically out of date -- says "ID" when CLI expects name, promote enums wrong |
| System prompt | 5/10 | Missing name-vs-ID guidance, required fields, dry-run, env awareness |
| Executor robustness | 7/10 | Timeout/stderr produce non-JSON output that confuses GPT |

---

## CRITICAL: tools.ts Is Out of Date

The tool definitions in `agent/src/lib/tools.ts` were never updated after the CLI was refactored from IDs to names. This causes **every dashboard operation to fail** because GPT passes IDs when the CLI expects names.

### Tools that say "ID" but CLI expects "name"

| Tool | Parameter | Description Says | CLI Actually Expects |
|------|-----------|-----------------|---------------------|
| `quill_dashboard_show` | `id` | "Dashboard ID" | `<name>` -- Dashboard name |
| `quill_dashboard_update` | `id` | "Dashboard ID" | `<name>` -- Dashboard name |
| `quill_dashboard_delete` | `id` | "Dashboard ID" | `<name>` -- Dashboard name |
| `quill_dashboard_set_filters` | `id` | "Dashboard ID" | `<name>` -- Dashboard name |
| `quill_report_list` | `dashboardId` | "Dashboard ID" | `--dashboard <name>` |
| `quill_report_create` | `dashboardId` | "Dashboard ID to add the report to" | `--dashboard <name>` |
| `quill_promote_dashboard` | `id` | "Dashboard ID" | `<name>` -- Dashboard name |
| `quill_promote_vt` | `id` | "Virtual table ID" | `<name>` -- VT name |

### toolToCommand mappings that are broken

| Tool | Mapping | Problem |
|------|---------|---------|
| `quill_dashboard_show` | `["dashboard", "show", a.id]` | Passes `a.id` but CLI arg is `<name>` |
| `quill_dashboard_update` | `["dashboard", "update", a.id]` | Same |
| `quill_dashboard_delete` | `["dashboard", "delete", a.id, "--force"]` | Same |
| `quill_dashboard_set_filters` | `["dashboard", "set-filters", a.id]` | Same |
| `quill_report_list` | `["report", "list", "--dashboard", a.dashboardId]` | Passes ID, CLI expects name |
| `quill_report_create` | `["report", "create", "--dashboard", a.dashboardId]` | Same |
| `quill_promote_dashboard` | `["promote", "dashboard", a.id]` + `--from a.from --to a.to` | `a.id` should be name; `a.from`/`a.to` are "staging"/"prod" but CLI expects client IDs |
| `quill_promote_report` | `["promote", "report", a.id]` + `--from --to` | Missing required `--dashboard <name>`; `from`/`to` same issue |
| `quill_promote_vt` | `["promote", "vt", a.id]` | `a.id` should be name |

### Promote tools have wrong enums

All 3 promote tools restrict `from`/`to` to `enum: ["staging", "prod"]`. But the CLI expects actual **client IDs** (MongoDB ObjectId strings like `65809ec85375e445ddc1990e`). GPT literally cannot pass the correct value -- the enum prevents it.

Additionally, `from` and `to` are not marked as `required` in the tool definitions, but the CLI makes them required options. GPT may omit them.

### `quill_promote_report` is missing `--dashboard` parameter entirely

The CLI requires `--dashboard <name>` but the tool definition has no `dashboard` or `dashboardName` parameter. This command will **always fail**.

### Fix needed

Every tool in `tools.ts` needs to be updated:
- Dashboard tools: rename `id` param to `name` with description "Dashboard name"
- Report tools: rename `dashboardId` to `dashboardName` with description "Dashboard name"
- Promote tools: change `from`/`to` from enum to string with description "Source/target environment client ID (from env list)"
- Promote tools: mark `from`/`to` as required
- Promote report: add `dashboardName` required param
- Promote dashboard/vt: rename `id` to `name`

All corresponding `toolToCommand` mappings need updating to use the correct param names.

---

## System Prompt Is Outdated

The system prompt (`agent/src/lib/system-prompt.ts`) has several issues:

### Missing critical guidance

1. **No mention of dashboard name vs ID.** The prompt says "Capture IDs from create operations" but dashboards are now referenced by name. GPT will try to use IDs and fail.

2. **No required report fields listed.** GPT needs to know: `name` (string), `baseSql` (SQL query string), `chartType` (one of: bar, line, area, table, metric, pie, column, gauge, scatter, funnel).

3. **No dry-run mode mention.** GPT can't tell users about dry-run or help them test safely.

4. **No environment awareness.** GPT should check which environment is active before creating/deleting resources. A user could accidentally modify production.

5. **No SQL dialect guidance.** The prompt doesn't mention the database type (Postgres, MySQL, etc.), so GPT may generate incompatible SQL.

6. **"report files" wording is misleading.** The dashboard setup workflow mentions "report files" but the agent sends inline JSON objects.

7. **No valid chartType values listed.** The tool schema has the enum but the system prompt doesn't reinforce it.

### Outdated workflow patterns

- "Creating a Dashboard with Reports" says to use `quill_dashboard_setup` with "report files" -- should say "inline report JSON objects"
- "Capture IDs from create operations" -- dashboards return names now, not just IDs
- "Reports belong to dashboards" says "you always need a dashboard ID" -- should say "dashboard name"

### Suggested system prompt additions

```
## Important: Dashboard Names vs IDs
- Dashboards are referenced by NAME, not MongoDB ID
- When you create or list dashboards, use the dashboard name for all subsequent operations
- Reports and virtual tables are still referenced by their IDs (from list commands)

## Environment Awareness
- Always check which environment is active before creating or modifying resources
- Use quill_env_show to check the current environment (staging or prod)
- Warn the user if they're about to modify production resources

## Report Required Fields
When creating reports, these fields are required:
- name: Report display name
- baseSql: The SQL query (will be sent as 'query' to the API)
- chartType: One of bar, line, area, table, metric, pie, column, gauge, scatter, funnel

## SQL Dialect
Write SQL compatible with the connected database. Use quill_schema_explore to understand the schema before writing queries.
```

---

## Executor Gaps

### Non-JSON output confuses GPT

When the CLI times out, the executor returns the raw string `"killed"` instead of structured JSON. When stderr contains a non-JSON error message, it gets passed directly to GPT. The system prompt promises "All tools return JSON" but this isn't always true.

**Fix:** Wrap all non-JSON output in the standard `{ ok: false, error: { code, message } }` envelope:

```javascript
// If output is not valid JSON, wrap it
try { JSON.parse(output); } catch {
  output = JSON.stringify({ ok: false, error: { code: "CLI_ERROR", message: output } });
}
```

### Timeout detection

The executor doesn't distinguish between a timeout kill and a regular failure. When `error.killed === true` and `error.signal === 'SIGTERM'`, it should return:

```json
{ "ok": false, "error": { "code": "TIMEOUT", "message": "Command timed out after 120 seconds" } }
```

### `error` field never reaches GPT

The `ExecutionResult` has an `error` field, but the chat route only sends `result.output` to GPT (line 98 of route.ts). If both stdout and stderr have content, GPT only sees stdout (which might be empty), and the stderr error is silently lost.

**Fix:** Merge `error` into the output, or include both in the tool message.

---

## File Dependencies Are Agent-Hostile

7 commands require `--file` flags with no inline alternative. This forces the agent executor to write temp files for every report create, report update, dashboard filter set, environment update, AI pivot, query build, and section order set.

The executor already handles temp files (see `writeTempFile()` and `toolsRequiringFile` in tools.ts), but this adds complexity, latency, and potential failure points.

### Commands that need inline alternatives

| Command | Current | Suggested Alternative |
|---------|---------|----------------------|
| `report create` | `--file <path>` (required) | Add `--json <inline-json>` |
| `report update` | `--file <path>` (required) | Add `--json <inline-json>` |
| `dashboard set-filters` | `--file <path>` (required) | Add `--json <inline-json>` |
| `dashboard set-section-order` | `--file <path>` (required) | Add `--json <inline-json>` |
| `env update` | `--file <path>` (required) | Add `--json <inline-json>` |
| `query build` | `--ast <path>` (required) | Add `--json <inline-json>` |
| `ai pivot` | `--file <path>` (required) | Add `--json <inline-json>` |

This would let agents pass data directly: `quill report create --dashboard "Sales" --json '{"name":"Revenue","baseSql":"SELECT...","chartType":"table"}'`

---

## Naming Inconsistency

Virtual table commands are split between IDs and names:

| Command | Uses | Notes |
|---------|------|-------|
| `vt show <id>` | ID | |
| `vt update <id>` | ID | |
| `vt delete <id>` | ID | |
| `vt test <id>` | ID | |
| `vt validate <id>` | ID | |
| `promote vt <name>` | **Name** | Inconsistent! |

An agent promoting a VT uses its name, but updating or testing the same VT requires looking up its ID first. This should be unified -- either all use names or all use IDs.

---

## Missing Commands for Common Agent Workflows

### High impact

1. **Global `report list`** -- Currently requires `--dashboard <name>`. No way to search for a report by name across all dashboards without iterating every dashboard.

2. **Name-based VT lookup** -- `vt show --name <name>` as alternative to `vt show <id>`.

3. **`env create`** -- Can list, show, update, delete environments but cannot create one.

4. **Inline JSON support** -- `--json` flag on all commands that require `--file` (see above).

### Medium impact

5. **`report clone`** -- Duplicate a report without delete+recreate.
6. **`report move`** -- Move a report between dashboards.
7. **`dashboard export`/`import`** -- Backup and restore full dashboard with reports.

---

## Chat Route Issues

### No total operation timeout

The chat route has no timeout on the entire request. With 15 tool rounds and 120s CLI timeout each, it could theoretically run for 30 minutes. Most reverse proxies and hosting platforms (Render, Vercel) will kill the request long before that.

### Error discards partial progress

If an OpenAI API call fails mid-conversation, the `catch` block returns an empty `toolCalls: []`, discarding all tool calls that succeeded before the failure. The partial progress should be preserved.

### No streaming

The entire multi-round operation is synchronous. For complex operations (5+ tool rounds), the user waits 30+ seconds with no feedback. Streaming would let the user see progress in real-time.

---

## Priority Implementation Order

### Phase 1: Fix tools.ts (highest impact -- everything breaks without this)

1. Update all dashboard tool descriptions from "ID" to "name"
2. Update all dashboard `toolToCommand` mappings from `a.id` to `a.name`
3. Fix promote tool `from`/`to` -- remove enum, change to string, mark required
4. Add `dashboardName` to promote report tool
5. Fix promote `toolToCommand` mappings
6. Rename report tools `dashboardId` to `dashboardName`

### Phase 2: Update system prompt

7. Add dashboard name vs ID guidance
8. Add required report fields
9. Add environment awareness
10. Add SQL dialect note
11. Mention dry-run mode
12. Fix workflow pattern descriptions

### Phase 3: Harden executor

13. Wrap non-JSON output in standard error envelope
14. Detect timeout and produce structured error
15. Merge stderr into output when stdout is empty

### Phase 4: Agent UX improvements

16. Add `--json <inline>` support to all `--file` commands
17. Unify VT commands to use names (matching promote)
18. Add global `report list-all` command
19. Preserve partial toolCalls on chat route errors

### Phase 5: Polish

20. Add streaming to chat route
21. Add route-level timeout (e.g., 5 minutes)
22. Add request body validation
23. Remove dead code in toolToCommand for dashboard_setup
