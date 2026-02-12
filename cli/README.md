# Quill CLI

A command-line tool for managing Quill BI dashboards, reports, and virtual tables. All operations go through the Quill API (cloud or self-hosted) to MongoDB. Designed for LLM-friendly JSON output and IDE integration (Cursor, Claude Code).

## Architecture

```
Cloud users:       CLI → api.quillsql.com → MongoDB
Self-hosted users: CLI → your queryEndpoint (server SDK) → MongoDB
```

## Features

- **Dashboard Management**: Create, update, delete, and configure dashboards with global filters
- **Report Management**: Full CRUD for reports with SQL validation and pivot configuration
- **Virtual Tables**: Manage SQL views that power your reports
- **Environment Promotion**: Promote configurations from staging to production
- **Schema Inspection**: Browse database schemas, tables, and columns
- **AI Operations**: Generate SQL, fix errors, create pivots with AI
- **LLM-Friendly**: All output is JSON by default with stable error codes

## Installation

```bash
# Clone the repository
cd cli

# Install dependencies
npm install

# Build the CLI
npm run build

# Run directly (development)
npm run dev -- <command>

# Or link globally
npm link
quill <command>
```

## Quick Start

```bash
# Full setup: authenticate + initialize project + test connection
quill init --token <your-api-token> --client-id <id> --query-endpoint <url>

# Or step by step:
# quill login --token <your-api-token>
# quill config init --client-id <id> --endpoint <url>

# Explore your database schema
quill schema explore

# Create a dashboard with reports in one command
quill dashboard setup --name "Sales Analytics" --reports ./reports/

# Or create step by step
quill dashboard create --name "Sales Analytics"
quill report create --dashboard <dashboard-id> --file report.json

# List all dashboards
quill dashboard list

# Promote to production
quill promote dashboard <id> --from staging --to prod
```

> **Note:** `quill init` handles auth, project config, and connection testing in one step (uses `--query-endpoint`). `quill config init` only creates `.quill/config.json` (uses `--endpoint`). Use `quill init` for first-time setup.

## Configuration

### Global Configuration (~/.quill/config.json)

Stores authentication credentials and default settings:

```json
{
  "token": "access-token",
  "refreshToken": "refresh-token",
  "tokenExpiresAt": "2025-02-06T12:00:00.000Z",
  "email": "user@company.com",
  "orgName": "Acme Corp",
  "clerkOrgId": "org_abc123",
  "defaultEnv": "staging",
  "queryEndpoint": "https://your-quill-endpoint.com/v1/sdk"
}
```

### Project Configuration (.quill/config.json)

Project-specific settings created by `quill config init`:

```json
{
  "clientId": "your-client-id",
  "queryEndpoint": "https://api.quillsql.com/v1/sdk",
  "currentEnv": "staging"
}
```

## Commands

### Authentication

```bash
# Login via browser (Device Code Flow -- opens browser for Clerk auth)
quill login

# Login with API token (for CI/CD, non-interactive)
quill login --token <your-token>

# Check authentication status
quill whoami

# Logout (clears all stored credentials)
quill logout
```

### Configuration

```bash
# Initialize project
quill config init --client-id <id> --endpoint <url>

# Get configuration
quill config get
quill config get token --global

# Set configuration
quill config set currentEnv prod
quill config set token <token> --global
```

### Dashboards

```bash
# List dashboards
quill dashboard list

# Show dashboard details
quill dashboard show <dashboard-id>

# Create dashboard
quill dashboard create --name "My Dashboard"
quill dashboard create --name "My Dashboard" --file dashboard.json

# Setup: create dashboard + reports + filters in one command (with rollback on failure)
quill dashboard setup --name "Sales Analytics" --reports ./reports/ --filters filters.json
quill dashboard setup --name "Sales Analytics" --reports report1.json,report2.json
quill dashboard setup --name "Sales Analytics" --file dashboard.json --reports ./reports/

# Update dashboard
quill dashboard update <dashboard-id> --name "New Name"
quill dashboard update <dashboard-id> --file updates.json

# Delete dashboard (prompts for confirmation; use --force to skip)
quill dashboard delete <dashboard-id>
quill dashboard delete <dashboard-id> --force

# Set global filters
quill dashboard set-filters <dashboard-id> --file filters.json

# Set section order
quill dashboard set-section-order <dashboard-id> --file order.json
```

### Reports

```bash
# List reports for a dashboard
quill report list --dashboard <dashboard-id>

# Show report
quill report show <report-id>

# Create report
quill report create --dashboard <dashboard-id> --file report.json

# Update report
quill report update <report-id> --file updates.json

# Delete report (prompts for confirmation; use --force to skip)
quill report delete <report-id>
quill report delete <report-id> --force

# Run report (execute query)
quill report run <report-id>
quill report run <report-id> --filters filters.json

# Validate report configuration
quill report validate <report-id>
```

### Virtual Tables

```bash
# List virtual tables
quill vt list

# Show virtual table
quill vt show <vt-id>

# Create virtual table
quill vt create --name "orders_enriched" --sql "SELECT * FROM orders JOIN users ON orders.user_id = users.id"

# Update virtual table
quill vt update <vt-id> --sql "SELECT * FROM new_query"

# Delete virtual table (prompts for confirmation; use --force to skip)
quill vt delete <vt-id>
quill vt delete <vt-id> --force

# Test virtual table query
quill vt test <vt-id>

# Validate virtual table
quill vt validate <vt-id>
```

### Environment Promotion

```bash
# Promote dashboard
quill promote dashboard <id> --from staging --to prod

# Promote report
quill promote report <id> --from staging --to prod

# Promote virtual table
quill promote vt <id> --from staging --to prod

# Auto-resolve conflicts
quill promote dashboard <id> --from staging --to prod --auto-resolve
```

### Schema Operations

```bash
# Explore full database schema tree in one call (schemas, tables, columns)
quill schema explore
quill schema explore --schema public
quill schema explore --table public.users
quill schema explore --max-tables 100

# List schemas
quill schema list

# List tables
quill schema tables --schema public

# Show table columns
quill schema columns public.users

# Test database connection
quill schema test-connection
```

### AI Operations

```bash
# Generate SQL from natural language
quill ai query "Show me total revenue by month for 2024"

# Fix broken SQL
quill ai fix --sql "SELCT * FROM users" --error "syntax error at SELCT"

# Generate pivot configuration
quill ai pivot "Group revenue by product category and month" --report <id>

# Edit SQL with AI
quill ai edit --sql "SELECT * FROM users" --prompt "Add a WHERE clause for active users only"
```

### Query Operations

```bash
# Execute SQL query
quill query run --sql "SELECT * FROM users LIMIT 10"

# Execute with auto-fix: if the SQL has errors, AI fixes and retries automatically
quill query run --sql "SELECT * FROM users LIMIT 10" --auto-fix

# Parse SQL to AST
quill query parse --sql "SELECT * FROM users"

# Build SQL from AST
quill query build --ast ast.json

# Get execution plan
quill query explain --sql "SELECT * FROM users"
```

### Environments

```bash
# List environments
quill env list

# Show current environment details
quill env show

# Switch environment
quill env switch prod

# Update environment
quill env update <id> --file config.json

# Delete environment (prompts for confirmation; use --force to skip)
quill env delete <id>
quill env delete <id> --force
```

### Tenants

```bash
# List tenants
quill tenant list

# Get tenant mappings
quill tenant mapping get

# Validate tenant mapping
quill tenant validate --file mapping.json
```

## Global Flags

All commands support these flags:

| Flag | Description |
|------|-------------|
| `--env <staging\|prod>` | Target environment (default: staging) |
| `--json` | JSON output (default) |
| `--pretty` | Pretty-printed JSON output |
| `--verbose` | Verbose logging to stderr |
| `--token <token>` | API token for authentication |

## JSON Output Contract

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

### Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Resource not found |
| `INVALID_INPUT` | Invalid input data |
| `CONFLICT` | Conflicting resources |
| `AUTH_REQUIRED` | Authentication required |
| `IO_ERROR` | File system error |
| `NETWORK_ERROR` | Network request failed |
| `VALIDATION_ERROR` | Validation failed |
| `NOT_INITIALIZED` | CLI not initialized |
| `ALREADY_EXISTS` | Resource already exists |

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- dashboard list

# Build
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## License

MIT
