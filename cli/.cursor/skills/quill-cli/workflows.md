# Quill CLI Workflows

Multi-step operation guides for common tasks. All operations go through the Quill API.

## Extracting IDs Between Steps

Many workflows require extracting an ID from one command to use in the next. The API may return IDs as `id` or `_id`. Always check both.

| Command | ID Location |
|---------|-------------|
| `dashboard create` | `data.created.id` or `data.created._id` |
| `dashboard setup` | `data.dashboardId` and `data.reports[].id` |
| `dashboard list` | `data.items[].id` |
| `report create` | `data.created.id` or `data.created._id` |
| `report list` | `data.items[].id` |
| `vt create` | `data.created.id` or `data.created._id` |
| `vt list` | `data.items[].id` |

---

## Workflow 1: Create Dashboard with Reports (Recommended: One Command)

Use `dashboard setup` to create a dashboard with reports and filters in a single command. It handles ID threading and rolls back the dashboard if report creation fails.

### Steps

```bash
# 1. Authenticate
quill login --token <your-token>

# 2. Create dashboard + reports + filters in one shot
quill dashboard setup --name "Sales Analytics" --reports ./reports/ --filters filters.json
# Response: {
#   "ok": true,
#   "data": {
#     "dashboardId": "dash_abc123",
#     "reportsCreated": 2,
#     "reports": [{ "name": "Revenue by Month", "id": "rpt_xyz789" }, ...],
#     "dashboard": { ... }
#   }
# }

# 3. Verify the dashboard
quill dashboard show dash_abc123
```

The `--reports` flag accepts either:
- A directory path: `--reports ./reports/` (reads all `.json` files, sorted alphabetically)
- Comma-separated file paths: `--reports report1.json,report2.json`

---

## Workflow 1b: Create Dashboard with Reports (Step by Step)

If you need more control, create each resource individually.

### Steps

```bash
# 1. Authenticate
quill login --token <your-token>

# 2. Create the dashboard
quill dashboard create --name "Sales Analytics"
# Response: { "ok": true, "data": { "created": { "id": "dash_abc123", ... } } }

# 3. Extract the dashboard ID from response, then create reports
quill report create --dashboard dash_abc123 --file revenue-report.json
quill report create --dashboard dash_abc123 --file orders-report.json

# 4. Set global filters for the dashboard
quill dashboard set-filters dash_abc123 --file filters.json

# 5. Verify the dashboard
quill dashboard show dash_abc123
```

---

## Workflow 2: Promote Staging to Production

Safely promote a dashboard and its reports from staging to production.

### Steps

```bash
# 1. Ensure you're working with staging
quill env switch staging

# 2. Verify what will be promoted
quill dashboard show <dashboard-id>
quill report list --dashboard <dashboard-id>

# 3. Promote the dashboard (includes all reports)
quill promote dashboard <dashboard-id> --from staging --to prod

# Or auto-resolve conflicts (e.g. add missing tables)
quill promote dashboard <dashboard-id> --from staging --to prod --auto-resolve
```

### Promoting Individual Resources

```bash
# Promote a specific report
quill promote report <report-id> --from staging --to prod

# Promote a virtual table
quill promote vt <vt-id> --from staging --to prod
```

---

## Workflow 3: Edit and Test Changes

Make changes and verify they work.

### Steps

```bash
# 1. Show current state
quill report show rpt_123

# 2. Make the change
quill report update rpt_123 --file updated-report.json

# 3. Test the change
quill report run rpt_123
# Check the returned data is correct

# 4. Validate configuration
quill report validate rpt_123
```

---

## Workflow 4: Error Recovery

Handle errors gracefully using the CLI's error suggestions.

### Pattern

```bash
# 1. Run command
quill report create --dashboard dash_invalid --file report.json

# 2. Parse error response
# {
#   "ok": false,
#   "error": {
#     "code": "NOT_FOUND",
#     "message": "Dashboard with id 'dash_invalid' not found",
#     "suggestions": [
#       "Check if the dashboard exists with 'quill dashboard list'",
#       "Verify the ID is correct"
#     ]
#   }
# }

# 3. Follow suggestions
quill dashboard list
# Find correct dashboard ID from data.items[].id

# 4. Retry with correct ID
quill report create --dashboard dash_correct123 --file report.json
```

### Common Error Recovery

| Error Code | Recovery Action |
|------------|-----------------|
| `NOT_FOUND` | List resources to find correct ID |
| `AUTH_REQUIRED` | Run `quill login --token <token>` |
| `NOT_INITIALIZED` | Run `quill config init` |
| `VALIDATION_ERROR` | Check file format, see error details |
| `NETWORK_ERROR` | Check connection and API endpoint |

---

## Workflow 5: Create Virtual Table and Use in Report

Create a derived table and build a report on it.

### Steps

```bash
# 1. Create the virtual table
quill vt create \
  --name "orders_with_users" \
  --sql "SELECT o.*, u.name as user_name, u.email FROM orders o JOIN users u ON o.user_id = u.id" \
  --owner-fields "org_id"
# Response: { "ok": true, "data": { "created": { "id": "vt_abc123", ... } } }

# 2. Test the virtual table
quill vt test vt_abc123
# Verify query executes correctly

# 3. Validate the virtual table
quill vt validate vt_abc123

# 4. Create a report using the virtual table
# In report.json, reference the virtual table in baseSql:
# { "baseSql": "SELECT * FROM orders_with_users WHERE ...", ... }
quill report create --dashboard <dashboard-id> --file report.json
```

---

## Workflow 6: AI-Assisted Report Creation

Use AI to generate SQL and pivot configurations.

### Steps

```bash
# 1. Generate SQL from natural language
quill ai query "Show monthly revenue for 2024, grouped by product category"
# Response: { "ok": true, "data": { "prompt": "...", "sql": "SELECT ..." } }

# 2. Copy the SQL into a report JSON file

# 3. Generate pivot configuration
quill ai pivot "Group by month as rows, category as columns, sum revenue"

# 4. Add pivot to report JSON, then create
quill report create --dashboard <id> --file report.json

# 5. If SQL has errors, use AI to fix
quill ai fix --sql "<broken-sql>" --error "<error-message>"

# 6. Or use --auto-fix to let the query command handle it automatically
quill query run --sql "<sql>" --auto-fix
```

---

## Workflow 7: Schema Exploration

Browse the database schema to understand available data.

### Recommended: One-call exploration

```bash
# Get the full schema tree in one call (schemas + tables + columns)
quill schema explore
# Response contains data.schemas[].tables[].columns[]

# Explore a specific schema only
quill schema explore --schema public

# Explore a specific table
quill schema explore --table public.orders

# Increase the table limit (default: 50)
quill schema explore --max-tables 100
```

### Step-by-step exploration

```bash
# 1. List available schemas
quill schema list

# 2. List tables in a schema
quill schema tables --schema public

# 3. Show columns for a specific table
quill schema columns public.orders

# 4. Test the connection
quill schema test-connection
```

---

## Best Practices

1. **Authenticate first** - Run `quill login` before any operations
2. **Initialize project** - Run `quill config init` in your project directory
3. **Prefer compound commands** - Use `dashboard setup` and `schema explore` to reduce round trips
4. **Test before promoting** - Use `quill report run` and `quill vt test`
5. **Parse JSON responses** - Always check `ok` field before proceeding
6. **Use `--force` on deletes for automation** - Non-interactive agents and CI/CD should pass `--force` to skip confirmation prompts
7. **Use `--pretty` for debugging** - Easier to read output
8. **Keep staging/prod separate** - Use `quill env switch` explicitly
9. **Use `--verbose` for troubleshooting** - Logs to stderr for debugging
