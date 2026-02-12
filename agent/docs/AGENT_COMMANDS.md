# Quill AI Agent — Available Commands

The agent has access to **38 tools** that map to Quill CLI commands. Users interact through natural language, and GPT selects the appropriate tool(s) to execute.

## Authentication

| Command | Tool | Description |
|---------|------|-------------|
| `quill whoami` | `quill_whoami` | Check current authentication status, token source, email, and org |
| `quill init` | `quill_init` | First-time setup: authenticate, configure project, verify connection |

**Example prompts:**
- "Am I logged in?"
- "Initialize the CLI with my token"

---

## Configuration

| Command | Tool | Description |
|---------|------|-------------|
| `quill config get` | `quill_config_get` | Show current CLI config (clientId, environment, endpoints) |
| `quill config get <key>` | `quill_config_get` | Get a specific config value |

**Example prompts:**
- "What's my current config?"
- "What environment am I connected to?"

---

## Dashboards

| Command | Tool | Description |
|---------|------|-------------|
| `quill dashboard list` | `quill_dashboard_list` | List all dashboards with report/filter counts |
| `quill dashboard show <name>` | `quill_dashboard_show` | Show full dashboard details (sections, reports, filters) |
| `quill dashboard create --name <name>` | `quill_dashboard_create` | Create a new empty dashboard |
| `quill dashboard update <name>` | `quill_dashboard_update` | Update a dashboard (rename, modify) |
| `quill dashboard delete <name>` | `quill_dashboard_delete` | Delete a dashboard (irreversible) |
| `quill dashboard set-filters <name>` | `quill_dashboard_set_filters` | Set global filters on a dashboard |
| `quill dashboard setup --name <name>` | `quill_dashboard_setup` | Create a dashboard with reports and filters in one step |

**Example prompts:**
- "Show me all my dashboards"
- "Create a dashboard called Sales Overview"
- "Delete the test dashboard"
- "Set up a new dashboard with a revenue report and a users report"

---

## Reports

| Command | Tool | Description |
|---------|------|-------------|
| `quill report list --dashboard <name>` | `quill_report_list` | List all reports in a dashboard |
| `quill report show <id>` | `quill_report_show` | Show report details and configuration |
| `quill report create --dashboard <name>` | `quill_report_create` | Create a new report with SQL, chart type, and config |
| `quill report update <id>` | `quill_report_update` | Update an existing report |
| `quill report delete <id>` | `quill_report_delete` | Delete a report |
| `quill report run <id>` | `quill_report_run` | Execute a report's query and return the data |
| `quill report validate <id>` | `quill_report_validate` | Validate a report's configuration |

**Example prompts:**
- "List reports in the Sales dashboard"
- "Create a table report showing the latest 10 transactions"
- "Run the revenue report and show me the data"
- "Delete report abc123"

### Report config fields

When creating a report, the agent sends:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Report name |
| `query` | Yes | SQL query |
| `chartType` | Yes | `bar`, `line`, `area`, `table`, `metric`, `pie`, `column`, `gauge`, `scatter`, `funnel` |
| `pivot` | No | Pivot table configuration |
| `dateField` | No | Date field for time-based filtering |
| `filterMap` | No | Map of filters to table.column |

---

## Virtual Tables

| Command | Tool | Description |
|---------|------|-------------|
| `quill vt list` | `quill_vt_list` | List all virtual tables (via schema) |
| `quill vt show <id>` | `quill_vt_show` | Show virtual table details |
| `quill vt create --name <name> --sql <sql>` | `quill_vt_create` | Create a virtual table with SQL |
| `quill vt update <id>` | `quill_vt_update` | Update a virtual table |
| `quill vt delete <id>` | `quill_vt_delete` | Delete a virtual table |
| `quill vt test <id>` | `quill_vt_test` | Test a virtual table by executing its SQL |
| `quill vt validate <id>` | `quill_vt_validate` | Validate a virtual table's configuration |

**Example prompts:**
- "List all virtual tables"
- "Create a virtual table called active_users with SQL: SELECT * FROM users WHERE active = true"
- "Test virtual table xyz"

---

## Schema / Database

| Command | Tool | Description |
|---------|------|-------------|
| `quill schema explore` | `quill_schema_explore` | Full schema tree: schemas, tables, columns in one call |
| `quill schema list` | `quill_schema_list` | List available database schemas |
| `quill schema tables` | `quill_schema_tables` | List tables in a schema |
| `quill schema columns <table>` | `quill_schema_columns` | Show columns for a specific table |
| `quill schema test-connection` | `quill_schema_test_connection` | Test the database connection |

**Example prompts:**
- "Explore the database schema"
- "What tables are in the public schema?"
- "Show me the columns in the transactions table"
- "Test the database connection"

---

## SQL Queries

| Command | Tool | Description |
|---------|------|-------------|
| `quill query run --sql <sql>` | `quill_query_run` | Execute a raw SQL query |
| `quill query explain --sql <sql>` | `quill_query_explain` | Get the execution plan for a SQL query |

Options:
- `--auto-fix` — automatically use AI to fix SQL errors and retry

**Example prompts:**
- "Run this query: SELECT COUNT(*) FROM users"
- "Run SELECT * FROM orders and auto-fix any errors"
- "Explain this query's execution plan"

---

## AI-Powered SQL

| Command | Tool | Description |
|---------|------|-------------|
| `quill ai query <prompt>` | `quill_ai_query` | Generate SQL from a natural language description |
| `quill ai fix --sql <sql> --error <error>` | `quill_ai_fix` | Fix broken SQL using AI |
| `quill ai pivot <prompt>` | `quill_ai_pivot` | Generate a pivot table configuration with AI |
| `quill ai edit --sql <sql> --prompt <prompt>` | `quill_ai_edit` | Edit existing SQL using AI instructions |

**Example prompts:**
- "Generate SQL to show monthly revenue by category"
- "Fix this query: SELECT * FORM users — error: relation 'FORM' does not exist"
- "Create a pivot config for the sales report"
- "Edit this SQL to add a WHERE clause for last 30 days"

---

## Environments

| Command | Tool | Description |
|---------|------|-------------|
| `quill env list` | `quill_env_list` | List all environments/clients |
| `quill env show` | `quill_env_show` | Show current environment details (tables, schema, config) |
| `quill env switch <env>` | `quill_env_switch` | Switch between `staging` and `prod` |

**Example prompts:**
- "Which environment am I in?"
- "Switch to production"
- "List all environments"

---

## Promote (Staging → Production)

| Command | Tool | Description |
|---------|------|-------------|
| `quill promote dashboard <name>` | `quill_promote_dashboard` | Promote a dashboard between environments |
| `quill promote report <id>` | `quill_promote_report` | Promote a report between environments |
| `quill promote vt <name>` | `quill_promote_vt` | Promote a virtual table between environments |

**Example prompts:**
- "Promote the Sales dashboard to production"
- "Promote report abc123 to prod"
- "Promote the active_users virtual table"

---

## Tenants

| Command | Tool | Description |
|---------|------|-------------|
| `quill tenant list` | `quill_tenant_list` | List available tenants |
| `quill tenant mapping get` | `quill_tenant_mapping_get` | Get current tenant mapping configuration |

**Example prompts:**
- "Show me the tenant configuration"
- "List all tenants"

---

## How It Works

```
User: "Show me the latest transactions as a table"
  │
  ▼
GPT selects tools:
  1. quill_ai_query("Show the latest transactions as a table")
  2. quill_dashboard_list() — to find a dashboard
  3. quill_report_create(dashboard, { query, chartType: "table" })
  │
  ▼
Agent executor runs CLI commands:
  1. quill ai query "Show the latest transactions" --json
  2. quill dashboard list --json
  3. quill report create --dashboard "transactions" --file /tmp/report.json --json
  │
  ▼
CLI sends requests to /api/quill → Quill SDK → Database
  │
  ▼
Results returned to GPT → natural language response to user
```

## Total: 38 tools across 10 categories
