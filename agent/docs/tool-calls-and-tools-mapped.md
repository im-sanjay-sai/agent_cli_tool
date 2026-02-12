# Tool Calls & CLI Commands Mapping

> Complete reference of every OpenAI tool call the agent can make, the CLI command it maps to, parameters, and notes on special handling.

---

## How It Works

```
User message → GPT picks a tool (e.g. quill_dashboard_list)
  → executor.ts maps it to CLI args: ["dashboard", "list"]
  → spawns: quill dashboard list --json
  → CLI output returned as tool result to GPT
  → GPT summarizes for the user
```

Key files:
- **Tool definitions** (what GPT sees): `src/lib/tools.ts`
- **Tool → CLI mapping** (how args are built): `src/lib/tools.ts` → `toolToCommand`
- **Executor** (runs the CLI): `src/lib/executor.ts`
- **File handling** (tools needing temp files): `src/lib/tools.ts` → `toolsRequiringFile`

---

## Summary: 37 Tool Calls → 37 CLI Commands

| Category | Tool Calls | CLI Commands |
|----------|-----------|--------------|
| Auth | 1 | 1 |
| Config | 1 | 1 |
| Init | 1 | 1 |
| Dashboard | 7 | 7 |
| Report | 7 | 7 |
| Virtual Table | 7 | 7 |
| Schema | 5 | 5 |
| Query | 2 | 2 |
| AI | 4 | 4 |
| Environment | 3 | 3 |
| Promote | 3 | 3 |
| Tenant | 2 | 2 |

### CLI Commands NOT Exposed as Tools (7 total)

These CLI commands exist but have **no** corresponding tool call in the agent:

| CLI Command | Reason not exposed |
|---|---|
| `quill login --token <t>` | Agent uses `quill_init` instead (compound) |
| `quill logout` | Destructive auth action, not suitable for agent |
| `quill config init` | Agent uses `quill_init` instead |
| `quill config set <key> <value>` | Direct config mutation, risky for agent |
| `quill query parse --sql <q>` | Low-level AST tool, not useful for chat |
| `quill query build --ast <path>` | Low-level AST tool, not useful for chat |
| `quill tenant validate --file <f>` | Not yet wired up |
| `quill env update <id> --file <f>` | Not yet wired up |
| `quill env delete <id>` | Destructive, not yet wired up |
| `quill dashboard set-section-order <id>` | Not yet wired up |

---

## Detailed Mapping

### Auth

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 1 | `quill_whoami` | `quill whoami` | *(none)* | — | Returns auth status, email, org, token source |

---

### Config

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 2 | `quill_config_get` | `quill config get [key]` | `key`: string | No | Without key: returns all config. With key: returns that specific value |

---

### Init (Compound)

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 3 | `quill_init` | `quill init` | `token`: string, `clientId`: string, `queryEndpoint`: string, `env`: "staging" \| "prod" | No | Compound: authenticates + inits project + sets env + tests connection. Each param becomes a `--flag` |

**CLI mapping:**
```
quill init [--token <t>] [--client-id <id>] [--query-endpoint <url>] [--env <env>]
```

---

### Dashboard

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 4 | `quill_dashboard_list` | `quill dashboard list` | *(none)* | — | |
| 5 | `quill_dashboard_show` | `quill dashboard show <id>` | `id`: string | Yes | |
| 6 | `quill_dashboard_create` | `quill dashboard create --name <n>` | `name`: string | Yes | |
| 7 | `quill_dashboard_update` | `quill dashboard update <id>` | `id`: string, `name`: string, `updates`: object | `id` | Uses temp file via `--file` if `updates` provided |
| 8 | `quill_dashboard_delete` | `quill dashboard delete <id> --force` | `id`: string | Yes | Always passes `--force` (skips confirmation) |
| 9 | `quill_dashboard_set_filters` | `quill dashboard set-filters <id> --file <tmp>` | `id`: string, `filters`: object | Both | Writes `filters` to a temp JSON file, passes via `--file` |
| 10 | `quill_dashboard_setup` | `quill dashboard setup --name <n>` | `name`: string, `reports`: array, `filters`: object | `name` | **Special handling in executor**: each report written to a temp dir, filters to a temp file. See below. |

**Special: `quill_dashboard_setup` execution flow:**
1. Creates a temp directory for reports
2. Writes each report object as `report-0.json`, `report-1.json`, etc.
3. Passes `--reports <tmpDir>` to the CLI
4. If `filters` provided, writes to temp file and passes `--filters <tmpFile>`
5. Cleans up all temp files after execution

---

### Report

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 11 | `quill_report_list` | `quill report list --dashboard <id>` | `dashboardId`: string | Yes | |
| 12 | `quill_report_show` | `quill report show <id>` | `id`: string | Yes | |
| 13 | `quill_report_create` | `quill report create --dashboard <id> --file <tmp>` | `dashboardId`: string, `config`: object | Both | `config` written to temp file. Config must include `name`, `baseSql`, `chartType` |
| 14 | `quill_report_update` | `quill report update <id> --file <tmp>` | `id`: string, `updates`: object | Both | `updates` written to temp file |
| 15 | `quill_report_delete` | `quill report delete <id> --force` | `id`: string | Yes | Always `--force` |
| 16 | `quill_report_run` | `quill report run <id>` | `id`: string | Yes | Executes the report's SQL and returns data |
| 17 | `quill_report_validate` | `quill report validate <id>` | `id`: string | Yes | Validates schema, SQL, pivot config |

**Report config object shape (for `quill_report_create`):**
```json
{
  "name": "Revenue by Month",
  "baseSql": "SELECT date_trunc('month', created_at) as month, SUM(amount) as revenue FROM orders GROUP BY 1",
  "chartType": "line",
  "pivot": {},
  "dateField": "created_at"
}
```

**Supported chart types:** `bar`, `line`, `area`, `table`, `metric`, `pie`, `column`, `gauge`, `scatter`, `funnel`

---

### Virtual Table

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 18 | `quill_vt_list` | `quill vt list` | *(none)* | — | |
| 19 | `quill_vt_show` | `quill vt show <id>` | `id`: string | Yes | |
| 20 | `quill_vt_create` | `quill vt create --name <n> --sql <q>` | `name`: string, `sql`: string, `ownerTenantFields`: string | `name`, `sql` | `ownerTenantFields` is comma-separated, maps to `--owner-fields` |
| 21 | `quill_vt_update` | `quill vt update <id> --file <tmp>` | `id`: string, `updates`: object | Both | `updates` written to temp file |
| 22 | `quill_vt_delete` | `quill vt delete <id> --force` | `id`: string | Yes | Always `--force` |
| 23 | `quill_vt_test` | `quill vt test <id>` | `id`: string | Yes | Executes the VT's SQL to verify it works |
| 24 | `quill_vt_validate` | `quill vt validate <id>` | `id`: string | Yes | Validates the VT configuration |

---

### Schema

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 25 | `quill_schema_explore` | `quill schema explore` | `schema`: string, `table`: string, `maxTables`: number | No | Compound: returns full schema tree in one call. Preferred over individual list/tables/columns calls |
| 26 | `quill_schema_list` | `quill schema list` | *(none)* | — | Lists schema names only |
| 27 | `quill_schema_tables` | `quill schema tables` | `schema`: string | No | Without schema: lists all tables. With: filters to that schema |
| 28 | `quill_schema_columns` | `quill schema columns <table>` | `table`: string | Yes | Table must be in `schema.table` format (e.g. `public.users`) |
| 29 | `quill_schema_test_connection` | `quill schema test-connection` | *(none)* | — | Pings the database to verify connectivity |

---

### Query

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 30 | `quill_query_run` | `quill query run --sql <q>` | `sql`: string, `autoFix`: boolean | `sql` | If `autoFix: true`, appends `--auto-fix` flag (AI auto-corrects SQL errors) |
| 31 | `quill_query_explain` | `quill query explain --sql <q>` | `sql`: string | Yes | Returns the EXPLAIN execution plan |

---

### AI

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 32 | `quill_ai_query` | `quill ai query <prompt>` | `prompt`: string, `schemas`: string | `prompt` | Generates SQL from natural language. `schemas` is comma-separated filter |
| 33 | `quill_ai_fix` | `quill ai fix --sql <q> --error <e>` | `sql`: string, `error`: string | Both | Feeds broken SQL + error to AI for correction |
| 34 | `quill_ai_pivot` | `quill ai pivot <prompt>` | `prompt`: string, `reportId`: string | `prompt` | Generates pivot config. If `reportId` given, applies to that report |
| 35 | `quill_ai_edit` | `quill ai edit --sql <q> --prompt <p>` | `sql`: string, `prompt`: string | Both | Modifies existing SQL based on natural language instructions |

---

### Environment

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 36 | `quill_env_list` | `quill env list` | *(none)* | — | |
| 37 | `quill_env_show` | `quill env show [id]` | `id`: string | No | Without id: shows current env. With id: shows that specific env |
| 38 | `quill_env_switch` | `quill env switch <env>` | `env`: "staging" \| "prod" | Yes | |

---

### Promote

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 39 | `quill_promote_dashboard` | `quill promote dashboard <id>` | `id`: string, `from`: "staging" \| "prod", `to`: "staging" \| "prod" | `id` | `from`/`to` default to staging→prod if omitted |
| 40 | `quill_promote_report` | `quill promote report <id>` | `id`: string, `from`: "staging" \| "prod", `to`: "staging" \| "prod" | `id` | |
| 41 | `quill_promote_vt` | `quill promote vt <id>` | `id`: string, `from`: "staging" \| "prod", `to`: "staging" \| "prod" | `id` | |

---

### Tenant

| # | Tool Call | CLI Command | Parameters | Required | Notes |
|---|-----------|-------------|------------|----------|-------|
| 42 | `quill_tenant_list` | `quill tenant list` | *(none)* | — | |
| 43 | `quill_tenant_mapping_get` | `quill tenant mapping get` | *(none)* | — | |

---

## Tools Requiring Temp Files

These tools pass complex JSON data to the CLI via temporary files. The executor writes the data to a temp file, passes it via `--file <path>`, and cleans up after.

| Tool Call | What gets written to file | CLI flag |
|-----------|--------------------------|----------|
| `quill_dashboard_set_filters` | `filters` object | `--file` |
| `quill_dashboard_update` | `updates` object | `--file` |
| `quill_dashboard_setup` | Each report → separate file in temp dir; filters → temp file | `--reports <dir>`, `--filters <file>` |
| `quill_report_create` | `config` object | `--file` |
| `quill_report_update` | `updates` object | `--file` |
| `quill_vt_update` | `updates` object | `--file` |

---

## Global Behavior

- **All commands** get `--json` appended automatically by the executor (forces JSON output)
- **All delete commands** get `--force` appended (skips interactive confirmation)
- **Timeout**: 120 seconds per CLI call
- **Max buffer**: 10 MB stdout/stderr
- **Dry run mode**: Set `DRY_RUN=true` in `.env.local` to log commands without executing

---

## Response Format (from CLI)

All tool results come back as JSON:

**Success:**
```json
{
  "ok": true,
  "data": { ... },
  "warnings": [],
  "meta": { "source": "remote", "timestamp": "..." }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Dashboard not found",
    "suggestions": ["Run quill dashboard list to see available dashboards"]
  }
}
```

**Error codes:** `NOT_FOUND`, `INVALID_INPUT`, `AUTH_REQUIRED`, `NETWORK_ERROR`, `VALIDATION_ERROR`, `NOT_INITIALIZED`
