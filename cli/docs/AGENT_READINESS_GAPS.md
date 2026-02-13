# CLI Agent-Readiness Gaps

What's missing for an AI agent to use this CLI perfectly, based on simulating 10 real-world scenarios where an agent only has access to `--help` text and the README.

---

## The #1 Problem: No Sample Responses

The CLI documents the envelope (`{ "ok": true, "data": ... }`) but **never shows what `data` contains** for any specific command. An agent cannot write reliable automation without knowing response shapes.

Every `list`, `show`, `create`, `update`, `delete` command needs a documented response example. Without this, agents must run commands speculatively and parse unknown JSON.

**Affected commands:** All of them. Zero commands have documented response shapes.

---

## Critical Gaps (Agent Will Fail)

### 1. `--force` descriptions don't mention agent requirement

All 4 delete commands have `--force` that says "Skip confirmation." In non-TTY environments (agents, CI), deletes **silently fail** without `--force`. The help text should say:

```
"Skip confirmation (required for non-interactive/agent use)"
```

**Affected:** `dashboard delete`, `report delete`, `vt delete`, `env delete`

### 2. `promote vt <name>` vs `vt show/update/delete <id>` -- undocumented trap

An agent that learns "VTs use IDs" from `vt show`, `vt update`, `vt delete`, `vt test`, `vt validate` will pass an ID to `promote vt` and fail or promote the wrong resource. **Nothing warns about this.**

| Command | Identifier |
|---------|-----------|
| `vt show/update/delete/test/validate` | `<id>` |
| `promote vt` | `<name>` |

### 3. No ID source hints in help text

Every `<id>` argument says only "Report ID" or "Virtual table ID" -- never where to get it:

| ID needed by | Where to get it | Documented? |
|-------------|----------------|-------------|
| `report show/update/delete/run/validate` | `quill report list --dashboard <name>` | **No** |
| `vt show/update/delete/test/validate` | `quill vt list` | **No** |
| `env update/delete` | `quill env list` | **No** |
| `promote --from/--to` (client IDs) | `quill env list` | **No** |

### 4. `set-section-order` JSON shape missing `_id`

Help says `{ sectionOrder: [{ section, reportOrder: [...] }] }` but the Zod schema requires `_id`. Agent will produce JSON without `_id` and fail validation.

### 5. `--env` Commander default breaks environment cascade

The `--env` flag defaults to `'staging'` via Commander, which means `QUILL_ENV`, `quill env switch prod`, and project config `currentEnv` are **all ignored**. The environment is always staging unless `--env` is explicitly passed.

---

## High Gaps (Agent Will Be Confused)

### 6. Enum values never listed in help

| Enum | Used by | Values (not shown) |
|------|---------|-------------------|
| `chartType` | report create | bar, line, area, table, metric, pie, column, gauge, scatter, funnel |
| `xAxisFormat` | report formatting | percent, dollar_amount, dollar_cents, whole_number, MMM_dd, MMM_yyyy, etc. (14 values) |
| filter `type` | set-filters | date_range, enum, string, number, select, multiselect, tenant |
| `databaseType` | env update | postgres, mysql, snowflake, databricks, bigquery, redshift |
| config keys (global) | config set | token, defaultEnv, queryEndpoint, serverUrl |
| config keys (project) | config set | clientId, queryEndpoint, currentEnv, withCredentials, queryHeaders |

Only `env switch` and `template` list their valid values.

### 7. `--file` JSON shapes incomplete or missing

| Command | Current description | Missing fields |
|---------|-------------------|---------------|
| `report create --file` | Lists 7 fields | Missing: `formatting` (nested object), `order`, enum values for `chartType` |
| `report update --file` | "any report fields" | Completely opaque -- which fields? |
| `report run --filters` | "JSON file with filters" | No shape at all |
| `query run --filters` | "JSON file with filters" | No shape at all |
| `dashboard set-filters --file` | Lists structure | Missing filter `type` enum, optional fields (default, allowedValues, table) |
| `query build --ast` | "JSON file with AST" | Should say "Use output from `quill query parse`" |
| `ai pivot --file` | Lists field names | Missing types (number, string arrays, record) |

### 8. Defaults not documented

| Parameter | Default | Documented? |
|-----------|---------|-------------|
| `chartType` in report create | `'table'` | No |
| `schema columns` schema prefix | `'public'` | No |
| `--max-tables` in schema explore | `50` | Yes (good) |
| `--env` global | `'staging'` | Yes but causes Issue #5 |

### 9. "At least one required" not expressed

`dashboard update` and `vt update` show all options as optional in `--help` but throw an error if none are provided. Commander can't express this constraint, so the description should say it:

```
"Update a dashboard (at least --new-name or --file must be provided)"
```

### 10. `quill template` not cross-referenced

No command's `--file` help text mentions `quill template`. An agent would never discover it unless it runs `quill --help` and sees the top-level command list.

Every `--file` description should add: `"(see: quill template <name>)"`

### 11. `quill status` and `quill template` undocumented in README

Both commands exist but are completely absent from the README Commands section. An agent reading the README would not know they exist.

### 12. `quill init` missing from README Commands section

Only appears in Quick Start, not in the Commands reference. Agent scanning the Commands section won't find it.

---

## Medium Gaps (Agent Experience Degraded)

### 13. No complete workflow example in README

The Quick Start shows isolated commands. No end-to-end workflow like:

```
1. quill status                           # verify setup
2. quill schema explore                   # discover tables
3. quill ai query "revenue by month"      # generate SQL
4. quill dashboard create --name "Sales"  # create dashboard
5. quill report create --dashboard "Sales" --file report.json  # add report
6. quill report list --dashboard "Sales"  # verify + get report IDs
7. quill report run <report-id>           # execute and see data
8. quill promote dashboard "Sales" --from <staging-id> --to <prod-id>  # promote
```

### 14. `config init` vs `init` flag name confusion

- `quill init` uses `--query-endpoint`
- `quill config init` uses `--endpoint`

Different flag names for the same value. Agent could easily mix them up.

### 15. Environment/ClientID relationship unexplained

Promote commands need client IDs for `--from` and `--to`. But the relationship between environments and client IDs is never explained:
- Is each environment a separate client ID?
- Where does the agent get the target environment's client ID?
- Does `quill env list` return client IDs?

### 16. No batch/bulk operations

Creating 5 reports requires 5 sequential API calls. No `quill report batch-create --dashboard "X" --dir ./reports/`. The `dashboard setup` command handles this for new dashboards but there's no way to batch-add reports to an existing dashboard.

### 17. No idempotency guarantees

If `quill report create` is run twice with the same JSON, does it create a duplicate? Error with `ALREADY_EXISTS`? The agent can't safely retry on transient errors.

### 18. Shell quoting for `--sql` not mentioned

`quill vt create --sql "SELECT * FROM orders JOIN users ON ..."` -- complex SQL with quotes, newlines, and special characters needs shell quoting. Not mentioned anywhere.

### 19. `login --token` requirement for agents not in --help

The README warns "do not use `quill login` without `--token`" but the `--help` text for `login` shows `--token` as optional. For agents, it's effectively required. Help should say:

```
"API token (required for non-interactive/agent use)"
```

### 20. No `--timeout` flag

30s timeout is hardcoded. Schema operations and AI queries on large databases can easily exceed this. No way to increase without code changes.

---

## Low Gaps (Nice-to-Have)

### 21. No `--dry-run` documented in README

Promote commands have `--dry-run` but it's not in the README.

### 22. No `--names-only` documented in README

`dashboard list --names-only` exists but isn't documented.

### 23. `--auto-fix` on `query run` not in README

Exists in code but not in the Commands section.

### 24. README still shows `--json` in global flags table

`--json` was removed but the README still lists it.

### 25. No response shape documentation for any command

Already mentioned as #1 problem but repeated for completeness -- this is the single highest-impact documentation gap.

---

## Recommended Fix Priority

### Must Fix (agent will fail without these)

| # | Fix | Effort |
|---|-----|--------|
| 1 | Fix `--env` Commander default (Issue #5) | 5 min |
| 2 | Add ID source hints to all `<id>` argument descriptions | 15 min |
| 3 | Update `--force` descriptions: "required for non-interactive/agent use" | 5 min |
| 4 | Document `promote vt` uses name, not ID | 5 min |
| 5 | Fix `set-section-order` JSON shape to include `_id` or remove from schema | 10 min |
| 6 | Remove `--json` from README global flags table | 2 min |

### Should Fix (agent will be confused without these)

| # | Fix | Effort |
|---|-----|--------|
| 7 | Add enum values to help text (chartType, xAxisFormat, filter type, databaseType, config keys) | 30 min |
| 8 | Add `(see: quill template <name>)` to all `--file` descriptions | 10 min |
| 9 | Add `quill status`, `quill template`, `quill init` to README Commands section | 15 min |
| 10 | Add "at least one required" to `dashboard update` and `vt update` descriptions | 5 min |
| 11 | Document defaults (chartType=table, schema=public) | 10 min |
| 12 | Complete `--file` JSON shape descriptions (filters, report update, AST) | 20 min |
| 13 | Add end-to-end workflow example in README | 20 min |

### Nice to Have

| # | Fix | Effort |
|---|-----|--------|
| 14 | Add response shape examples to README for all commands | 2-3 hours |
| 15 | Add `--timeout` global flag | 30 min |
| 16 | Unify `--query-endpoint` / `--endpoint` flag names | 15 min |
| 17 | Explain environment/clientID relationship in README | 20 min |
| 18 | Add `login --token` requirement hint for agents in --help | 5 min |
| 19 | Document `--dry-run`, `--names-only`, `--auto-fix` in README | 10 min |
| 20 | Add shell quoting guidance for `--sql` | 5 min |
