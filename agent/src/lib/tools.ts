import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ============= Tool Definitions =============

export const tools: ChatCompletionTool[] = [
  // --- Auth ---
  {
    type: "function",
    function: {
      name: "quill_whoami",
      description:
        "Check current authentication status. Returns whether the user is authenticated, token source, email, and organization.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },

  // --- Config ---
  {
    type: "function",
    function: {
      name: "quill_config_get",
      description:
        "Get current CLI configuration (global and project). Shows clientId, environment, endpoints.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Optional specific config key to get",
          },
        },
        required: [],
      },
    },
  },

  // --- Init (compound) ---
  {
    type: "function",
    function: {
      name: "quill_init",
      description:
        "Initialize Quill CLI: authenticate, set up project config, and verify connection. Use this for first-time setup.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "API token for authentication" },
          clientId: { type: "string", description: "Quill client ID for this project" },
          queryEndpoint: { type: "string", description: "Custom query endpoint URL" },
          env: {
            type: "string",
            enum: ["staging", "prod"],
            description: "Default environment",
          },
        },
        required: [],
      },
    },
  },

  // --- Dashboard ---
  {
    type: "function",
    function: {
      name: "quill_dashboard_list",
      description:
        "List all dashboards. Returns IDs, names, report counts, and filter counts.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_dashboard_show",
      description:
        "Show full details of a dashboard including sections, reports, and global filters.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Dashboard ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_dashboard_create",
      description: "Create a new empty dashboard. Returns the created dashboard with its ID.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Dashboard name" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_dashboard_update",
      description: "Update an existing dashboard.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Dashboard ID" },
          name: { type: "string", description: "New dashboard name" },
          updates: {
            type: "object",
            description: "JSON object with fields to update",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_dashboard_delete",
      description: "Delete a dashboard by ID. This is irreversible.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Dashboard ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_dashboard_set_filters",
      description:
        "Set global filters on a dashboard. Filters apply to all reports.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Dashboard ID" },
          filters: {
            type: "object",
            description:
              "Filters config JSON (must include globalFilters array)",
          },
        },
        required: ["id", "filters"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_dashboard_setup",
      description:
        "Create a dashboard with reports and filters in one command. Handles ID threading and rollback on failure. Use this for creating a complete dashboard.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Dashboard name" },
          reports: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Report name" },
                baseSql: { type: "string", description: "SQL query for the report" },
                chartType: {
                  type: "string",
                  enum: ["bar", "line", "area", "table", "metric", "pie", "column", "gauge", "scatter", "funnel"],
                  description: "Chart type",
                },
              },
              required: ["name", "baseSql", "chartType"],
            },
            description: "Array of report configurations to create",
          },
          filters: {
            type: "object",
            description: "Global filters configuration",
          },
        },
        required: ["name"],
      },
    },
  },

  // --- Report ---
  {
    type: "function",
    function: {
      name: "quill_report_list",
      description: "List all reports for a dashboard.",
      parameters: {
        type: "object",
        properties: {
          dashboardId: { type: "string", description: "Dashboard ID" },
        },
        required: ["dashboardId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_report_show",
      description: "Show full details of a report.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Report ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_report_create",
      description:
        "Create a new report in a dashboard. Requires a report config with name, baseSql, and chartType.",
      parameters: {
        type: "object",
        properties: {
          dashboardId: { type: "string", description: "Dashboard ID to add the report to" },
          config: {
            type: "object",
            properties: {
              name: { type: "string", description: "Report name" },
              baseSql: { type: "string", description: "SQL query" },
              chartType: {
                type: "string",
                enum: ["bar", "line", "area", "table", "metric", "pie", "column", "gauge", "scatter", "funnel"],
                description: "Chart visualization type",
              },
              pivot: { type: "object", description: "Optional pivot configuration" },
              dateField: { type: "string", description: "Optional date field name" },
            },
            required: ["name", "baseSql", "chartType"],
          },
        },
        required: ["dashboardId", "config"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_report_update",
      description: "Update an existing report.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Report ID" },
          updates: { type: "object", description: "Fields to update" },
        },
        required: ["id", "updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_report_delete",
      description: "Delete a report by ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Report ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_report_run",
      description: "Execute a report's query and return the data.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Report ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_report_validate",
      description: "Validate a report's configuration (schema, SQL, pivot).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Report ID" },
        },
        required: ["id"],
      },
    },
  },

  // --- Virtual Table ---
  {
    type: "function",
    function: {
      name: "quill_vt_list",
      description: "List all virtual tables.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_vt_show",
      description: "Show full details of a virtual table.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Virtual table ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_vt_create",
      description: "Create a new virtual table with SQL and optional tenant fields.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Virtual table name" },
          sql: { type: "string", description: "SQL query defining the virtual table" },
          ownerTenantFields: { type: "string", description: "Comma-separated tenant field names" },
        },
        required: ["name", "sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_vt_update",
      description: "Update an existing virtual table.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Virtual table ID" },
          updates: { type: "object", description: "Fields to update (name, sql, ownerTenantFields)" },
        },
        required: ["id", "updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_vt_delete",
      description: "Delete a virtual table by ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Virtual table ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_vt_test",
      description: "Test a virtual table by executing its SQL query.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Virtual table ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_vt_validate",
      description: "Validate a virtual table's configuration.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Virtual table ID" },
        },
        required: ["id"],
      },
    },
  },

  // --- Schema ---
  {
    type: "function",
    function: {
      name: "quill_schema_explore",
      description:
        "Explore the full database schema tree — schemas, tables, and columns in one call. Use this to understand the database structure.",
      parameters: {
        type: "object",
        properties: {
          schema: { type: "string", description: "Only explore a specific schema" },
          table: { type: "string", description: "Only explore a specific table (schema.table format)" },
          maxTables: { type: "number", description: "Max tables to fetch columns for (default 50)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_schema_list",
      description: "List available database schemas.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_schema_tables",
      description: "List tables in a specific schema.",
      parameters: {
        type: "object",
        properties: {
          schema: { type: "string", description: "Schema name (e.g. public)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_schema_columns",
      description: "Show columns for a specific table.",
      parameters: {
        type: "object",
        properties: {
          table: {
            type: "string",
            description: 'Table name in "schema.table" format (e.g. "public.users")',
          },
        },
        required: ["table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_schema_test_connection",
      description: "Test the database connection.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },

  // --- Query ---
  {
    type: "function",
    function: {
      name: "quill_query_run",
      description:
        "Execute a SQL query. Supports --auto-fix to automatically use AI to fix and retry on SQL errors.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query to execute" },
          autoFix: {
            type: "boolean",
            description: "If true, automatically fix SQL errors with AI and retry",
          },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_query_explain",
      description: "Get the execution plan (EXPLAIN) for a SQL query.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL query to explain" },
        },
        required: ["sql"],
      },
    },
  },

  // --- AI ---
  {
    type: "function",
    function: {
      name: "quill_ai_query",
      description:
        "Generate SQL from a natural language description. Uses AI to understand the request and produce valid SQL based on the database schema.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Natural language description of the data you want",
          },
          schemas: {
            type: "string",
            description: "Comma-separated schema names to use (optional)",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_ai_fix",
      description: "Fix broken SQL using AI. Provide the broken SQL and the error message.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "The broken SQL query" },
          error: { type: "string", description: "The error message" },
        },
        required: ["sql", "error"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_ai_pivot",
      description: "Generate a pivot table configuration using AI.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Description of desired pivot configuration",
          },
          reportId: {
            type: "string",
            description: "Optional report ID to apply pivot to",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_ai_edit",
      description: "Edit an existing SQL query using AI. Describe the changes you want.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "The existing SQL query" },
          prompt: { type: "string", description: "Description of changes to make" },
        },
        required: ["sql", "prompt"],
      },
    },
  },

  // --- Environment ---
  {
    type: "function",
    function: {
      name: "quill_env_list",
      description: "List all environments.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_env_show",
      description: "Show details of an environment.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Environment ID (optional, shows current if omitted)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_env_switch",
      description: "Switch the active environment (staging or prod).",
      parameters: {
        type: "object",
        properties: {
          env: { type: "string", enum: ["staging", "prod"], description: "Environment to switch to" },
        },
        required: ["env"],
      },
    },
  },

  // --- Promote ---
  {
    type: "function",
    function: {
      name: "quill_promote_dashboard",
      description: "Promote a dashboard from staging to production.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Dashboard ID" },
          from: { type: "string", description: "Source environment", enum: ["staging", "prod"] },
          to: { type: "string", description: "Target environment", enum: ["staging", "prod"] },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_promote_report",
      description: "Promote a report from staging to production.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Report ID" },
          from: { type: "string", description: "Source environment", enum: ["staging", "prod"] },
          to: { type: "string", description: "Target environment", enum: ["staging", "prod"] },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_promote_vt",
      description: "Promote a virtual table from staging to production.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Virtual table ID" },
          from: { type: "string", description: "Source environment", enum: ["staging", "prod"] },
          to: { type: "string", description: "Target environment", enum: ["staging", "prod"] },
        },
        required: ["id"],
      },
    },
  },

  // --- Tenant ---
  {
    type: "function",
    function: {
      name: "quill_tenant_list",
      description: "List available tenants.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "quill_tenant_mapping_get",
      description: "Get current tenant mapping configuration.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ============= Tool Name → CLI Command Mapping =============

/* eslint-disable @typescript-eslint/no-explicit-any */
export const toolToCommand: Record<string, (args: any) => string[]> = {
  // Auth
  quill_whoami: () => ["whoami"],

  // Config
  quill_config_get: (a: any) => (a?.key ? ["config", "get", a.key] : ["config", "get"]),

  // Init (compound)
  quill_init: (a: any) => {
    const args = ["init"];
    if (a?.token) args.push("--token", a.token);
    if (a?.clientId) args.push("--client-id", a.clientId);
    if (a?.queryEndpoint) args.push("--query-endpoint", a.queryEndpoint);
    if (a?.env) args.push("--env", a.env);
    return args;
  },

  // Dashboard
  quill_dashboard_list: () => ["dashboard", "list"],
  quill_dashboard_show: (a: any) => ["dashboard", "show", a.id],
  quill_dashboard_create: (a: any) => ["dashboard", "create", "--name", a.name],
  quill_dashboard_update: (a: any) => {
    const args = ["dashboard", "update", a.id];
    if (a?.name) args.push("--name", a.name);
    return args;
  },
  quill_dashboard_delete: (a: any) => ["dashboard", "delete", a.id, "--force"],
  quill_dashboard_set_filters: (a: any) => ["dashboard", "set-filters", a.id],
  quill_dashboard_setup: (a: any) => {
    const args = ["dashboard", "setup", "--name", a.name];
    return args;
  },

  // Report
  quill_report_list: (a: any) => ["report", "list", "--dashboard", a.dashboardId],
  quill_report_show: (a: any) => ["report", "show", a.id],
  quill_report_create: (a: any) => ["report", "create", "--dashboard", a.dashboardId],
  quill_report_update: (a: any) => ["report", "update", a.id],
  quill_report_delete: (a: any) => ["report", "delete", a.id, "--force"],
  quill_report_run: (a: any) => ["report", "run", a.id],
  quill_report_validate: (a: any) => ["report", "validate", a.id],

  // Virtual Table
  quill_vt_list: () => ["vt", "list"],
  quill_vt_show: (a: any) => ["vt", "show", a.id],
  quill_vt_create: (a: any) => {
    const args = ["vt", "create", "--name", a.name, "--sql", a.sql];
    if (a?.ownerTenantFields) args.push("--owner-fields", a.ownerTenantFields);
    return args;
  },
  quill_vt_update: (a: any) => ["vt", "update", a.id],
  quill_vt_delete: (a: any) => ["vt", "delete", a.id, "--force"],
  quill_vt_test: (a: any) => ["vt", "test", a.id],
  quill_vt_validate: (a: any) => ["vt", "validate", a.id],

  // Schema
  quill_schema_explore: (a: any) => {
    const args = ["schema", "explore"];
    if (a?.schema) args.push("--schema", a.schema);
    if (a?.table) args.push("--table", a.table);
    if (a?.maxTables) args.push("--max-tables", String(a.maxTables));
    return args;
  },
  quill_schema_list: () => ["schema", "list"],
  quill_schema_tables: (a: any) => {
    const args = ["schema", "tables"];
    if (a?.schema) args.push("--schema", a.schema);
    return args;
  },
  quill_schema_columns: (a: any) => ["schema", "columns", a.table],
  quill_schema_test_connection: () => ["schema", "test-connection"],

  // Query
  quill_query_run: (a: any) => {
    const args = ["query", "run", "--sql", a.sql];
    if (a?.autoFix) args.push("--auto-fix");
    return args;
  },
  quill_query_explain: (a: any) => ["query", "explain", "--sql", a.sql],

  // AI
  quill_ai_query: (a: any) => {
    const args = ["ai", "query", a.prompt];
    if (a?.schemas) args.push("--schemas", a.schemas);
    return args;
  },
  quill_ai_fix: (a: any) => ["ai", "fix", "--sql", a.sql, "--error", a.error],
  quill_ai_pivot: (a: any) => {
    const args = ["ai", "pivot", a.prompt];
    if (a?.reportId) args.push("--report", a.reportId);
    return args;
  },
  quill_ai_edit: (a: any) => ["ai", "edit", "--sql", a.sql, "--prompt", a.prompt],

  // Environment
  quill_env_list: () => ["env", "list"],
  quill_env_show: (a: any) => (a?.id ? ["env", "show", a.id] : ["env", "show"]),
  quill_env_switch: (a: any) => ["env", "switch", a.env],

  // Promote
  quill_promote_dashboard: (a: any) => {
    const args = ["promote", "dashboard", a.id];
    if (a?.from) args.push("--from", a.from);
    if (a?.to) args.push("--to", a.to);
    return args;
  },
  quill_promote_report: (a: any) => {
    const args = ["promote", "report", a.id];
    if (a?.from) args.push("--from", a.from);
    if (a?.to) args.push("--to", a.to);
    return args;
  },
  quill_promote_vt: (a: any) => {
    const args = ["promote", "vt", a.id];
    if (a?.from) args.push("--from", a.from);
    if (a?.to) args.push("--to", a.to);
    return args;
  },

  // Tenant
  quill_tenant_list: () => ["tenant", "list"],
  quill_tenant_mapping_get: () => ["tenant", "mapping", "get"],
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Tools that require a --file flag with JSON data.
 * The executor will write temp files for these.
 */
export const toolsRequiringFile: Record<string, (args: any) => { data: unknown; flag: string } | null> = {
  quill_dashboard_set_filters: (a: any) => a?.filters ? { data: a.filters, flag: "--file" } : null,
  quill_dashboard_update: (a: any) => a?.updates ? { data: a.updates, flag: "--file" } : null,
  quill_dashboard_setup: (a: any) => {
    // For setup, we need to handle reports as temp files
    // This is handled specially in the executor
    return null;
  },
  quill_report_create: (a: any) => a?.config ? { data: a.config, flag: "--file" } : null,
  quill_report_update: (a: any) => a?.updates ? { data: a.updates, flag: "--file" } : null,
  quill_vt_update: (a: any) => a?.updates ? { data: a.updates, flag: "--file" } : null,
};
