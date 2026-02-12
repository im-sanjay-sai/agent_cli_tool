---
name: quill-cli
description: Manage Quill BI dashboards, reports, and virtual tables via CLI. Use when the user wants to create, edit, or delete dashboards, reports, or virtual tables, promote configurations between environments (staging to prod), or work with Quill BI configurations from the IDE. All operations go through the Quill API to MongoDB.
---

# Quill CLI

A command-line tool for managing Quill BI dashboards, reports, and virtual tables. All operations go through the Quill API (cloud or self-hosted) to MongoDB.

## Quick Start

```bash
# Authenticate
quill login --token <your-token>

# Initialize in project directory
quill config init --client-id <id> --endpoint <url>

# Explore the database schema
quill schema explore

# Create a full dashboard with reports in one command
quill dashboard setup --name "Sales Analytics" --reports ./reports/

# Or create step by step
quill dashboard create --name "Sales Analytics"
quill report create --dashboard <dashboard-id> --file report.json

# List resources
quill dashboard list
quill report list --dashboard <dashboard-id>
quill vt list
```

## Command Categories

| Category | Alias | Description |
|----------|-------|-------------|
| `login`, `logout`, `whoami` | - | Authentication |
| `config` | - | Configuration (init, get, set) |
| `dashboard` | `dash` | Dashboard CRUD + filters |
| `report` | - | Report CRUD + run + validation |
| `vt` | `virtual-table` | Virtual table CRUD + test |
| `schema` | - | Database schema operations |
| `query` | - | SQL query operations |
| `ai` | - | AI-powered SQL generation |
| `tenant` | - | Tenant mappings |
| `env` | `environment` | Environment management |
| `promote` | - | Promote between environments |

For complete command reference, see [commands-reference.md](commands-reference.md).

## Output Contract

All commands return JSON. Parse the `ok` field to determine success.

### Success Response

```json
{
  "ok": true,
  "data": { ... },
  "warnings": [],
  "meta": {
    "source": "remote",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "env": "staging"
  }
}
```

### Error Response

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Dashboard with id 'dash_123' not found",
    "details": { "resource": "Dashboard", "id": "dash_123" },
    "suggestions": [
      "Check if the dashboard exists with 'quill dashboard list'",
      "Verify the ID is correct"
    ]
  }
}
```

## Error Codes

| Code | Meaning | Recovery |
|------|---------|----------|
| `NOT_FOUND` | Resource doesn't exist | List resources to find correct ID |
| `INVALID_INPUT` | Bad input format | Check `--help` for correct usage |
| `CONFLICT` | Resource conflict | Use `--force` or resolve manually |
| `AUTH_REQUIRED` | Not authenticated | Run `quill login` |
| `IO_ERROR` | File system error | Check file permissions and paths |
| `NETWORK_ERROR` | API request failed | Check connection, run `quill login` |
| `VALIDATION_ERROR` | Data validation failed | Check error details for specific issues |
| `NOT_INITIALIZED` | CLI not initialized | Run `quill config init` |
| `ALREADY_EXISTS` | Resource exists | Use different ID or delete existing |

## Environment Promotion

Promote configurations from staging to production:

```bash
# Promote a dashboard
quill promote dashboard <id> --from staging --to prod

# Promote a report
quill promote report <id> --from staging --to prod

# Promote a virtual table
quill promote vt <id> --from staging --to prod

# Auto-resolve conflicts
quill promote dashboard <id> --from staging --to prod --auto-resolve
```

## Global Flags

All commands support:

| Flag | Description |
|------|-------------|
| `--env <staging\|prod>` | Target environment |
| `--json` | JSON output (default) |
| `--pretty` | Pretty-printed JSON |
| `--verbose` | Verbose logging to stderr |
| `--token <token>` | API token override |

## Key Compound Commands

### `quill dashboard setup`
Create a dashboard with reports and filters in one command. Rolls back on failure.
```bash
quill dashboard setup --name "Sales" --reports ./reports/ --filters filters.json
```
Response: `data.dashboardId` for the dashboard ID, `data.reports[].id` for report IDs.

### `quill schema explore`
Get the full database schema tree (schemas, tables, columns) in one call.
```bash
quill schema explore                    # Full tree (max 50 tables)
quill schema explore --schema public    # Single schema
quill schema explore --max-tables 100   # Increase table limit
```

### `quill query run --auto-fix`
Execute SQL with automatic AI error correction.
```bash
quill query run --sql "SELECT * FROM users" --auto-fix
```
If the query fails, AI fixes it and retries once. Check `data.autoFix.resolved` for status.

## Extracting IDs from Responses

IDs are needed to chain commands (e.g., create dashboard, then create reports in it). The API may return the ID as `id` or `_id`. Always check both.

| Command | ID Location |
|---------|-------------|
| `dashboard list` | `data.items[].id` |
| `dashboard create` | `data.created.id` or `data.created._id` |
| `dashboard setup` | `data.dashboardId` and `data.reports[].id` |
| `report list` | `data.items[].id` |
| `report create` | `data.created.id` or `data.created._id` |
| `vt list` | `data.items[].id` |
| `vt create` | `data.created.id` or `data.created._id` |

## Critical Agent Instructions

1. **Always check `ok` field** - Parse JSON output and check `ok: true` before proceeding
2. **Capture IDs from create commands** - `dashboard create` returns an ID needed for `report create --dashboard <id>`
3. **Prefer `dashboard setup`** - Use this compound command instead of separate create + report + filter calls when creating a full dashboard
4. **Prefer `schema explore`** - Use this instead of calling schema list, tables, and columns separately
5. **Authentication is required** - All CRUD operations require authentication via `quill login` or `--token`
6. **Follow error suggestions** - The `suggestions[]` array contains actionable recovery steps
7. **Use `--dashboard` for report list** - `quill report list --dashboard <id>` to list reports for a dashboard
8. **Delete commands prompt for confirmation** - Pass `--force` to skip the interactive prompt (required for non-TTY / agent use)

## Additional Resources

- [commands-reference.md](commands-reference.md) - Complete command documentation
- [workflows.md](workflows.md) - Multi-step workflow guides
- [examples.md](examples.md) - JSON file templates
