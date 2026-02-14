# Quill CLI — Complete Command Reference

All 56 commands available in the Quill CLI. The agent knows all of these.

## Global Flags

All commands support these flags:

| Flag | Description |
|------|-------------|
| `--env <staging\|prod>` | Target environment (default: staging) |
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
quill dashboard show "Name"           # Summary: reports, sections, filters
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
quill ai pivot "group by category and month"     # Generate pivot config
```

## Environments (5 commands)

```bash
quill env list                        # List all environments/clients
quill env show                        # Current environment details
quill env switch staging              # Switch environment
quill env update <id> --file config.json
quill env delete <id> --force
```

## Tenants (3 commands)

Tenant commands require `--dashboard <name>`.

```bash
quill tenant list --dashboard "Name"
quill tenant mapping get --dashboard "Name"
quill tenant validate --query "SQL" --from-field f1 --to-field f2
```

## Promotion (3 commands)

Promote copies resources between environments/clients. Requires `--from` and `--to` client IDs.

```bash
quill promote dashboard "Name" --from <sourceClientId> --to <targetClientId>
quill promote dashboard "Name" --from <id> --to <id> --auto-resolve
quill promote report <id> --dashboard "Name" --from <id> --to <id>
quill promote vt "vtName" --from <sourceClientId> --to <targetClientId>
```

## Utility (1 command)

```bash
quill template <name>                 # Show JSON template for --file flags
```

## JSON Output Contract

**Success:**
```json
{ "ok": true, "data": { ... }, "warnings": [], "meta": { "env": "staging" } }
```

**Error:**
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "suggestions": [...] } }
```

**Error Codes:** `NOT_FOUND`, `INVALID_INPUT`, `AUTH_REQUIRED`, `NETWORK_ERROR`, `CLI_TIMEOUT`, `IO_ERROR`, `VALIDATION_ERROR`, `NOT_INITIALIZED`, `ALREADY_EXISTS`, `CONFLICT`
