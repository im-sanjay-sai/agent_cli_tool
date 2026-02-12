# Quill CLI Commands Reference

Complete reference for all CLI commands. All operations go through the Quill API to MongoDB.

## Extracting IDs from Responses

Many commands return resource IDs needed for subsequent operations. The ID may appear as `id` or `_id` depending on the API. Always check both:

```
data.created.id   || data.created._id    (for create commands)
data.items[].id   || data.items[]._id    (for list commands)
```

---

## Authentication

### `quill login`
Authenticate with Quill API.
```bash
quill login                    # Device Code Flow (opens browser)
quill login --token <token>    # Static API token (for CI/CD)
```

**Response:**
```json
{ "ok": true, "data": { "message": "Successfully logged in with API token", "method": "token", "tokenStored": true } }
```

### `quill logout`
Clear stored credentials.
```bash
quill logout
```

### `quill whoami`
Show current authentication status.
```bash
quill whoami
```

**Response:**
```json
{ "ok": true, "data": { "authenticated": true, "tokenSource": "config", "tokenPreview": "eyJh****ab12", "email": "user@company.com", "orgName": "Acme Corp" } }
```

---

## Configuration

### `quill config init`
Initialize Quill CLI in current directory.
```bash
quill config init --client-id <id> --endpoint <url>
quill config init --force  # Overwrite existing
```

### `quill init`
Full initialization: authenticate, set up project config, and verify connection.
```bash
quill init --token <token> --client-id <id> --query-endpoint <url> --env staging
quill init --skip-connection-test
```

> **Note:** `quill init` uses `--query-endpoint`; `quill config init` uses `--endpoint`. `quill init` also handles authentication and connection testing.

### `quill config get`
Get configuration values.
```bash
quill config get                      # Get all config
quill config get token --global       # Get specific key
quill config get clientId --project   # Project config only
```

### `quill config set`
Set configuration value.
```bash
quill config set currentEnv prod
quill config set token <token> --global
```

**Valid keys:**
- Global: `token`, `defaultEnv`, `queryEndpoint`, `serverUrl`
- Project: `clientId`, `queryEndpoint`, `currentEnv`, `withCredentials`, `queryHeaders`

---

## Dashboard Management

### `quill dashboard list`
List all dashboards.
```bash
quill dashboard list
# Alias: quill dash list
```

**Response shape:**
```json
{ "ok": true, "data": { "items": [{ "id": "dash_abc123", "name": "Sales Analytics", "reportCount": 3, "filterCount": 2 }], "total": 1 } }
```
**ID path:** `data.items[].id`

### `quill dashboard show`
Show dashboard details.
```bash
quill dashboard show <dashboard-id>
```

**Response shape:** `data` contains the full dashboard object from the API (sections, reports, filters, etc.).

### `quill dashboard create`
Create a new dashboard.
```bash
quill dashboard create --name "My Dashboard"
quill dashboard create --name "My Dashboard" --file dashboard.json
```

**Response shape:**
```json
{ "ok": true, "data": { "created": { "id": "dash_abc123", "name": "My Dashboard", ... } } }
```
**ID path:** `data.created.id` or `data.created._id`

**Defaults:** `globalFilters: []`, `reportIds: []`. Filter IDs are auto-generated as `filter_0`, `filter_1`, etc. if not provided in the JSON file.

### `quill dashboard setup`
Create a dashboard with reports and filters in one command. If report creation fails, the dashboard is automatically rolled back (deleted).
```bash
quill dashboard setup --name "Sales Analytics" --reports ./reports/ --filters filters.json
quill dashboard setup --name "Sales Analytics" --reports report1.json,report2.json
quill dashboard setup --name "Sales Analytics" --file dashboard.json --reports ./reports/
```

| Flag | Required | Description |
|------|----------|-------------|
| `--name <name>` | Yes | Dashboard name |
| `--reports <paths>` | No | Comma-separated JSON file paths, OR a directory containing report JSON files |
| `--filters <path>` | No | JSON file with global filters config (ignored if `--file` already contains filters) |
| `--file <path>` | No | Full dashboard config JSON (name, globalFilters, layout, tenantKeys) |

**Response shape:**
```json
{
  "ok": true,
  "data": {
    "dashboardId": "dash_abc123",
    "name": "Sales Analytics",
    "reportsCreated": 2,
    "reports": [
      { "name": "Revenue by Month", "id": "rpt_xyz789" },
      { "name": "Top Customers", "id": "rpt_def456" }
    ],
    "dashboard": { ... }
  }
}
```
**ID path:** `data.dashboardId` for the dashboard, `data.reports[].id` for each report.

**Rollback:** If any step fails after the dashboard is created, the dashboard is automatically deleted. Partial report failures are reported as warnings but do not trigger rollback.

### `quill dashboard update`
Update a dashboard.
```bash
quill dashboard update <id> --name "New Name"
quill dashboard update <id> --file updates.json
```

**Response shape:**
```json
{ "ok": true, "data": { "updated": { ... } } }
```

### `quill dashboard delete`
Delete a dashboard. Prompts for confirmation; use `--force` to skip.
```bash
quill dashboard delete <id>
quill dashboard delete <id> --force
```

**Response shape:**
```json
{ "ok": true, "data": { "deleted": { "id": "dash_abc123", "type": "dashboard" } } }
```

### `quill dashboard set-filters`
Set dashboard global filters.
```bash
quill dashboard set-filters <id> --file filters.json
```

### `quill dashboard set-section-order`
Set dashboard section order.
```bash
quill dashboard set-section-order <id> --file order.json
```

---

## Report Management

### `quill report list`
List reports for a dashboard.
```bash
quill report list --dashboard <dashboard-id>
```

**Response shape:**
```json
{ "ok": true, "data": { "items": [{ "id": "rpt_xyz789", "name": "Revenue by Month", "dashboardId": "dash_abc123", "chartType": "line", "hasPivot": false }], "total": 1 } }
```
**ID path:** `data.items[].id`

### `quill report show`
Show report details.
```bash
quill report show <report-id>
```

### `quill report create`
Create a new report. **Requires JSON file.**
```bash
quill report create --dashboard <dashboard-id> --file report.json
```

**Response shape:**
```json
{ "ok": true, "data": { "created": { "id": "rpt_xyz789", ... } } }
```
**ID path:** `data.created.id` or `data.created._id`

**Defaults:** `chartType: "table"`, `order: 0`, `params: []`, `pivot: null`.

### `quill report update`
Update a report.
```bash
quill report update <id> --file updates.json
```

### `quill report delete`
Delete a report. Prompts for confirmation; use `--force` to skip.
```bash
quill report delete <id>
quill report delete <id> --force
```

**Response shape:**
```json
{ "ok": true, "data": { "deleted": { "id": "rpt_xyz789", "type": "report" } } }
```

### `quill report run`
Execute report query and return data.
```bash
quill report run <id>
quill report run <id> --filters filters.json
```

**Response shape:**
```json
{ "ok": true, "data": { "reportId": "rpt_xyz789", "rows": [{ "month": "2024-01", "revenue": 50000 }], "fields": [{ "name": "month", "fieldType": "date" }], "rowCount": 12 } }
```

### `quill report validate`
Validate report configuration (schema, SQL, pivot, AST).
```bash
quill report validate <id>
```

**Response shape:**
```json
{ "ok": true, "data": { "valid": true, "errors": [], "warnings": [] } }
```

---

## Virtual Table Management

### `quill vt list`
List all virtual tables.
```bash
quill vt list
# Alias: quill virtual-table list
```

**Response shape:**
```json
{ "ok": true, "data": { "items": [{ "id": "vt_abc123", "name": "orders_enriched", "columnCount": 8, "ownerTenantFields": ["org_id"] }], "total": 1 } }
```
**ID path:** `data.items[].id`

### `quill vt show`
Show virtual table details.
```bash
quill vt show <vt-id>
```

### `quill vt create`
Create a new virtual table.
```bash
quill vt create --name "orders_enriched" --sql "SELECT * FROM orders JOIN users ON orders.user_id = users.id"
quill vt create --name "orders_enriched" --sql "..." --owner-fields "org_id,team_id"
```

**Response shape:**
```json
{ "ok": true, "data": { "created": { "id": "vt_abc123", ... } } }
```
**ID path:** `data.created.id` or `data.created._id`

### `quill vt update`
Update a virtual table.
```bash
quill vt update <id> --sql "SELECT * FROM new_query"
quill vt update <id> --name "new_name"
quill vt update <id> --owner-fields "org_id"
```

### `quill vt delete`
Delete a virtual table. Prompts for confirmation; use `--force` to skip.
```bash
quill vt delete <id>
quill vt delete <id> --force
```

**Response shape:**
```json
{ "ok": true, "data": { "deleted": { "id": "vt_abc123", "type": "virtual_table" } } }
```

### `quill vt test`
Test virtual table query execution.
```bash
quill vt test <id>
```

### `quill vt validate`
Validate virtual table configuration.
```bash
quill vt validate <id>
```

---

## Schema Operations

### `quill schema explore`
Explore the full database schema tree in one call -- returns schemas, tables, and columns.
```bash
quill schema explore
quill schema explore --schema public
quill schema explore --table public.users
quill schema explore --max-tables 100
```

| Flag | Default | Description |
|------|---------|-------------|
| `--schema <name>` | all schemas | Only explore a specific schema |
| `--table <name>` | none | Only explore a specific table (format: `schema.table` or just `table` for public) |
| `--max-tables <n>` | `50` | Maximum number of tables to fetch columns for |

**Response shape:**
```json
{
  "ok": true,
  "data": {
    "schemas": [{
      "schema": "public",
      "tables": [{
        "name": "orders",
        "columns": [{ "name": "id", "type": "integer" }, { "name": "total_amount", "type": "numeric" }]
      }]
    }],
    "totalSchemas": 1,
    "totalTables": 5
  }
}
```

### `quill schema list`
List available database schemas.
```bash
quill schema list
```

### `quill schema tables`
List tables in a schema.
```bash
quill schema tables
quill schema tables --schema public
```

### `quill schema columns`
Show columns for a table. If no schema prefix is given, defaults to `public`.
```bash
quill schema columns public.users
quill schema columns orders           # defaults to public.orders
```

### `quill schema test-connection`
Test database connection.
```bash
quill schema test-connection
```

**Response shape:**
```json
{ "ok": true, "data": { "connected": true, "message": "Connection successful" } }
```

---

## Query Operations

### `quill query run`
Execute a SQL query.
```bash
quill query run --sql "SELECT * FROM users LIMIT 10"
quill query run --sql "SELECT * FROM orders WHERE status = :status" --filters filters.json
quill query run --sql "SELECT * FROM users LIMIT 10" --auto-fix
```

| Flag | Required | Description |
|------|----------|-------------|
| `--sql <query>` | Yes | SQL query to execute |
| `--filters <path>` | No | JSON file with filters |
| `--auto-fix` | No | On SQL error, automatically use AI to fix and retry once |

**Response shape (normal):**
```json
{ "ok": true, "data": { "rows": [{ "id": 1, "name": "Alice" }], "fields": [{ "name": "id", "fieldType": "integer" }], "rowCount": 1 } }
```

**Response shape (with `--auto-fix`, when fix succeeds):**
```json
{
  "ok": true,
  "data": {
    "autoFix": {
      "originalSql": "SELCT * FROM users",
      "originalError": "syntax error at SELCT",
      "fixedSql": "SELECT * FROM users",
      "resolved": true
    },
    "rows": [...],
    "fields": [...],
    "rowCount": 10
  }
}
```

**Response shape (with `--auto-fix`, when fix also fails):**
```json
{
  "ok": true,
  "data": {
    "autoFix": {
      "originalSql": "...",
      "originalError": "...",
      "fixedSql": "...",
      "retryError": "...",
      "resolved": false
    },
    "rows": [],
    "fields": [],
    "rowCount": 0
  },
  "warnings": ["Original query failed: ...", "AI-fixed query also failed: ..."]
}
```

### `quill query parse`
Parse SQL to AST.
```bash
quill query parse --sql "SELECT id, name FROM users"
```

### `quill query build`
Build SQL from AST.
```bash
quill query build --ast ast.json
```

### `quill query explain`
Get query execution plan.
```bash
quill query explain --sql "SELECT * FROM orders"
```

---

## AI Operations

### `quill ai query`
Generate SQL from natural language.
```bash
quill ai query "Show me total revenue by month for 2024"
quill ai query "Top 10 customers by order count" --schemas public,sales
```

**Response shape:**
```json
{ "ok": true, "data": { "prompt": "Show me total revenue by month for 2024", "sql": "SELECT DATE_TRUNC('month', created_at) AS month, SUM(total_amount) AS revenue FROM orders GROUP BY 1 ORDER BY 1" } }
```

### `quill ai fix`
Fix broken SQL using AI.
```bash
quill ai fix --sql "SELCT * FROM users" --error "syntax error at SELCT"
```

**Response shape:**
```json
{ "ok": true, "data": { "originalSql": "SELCT * FROM users", "error": "syntax error at SELCT", "fixedSql": "SELECT * FROM users" } }
```

### `quill ai pivot`
Generate pivot configuration using AI.
```bash
quill ai pivot "Group revenue by product category and month"
quill ai pivot "Sum sales by region" --report <report-id>
```

### `quill ai edit`
Edit SQL using AI.
```bash
quill ai edit --sql "SELECT * FROM users" --prompt "Add WHERE clause for active users only"
```

**Response shape:**
```json
{ "ok": true, "data": { "originalSql": "SELECT * FROM users", "prompt": "Add WHERE clause for active users only", "editedSql": "SELECT * FROM users WHERE active = true" } }
```

---

## Tenant Operations

### `quill tenant list`
List available tenants.
```bash
quill tenant list
```

### `quill tenant mapping get`
Get tenant mappings.
```bash
quill tenant mapping get
```

### `quill tenant validate`
Validate tenant mapping.
```bash
quill tenant validate --file tenant-mapping.json
```

**Response shape:**
```json
{ "ok": true, "data": { "valid": true, "errors": [], "warnings": [] } }
```

---

## Environment Operations

### `quill env list`
List available environments/clients.
```bash
quill env list
# Alias: quill environment list
```

### `quill env show`
Show current environment details.
```bash
quill env show
```

### `quill env update`
Update environment settings.
```bash
quill env update <id> --file updates.json
```

### `quill env delete`
Delete an environment. Prompts for confirmation; use `--force` to skip.
```bash
quill env delete <id>
quill env delete <id> --force
```

### `quill env switch`
Switch current environment.
```bash
quill env switch staging
quill env switch prod
```

---

## Promotion Operations

### `quill promote dashboard`
Promote a dashboard to another environment.
```bash
quill promote dashboard <id> --from staging --to prod
quill promote dashboard <id> --from staging --to prod --auto-resolve
```

### `quill promote report`
Promote a report to another environment.
```bash
quill promote report <id> --from staging --to prod
```

### `quill promote vt`
Promote a virtual table to another environment.
```bash
quill promote vt <id> --from staging --to prod
```
