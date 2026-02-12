# Quill CLI Architecture

## Overview

The Quill CLI is designed to be an **LLM-friendly** command-line tool for managing BI dashboards, reports, and virtual tables. All operations go through the Quill API (cloud or self-hosted queryEndpoint) to MongoDB. Developers can use it directly from their IDE (Cursor, Claude Code) without leaving their development environment.

## Design Goals

1. **LLM-Friendly**: Structured JSON output, stable error codes, predictable behavior
2. **API-First**: All operations go through the remote API to MongoDB -- no local filesystem storage
3. **Flexible Hosting**: Works with Quill Cloud or self-hosted queryEndpoint
4. **Validation**: SQL structure validation, schema checks, AST parsing via API

## Architecture

```
                    ┌──────────────────────────┐
                    │        QUILL CLI          │
                    │                           │
                    │  Commands → Core → Output │
                    └────────────┬──────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                                      │
              ▼                                      ▼
┌──────────────────────────┐        ┌──────────────────────────┐
│     Quill Cloud API      │        │   Self-hosted Endpoint   │
│  api.quillsql.com/v1/sdk │        │   your-server/v1/sdk     │
└────────────┬─────────────┘        └────────────┬─────────────┘
             │                                    │
             └──────────────┬─────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │    MongoDB    │
                    └───────────────┘
```

### Data Flow

All CLI commands follow this pattern:

```
User Command
  → Commander.js parses args
  → preAction hook stores global options
  → Command handler (wrapped in withErrorHandling)
    → requireAuth() ensures authentication
    → core/client.ts → POST api.quillsql.com/v1/sdk?task=X
    → Optional: Zod validation on input/output
  → Output: JSON to stdout { ok: true/false, data/error, meta }
  → Verbose/debug: to stderr
```

## Directory Structure

```
cli/
├── src/
│   ├── cli.ts                 # Entry point, Commander setup
│   ├── index.ts               # Main exports
│   │
│   ├── commands/              # Command implementations
│   │   ├── index.ts           # Command registration
│   │   ├── dashboard.ts       # Dashboard CRUD + setup (compound create)
│   │   ├── report.ts          # Report CRUD
│   │   ├── virtual-table.ts   # Virtual table CRUD
│   │   ├── promote.ts         # Environment promotion
│   │   ├── query.ts           # SQL query operations + --auto-fix
│   │   ├── schema.ts          # Schema inspection + explore (compound tree)
│   │   ├── ai.ts              # AI-powered operations
│   │   ├── auth.ts            # Authentication commands
│   │   ├── config.ts          # Configuration management
│   │   ├── tenant.ts          # Tenant operations
│   │   └── environment.ts     # Environment management
│   │
│   ├── core/                  # Core business logic
│   │   ├── auth.ts            # Token management
│   │   ├── client.ts          # API client (all remote operations)
│   │   ├── config.ts          # Configuration loading
│   │   └── validator.ts       # Schema/SQL validation
│   │
│   ├── models/                # Data models (Zod schemas)
│   │   ├── index.ts           # Model exports
│   │   ├── dashboard.ts       # Dashboard schema
│   │   ├── report.ts          # Report schema
│   │   ├── virtual-table.ts   # Virtual table schema
│   │   ├── filter.ts          # Filter schema
│   │   └── pivot.ts           # Pivot schema
│   │
│   ├── output/                # Output formatting
│   │   ├── formatter.ts       # JSON output formatting
│   │   ├── errors.ts          # Error types and codes
│   │   └── success.ts         # Success response builder
│   │
│   └── utils/                 # Utilities
│       ├── sql.ts             # SQL parsing/validation
│       ├── ast.ts             # AST utilities
│       ├── id.ts              # ID generation
│       └── confirm.ts         # Interactive confirmation prompts
│
├── .quill/                    # Project config (per project)
│   └── config.json            # clientId, queryEndpoint, currentEnv
│
└── ~/.quill/                  # Global configuration
    └── config.json            # Token, default settings
```

## Component Details

### 1. Commands Layer

Each command module follows a consistent pattern:

```typescript
export function registerXxxCommands(program: Command): void {
  const cmd = program.command('xxx').description('...');
  
  cmd.command('list').action(withErrorHandling(async () => {
    // 1. requireAuth() - ensure authentication
    // 2. Call API via core/client.ts
    // 3. Output JSON response
  }));
}
```

### 2. Core Layer

#### auth.ts
- Two authentication methods:
  - **API Token**: `quill login --token <token>` for CI/CD and automation
  - **Device Code Flow**: `quill login` opens browser for Clerk-based auth with polling
- Token resolution precedence: env var → CLI flag → stored config (with auto-refresh)
- Automatic token refresh using refresh tokens from device code flow
- `requireAuth()` for commands that need authentication

#### client.ts
- Remote API client using native `fetch`
- All operations go to `POST /v1/sdk?task=<task_name>`
- Supports custom `queryEndpoint` for self-hosted deployments
- 30+ task methods covering all Quill operations

#### config.ts
- Global config (~/.quill/config.json): token, refreshToken, tokenExpiresAt, clerkOrgId, email, orgName, defaultEnv, queryEndpoint, serverUrl
- Project config (.quill/config.json): clientId, queryEndpoint, queryHeaders, currentEnv
- `getMergedConfig()` combines both, project overrides global

#### validator.ts
- Zod schema validation for dashboards, reports, virtual tables
- SQL syntax validation (local)
- Optional remote AST validation via API
- Pivot configuration validation

### 3. Output Layer

Consistent JSON output contract:

```typescript
// Success
{
  "ok": true,
  "data": { ... },
  "warnings": [],
  "meta": {
    "source": "remote",
    "timestamp": "ISO8601",
    "env": "staging" | "prod"
  }
}

// Error
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": { ... },
    "suggestions": ["..."]
  }
}
```

## API Task Mapping

All operations map to a single endpoint with a `task` parameter:

```
POST https://api.quillsql.com/v1/sdk?task=<task_name>
```

Or for self-hosted:
```
POST https://your-server.com/your-endpoint?task=<task_name>
```

### Dashboard Tasks
| Task | Description |
|------|-------------|
| `dashboards` | List all dashboards |
| `dashboard` | Get single dashboard |
| `edit-dashboard` | Create/update dashboard |
| `delete-dashboard` | Delete dashboard |
| `set-section-order` | Reorder sections |

### Report Tasks
| Task | Description |
|------|-------------|
| `report` | Get report with data |
| `report-info` | Get report metadata |
| `create` | Create/update report |
| `delete` | Delete report |

### Virtual Table Tasks
| Task | Description |
|------|-------------|
| `view` | Get virtual table |
| `virtual-tables` | List virtual tables |
| `create-virtual-table` | Create virtual table |
| `edit-virtual-table` | Update virtual table |
| `delete-virtual-table` | Delete virtual table |
| `query-view` | Query virtual table |
| `test-view` | Test virtual table |

### Query Tasks
| Task | Description |
|------|-------------|
| `query` | Execute SQL |
| `astify` | Parse SQL to AST |
| `sqlify` | Build SQL from AST |

### Schema Tasks
| Task | Description |
|------|-------------|
| `schema` | Get full schema |
| `tables-by-schema` | Get tables |
| `table-info` | Get table columns |
| `test-connection` | Test DB connection |
| `get-schema-names` | List schema names |

### AI Tasks
| Task | Description |
|------|-------------|
| `ai-from-client-schema` | Generate SQL from prompt |
| `plsfix` | Fix broken SQL |
| `pivotai` | Generate pivot config |
| `magic-edit` | AI query editing |

### Promotion Tasks
| Task | Description |
|------|-------------|
| `promote-dashboard` | Promote dashboard between environments |
| `promote-item` | Promote report between environments |
| `promote-view` | Promote virtual table between environments |

### Environment/Tenant Tasks
| Task | Description |
|------|-------------|
| `environment` | Get full environment data |
| `client` | Get client config |
| `clients` | List all clients/environments |
| `update-client` | Update environment settings |
| `delete-client` | Delete environment |
| `viewer-tenants` | List tenants |
| `tenant-mapping` | Get tenant mappings |
| `validate-tenant-mapping` | Validate mapping |

## Agent Integration

For LLM agents (Cursor, Claude Code) to use the CLI effectively:

### Agent-Friendly Features

- **Structured Output**: All responses are JSON, parseable by LLMs
- **Error Codes**: Stable codes for programmatic error handling
- **Suggestions**: Error responses include actionable suggestions
- **Verbose Mode**: `--verbose` for debugging

### Example Agent Flow

```
Agent: "Create a sales dashboard with revenue by month"

1. quill dashboard create --name "Sales Dashboard"
   → { ok: true, data: { created: { id: "dash_abc123" } } }

2. quill report create --dashboard dash_abc123 --file report.json
   → { ok: true, data: { created: { id: "rep_xyz789" } } }

3. quill dashboard show dash_abc123
   → { ok: true, data: { name: "Sales Dashboard", sections: [...] } }
```

## Authentication

Two methods are supported:

### 1. Device Code Flow (interactive -- for developers)

```bash
quill login
# Opens browser → user logs in via Clerk → CLI receives token
```

The CLI requests a device code from the server, opens the browser to a verification URL, and polls until the user approves. The resulting access token and refresh token are stored in `~/.quill/config.json`. Expired tokens are automatically refreshed.

### 2. API Token (non-interactive -- for CI/CD)

```bash
quill login --token <token>
# or
QUILL_API_TOKEN=xxx quill dashboard list
```

Static API tokens are stored directly without refresh logic.

### Token Resolution Precedence

1. `QUILL_API_TOKEN` environment variable
2. `--token` CLI flag
3. Stored token in `~/.quill/config.json` (auto-refreshed if expired)

## Configuration Reference

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `QUILL_API_TOKEN` | API authentication token | For CI/CD (alternative to `quill login`) |

### Global Config (~/.quill/config.json)

```json
{
  "token": "access-token",
  "refreshToken": "refresh-token",
  "tokenExpiresAt": "2025-02-06T12:00:00.000Z",
  "clerkOrgId": "org_abc123",
  "email": "user@company.com",
  "orgName": "Acme Corp",
  "defaultEnv": "staging",
  "queryEndpoint": "https://api.quillsql.com/v1/sdk"
}
```

### Project Config (.quill/config.json)

```json
{
  "clientId": "client_abc123",
  "queryEndpoint": "https://custom-endpoint.com/v1/sdk",
  "queryHeaders": { "X-Custom-Header": "value" },
  "currentEnv": "staging",
  "withCredentials": false
}
```

## Global CLI Flags

| Flag | Description |
|------|-------------|
| `--env <environment>` | Target environment (staging or prod) |
| `--json` | Output as JSON (default) |
| `--pretty` | Pretty-print JSON output |
| `--verbose` | Enable verbose logging to stderr |
| `--token <token>` | API token for authentication |

## Future Enhancements

1. **MCP Server**: Expose CLI as Model Context Protocol server
2. **GitHub Actions**: Auto-sync virtual schema on code changes
3. **Watch Mode**: Auto-detect schema changes and update Quill
4. **Interactive Mode**: REPL for exploration
5. **Schema Cache**: Cache remote schema locally for faster validation
