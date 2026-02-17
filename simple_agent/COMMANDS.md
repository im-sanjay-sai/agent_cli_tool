# Quill CLI — Complete Command Reference

All commands available in the Quill CLI.

## Global Flags

All commands support these flags:

| Flag | Description |
|------|-------------|
| `--pretty` | Pretty-print JSON output |
| `--verbose` | Verbose logging to stderr |
| `--token <token>` | API token override |

## Auth & Config (8 commands)

```bash
quill login                           # Device code flow (opens browser)
quill login --token <token>           # Login with API token
quill logout                          # Clear stored credentials
quill whoami                          # Show auth status

quill init --token <t> --client-id <id> --query-endpoint <url>  # Full setup
quill config init --client-id <id> --endpoint <url>              # Project config only
quill config get                      # Get all config
quill config set <key> <value>        # Set config value
```

## Status (1 command)

```bash
quill status                          # Auth + config + connection in one call
```

## Dashboards (9 commands)

Dashboards are identified by **name**, not ID.

```bash
quill dashboard list                  # List all (name + filterCount)
quill dashboard list --names-only     # Just names (lightweight)
quill dashboard list --limit 10 --offset 0  # Pagination
quill dashboard show "Name"           # Summary: reports, sections, filters, tenantKeys
quill dashboard show "Name" --full    # Full raw data (warning: can be huge)
quill dashboard create --name "Name"
quill dashboard setup --name "Name" --reports dir/ --filters filters.json  # One-shot
quill dashboard update "Name" --file updates.json
quill dashboard delete "Name" --force
quill dashboard set-filters "Name" --file filters.json
quill dashboard set-section-order "Name" --file order.json
```

## Reports (7 commands)

Reports are identified by **ID** (24-char hex).

```bash
quill report list --dashboard "Name"
quill report list --dashboard "Name" --limit 30 --offset 0  # Pagination
quill report show <id>
quill report create --dashboard "Name" --file report.json
quill report update <id> --file updates.json
quill report delete <id> --force
quill report run <id>
quill report run <id> --filters filters.json
quill report validate <id>
```

## Virtual Tables (7 commands)

Virtual tables are identified by **ID**. Alias: `quill virtual-table`.

```bash
quill vt list
quill vt list --limit 10 --offset 0  # Pagination
quill vt show <id>
quill vt create --name "name" --sql "SELECT ..." --owner-fields "org_id"
quill vt update <id> --sql "SELECT ..." --name "new_name" --owner-fields "f1"
quill vt delete <id> --force
quill vt test <id>
quill vt validate <id>
```

## Schema (5 commands)

```bash
quill schema list                     # List schema names
quill schema tables --schema public   # List tables in a schema
quill schema columns <table>          # Columns for a table (defaults to public)
quill schema test-connection          # Test DB connection
quill schema explore                  # Full tree (schemas + tables + columns)
quill schema explore --schema public  # Scoped to one schema
quill schema explore --table public.users  # Scoped to one table
quill schema explore --max-tables 100 # Limit tables fetched
```

## Query (4 commands)

```bash
quill query run --sql "SELECT ..."
quill query run --sql "SELECT ..." --auto-fix   # AI auto-fix on error
quill query parse --sql "SELECT ..."             # Parse SQL to AST
quill query build --ast ast.json                 # Build SQL from AST
quill query explain --sql "SELECT ..."           # Execution plan (EXPLAIN)
```

## AI (4 commands)

```bash
quill ai query "natural language"                # Generate SQL
quill ai fix --sql "broken" --error "msg"        # Fix SQL
quill ai edit --sql "SELECT ..." --prompt "change this"  # Edit SQL
quill ai pivot --file pivot-config.json          # Generate pivot (requires structured JSON)
```

## Environments (5 commands)

An environment = a Quill client instance (its own DB, dashboards, reports).

```bash
quill env list                        # List all environments (active one marked)
quill env list --limit 10 --offset 0  # Pagination
quill env show                        # Current environment details
quill env switch "EnvName"            # Switch by environment name or client ID
quill env update <id> --file config.json
quill env delete <id> --force
```

## Tenants (3 commands)

Tenant commands require `--dashboard <name>`.

```bash
quill tenant list --dashboard "Name"
quill tenant list --dashboard "Name" --limit 10 --offset 0  # Pagination
quill tenant mapping get --dashboard "Name"
quill tenant validate --query "SQL" --from-field f1 --to-field f2
```

## Promotion / Copying (3 commands)

`--from` and `--to` accept environment **names** or **client IDs**.

```bash
# Cross-environment promotion (--from and --to must differ)
quill promote dashboard "Name" --from "SourceEnv" --to "TargetEnv"
quill promote dashboard "Name" --from "SourceEnv" --to "TargetEnv" --auto-resolve
quill promote vt "vtName" --from "SourceEnv" --to "TargetEnv"

# Report promotion/copying (same --from/--to = cross-dashboard copy within same env)
quill promote report <id> --to-dashboard "target" --from "EnvName" --to "EnvName"
quill promote report <id> --to-dashboard "target" --from "SourceEnv" --to "TargetEnv"
```

## Utility (1 command)

```bash
quill template <name>                 # Show JSON template for --file flags
# Short aliases: report, dashboard, filters, pivot, env
# Full names: report-create, dashboard-create, dashboard-filters, pivot-config, env-update
```

## JSON Output Contract

**Success:**
```json
{ "ok": true, "data": { ... }, "warnings": [], "meta": { "source": "remote", "timestamp": "..." } }
```

**Error:**
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "suggestions": [...] } }
```

**Error Codes:** `NOT_FOUND`, `INVALID_INPUT`, `AUTH_REQUIRED`, `NETWORK_ERROR`, `CLI_TIMEOUT`, `IO_ERROR`, `VALIDATION_ERROR`, `NOT_INITIALIZED`, `ALREADY_EXISTS`, `CONFLICT`
