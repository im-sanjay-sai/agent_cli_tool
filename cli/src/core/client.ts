import { getMergedConfig } from './config.js';
import { getToken } from './auth.js';
import { networkError, notFound, invalidInput, authRequired, CliError } from '../output/errors.js';
import { verbose } from '../output/formatter.js';

// Default Quill server URL
const DEFAULT_QUILL_SERVER = 'https://api.quillsql.com';
const QUILL_QUERY_ENDPOINT = '/v1/sdk';

export interface QuillFetchOptions {
  task: string;
  metadata?: Record<string, unknown>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  abortSignal?: AbortSignal;
  timeout?: number;
}

export interface QuillResponse {
  data?: unknown;
  queries?: unknown;
  status?: 'success' | 'error';
  error?: string;
  message?: string;
}

/**
 * Make a request to the Quill API
 * All operations go through the API to MongoDB.
 * Cloud users: CLI → api.quillsql.com → MongoDB
 * Self-hosted users: CLI → their queryEndpoint → MongoDB
 */
export async function quillFetch(options: QuillFetchOptions): Promise<QuillResponse> {
  const config = await getMergedConfig();
  
  if (!config.clientId) {
    throw networkError(
      'No clientId configured. Run `quill config init --client-id <id>` or set clientId in your project config.',
      { task: options.task }
    );
  }
  
  const token = await getToken();
  const endpoint = config.queryEndpoint || `${DEFAULT_QUILL_SERVER}${QUILL_QUERY_ENDPOINT}`;
  const url = `${endpoint}?task=${options.task}`;
  
  verbose(`API Request: ${options.task}`, { url, metadata: options.metadata });
  
  const controller = new AbortController();
  const timeout = options.timeout || 120000; // 2 min — proxy chain (CLI → /api/quill → Quill Cloud) can be slow
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(config.queryHeaders || {}),
      },
      body: JSON.stringify({
        metadata: {
          task: options.task,
          clientId: config.clientId,
          adminMode: true,
          databaseType: process.env.QUILL_DATABASE_TYPE || undefined,
          useNewNodeSql: true,
          ...options.metadata,
        },
      }),
      signal: options.abortSignal || controller.signal,
      credentials: config.withCredentials ? 'include' : 'omit',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Parse error body -- API may return JSON with error/message fields
      let errorMsg: string;
      try {
        const body = await response.json() as Record<string, unknown>;
        errorMsg = (body.error || body.message || `${response.status} ${response.statusText}`) as string;
      } catch {
        errorMsg = await response.text().catch(() => `${response.status} ${response.statusText}`);
      }
      // Map HTTP status to proper error types instead of always NETWORK_ERROR
      switch (response.status) {
        case 400:
          throw invalidInput(errorMsg);
        case 401:
        case 403:
          throw authRequired(errorMsg);
        case 404:
          throw notFound(errorMsg);
        default:
          throw networkError(`API error: ${errorMsg}`, { status: response.status });
      }
    }
    
    const result = await response.json() as Record<string, unknown>;
    
    // Handle wrapped response (for self-hosted endpoints)
    const resultData = result.data as Record<string, unknown> | undefined;
    if (resultData?.data && (resultData.queries || resultData.status || resultData.error)) {
      return resultData as QuillResponse;
    }
    
    verbose(`API Response: ${options.task}`, result);
    
    return {
      data: result.data,
      queries: result.queries,
      status: result.status as 'success' | 'error' | undefined,
      error: result.error as string | undefined,
      message: result.message as string | undefined,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof CliError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw networkError('Request timed out', { timeout });
      }
      throw networkError(error.message);
    }
    
    throw networkError('Unknown network error');
  }
}

// ============= Task-specific API methods =============

// Dashboard tasks
export async function fetchDashboards(tenants?: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'dashboards', metadata: { tenants } });
}

// Frontend uses 'name' (dashboard name) to fetch, not an ID
export async function fetchDashboard(dashboardName: string, tenants?: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'dashboard', metadata: { name: dashboardName, useNewNodeSql: true, tenants } });
}

// Frontend uses 'name' for the dashboard, with 'newDashboardName' for renames
export async function editDashboard(dashboardName: string, updates: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({
    task: 'edit-dashboard',
    metadata: {
      name: dashboardName,
      newDashboardName: (updates.newName || updates.name || dashboardName) as string,
      ...updates,
    },
  });
}

// Frontend uses 'name' (dashboard name) not dashboardId
export async function deleteDashboardRemote(name: string): Promise<QuillResponse> {
  return quillFetch({ task: 'delete-dashboard', metadata: { name } });
}

// Frontend uses dashboardName not dashboardId
export async function setSectionOrder(dashboardName: string, sectionOrder: unknown[]): Promise<QuillResponse> {
  return quillFetch({ task: 'set-section-order', metadata: { dashboardName, sectionOrder } });
}

// Report tasks
export async function fetchReport(reportId: string, filters?: unknown, tenants?: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'report', metadata: { reportId, filters, tenants } });
}

export async function fetchReportInfo(reportId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'report-info', metadata: { reportId } });
}

// Paginated/sorted report fetch (frontend uses 'item' task)
export async function fetchReportItem(
  reportId: string,
  options?: { page?: number; sort?: { field: string; direction: string }; rowsOnly?: boolean; rowCountOnly?: boolean }
): Promise<QuillResponse> {
  return quillFetch({
    task: 'item',
    metadata: {
      dashboardItemId: reportId,
      forcePagination: true,
      additionalProcessing: {
        page: options?.page ? { currentPage: options.page, rowsPerPage: 100 } : undefined,
        sort: options?.sort,
      },
      rowsOnly: options?.rowsOnly,
      rowCountOnly: options?.rowCountOnly,
    },
  });
}

// Frontend uses dashboardName for the create task
export async function createReportRemote(dashboardName: string, report: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'create', metadata: { dashboardName, ...report } });
}

// Frontend uses dashboardItemId not reportId
export async function deleteReportRemote(reportId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'delete', metadata: { dashboardItemId: reportId } });
}

// Virtual table tasks -- frontend uses 'view' task with 'id' field
export async function fetchVirtualTable(viewId: string, customFieldInfo?: unknown): Promise<QuillResponse> {
  return quillFetch({
    task: 'view',
    metadata: {
      id: viewId,
      runQueryConfig: { getColumns: true },
      useNewNodeSql: true,
      customFieldInfo,
    },
  });
}

export async function createVirtualTableRemote(
  name: string,
  query: string,
  columns?: unknown[],
  ownerTenantFields?: string[]
): Promise<QuillResponse> {
  return quillFetch({
    task: 'create-virtual-table',
    metadata: { name, queryString: query, columns, ownerTenantFields },
  });
}

export async function queryVirtualTable(view: string, databaseType?: string): Promise<QuillResponse> {
  return quillFetch({
    task: 'query-view',
    metadata: {
      view,
      databaseType,
      runQueryConfig: { convertDatatypes: true, limitThousand: true },
    },
  });
}

// Frontend uses 'tables' array not 'view' string
export async function testVirtualTable(tableName: string): Promise<QuillResponse> {
  return quillFetch({ task: 'test-view', metadata: { tables: [tableName] } });
}

// Query tasks -- frontend uses field name 'query' not 'sql'
export async function executeQuery(sql: string, filters?: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'query', metadata: { query: sql, filters, useNewNodeSql: true } });
}

export async function parseToAst(query: string): Promise<QuillResponse> {
  return quillFetch({ task: 'astify', metadata: { query, useNewNodeSql: true } });
}

export async function buildFromAst(ast: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'sqlify', metadata: { ast, useNewNodeSql: true } });
}

// Schema tasks
export async function fetchSchema(tenants?: unknown): Promise<QuillResponse> {
  return quillFetch({
    task: 'schema',
    metadata: {
      removeCustomerField: true,
      removeCustomFieldRef: true,
      useNewCustomFields: true,
      tenants,
    },
  });
}

export async function fetchTablesBySchema(schema: string): Promise<QuillResponse> {
  return quillFetch({ task: 'tables-by-schema', metadata: { schema } });
}

export async function fetchTableInfo(schema: string, table: string): Promise<QuillResponse> {
  return quillFetch({ task: 'table-info', metadata: { schema, table } });
}

export async function testConnection(connectionString?: string, databaseType?: string): Promise<QuillResponse> {
  return quillFetch({
    task: 'test-connection',
    metadata: { connectionString, databaseType },
    timeout: 60000, // 60s — DB connection through proxy can be slow
  });
}

export async function fetchSchemaNames(): Promise<QuillResponse> {
  return quillFetch({
    task: 'get-schema-names',
    metadata: {
      databaseType: process.env.QUILL_DATABASE_TYPE || 'postgres',
    },
  });
}

export async function setSchemas(schemaNames: string[]): Promise<QuillResponse> {
  return quillFetch({ task: 'set-schemas', metadata: { schemaNames } });
}

// AI tasks -- frontend uses 'initialQuestion' not 'prompt' for most AI tasks
export async function aiQuery(prompt: string, schemaNames?: string[]): Promise<QuillResponse> {
  return quillFetch({ task: 'quillai', metadata: { initialQuestion: prompt, schemaNames } });
}

export async function aiGenerateFromSchema(prompt: string, schemaNames?: string[]): Promise<QuillResponse> {
  return quillFetch({ task: 'ai-from-client-schema', metadata: { prompt, schemaNames } });
}

export async function aiSqlGenerator(initialQuestion: string, tableSchemas?: unknown[]): Promise<QuillResponse> {
  return quillFetch({ task: 'sql-generator', metadata: { initialQuestion, tableSchemas } });
}

// Frontend uses 'brokenQuery' and 'errorMessage' not 'query' and 'error'
export async function aiFix(brokenSql: string, errorMessage: string): Promise<QuillResponse> {
  return quillFetch({ task: 'plsfix', metadata: { brokenQuery: brokenSql, errorMessage } });
}

// Frontend sends structured pivot data, not a text prompt
export async function aiPivot(pivotConfig: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'pivotai', metadata: pivotConfig });
}

// Frontend uses 'initialQuestion' not 'prompt'
export async function aiMagic(prompt: string): Promise<QuillResponse> {
  return quillFetch({ task: 'magic', metadata: { initialQuestion: prompt } });
}

// Frontend uses 'initialQuestion' and 'sqlQuery' not 'prompt' and 'existingQuery'
export async function aiMagicEdit(prompt: string, existingQuery: string): Promise<QuillResponse> {
  return quillFetch({ task: 'magic-edit', metadata: { initialQuestion: prompt, sqlQuery: existingQuery } });
}

// Tenant tasks -- frontend requires tenants and dashboardName
export async function fetchTenantMapping(dashboardName?: string, tenants?: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'tenant-mapping', metadata: { dashboardName, tenants } });
}

export async function fetchViewerTenants(dashboardName?: string): Promise<QuillResponse> {
  return quillFetch({ task: 'viewer-tenants', metadata: { dashboardName } });
}

// Frontend sends { query, fromTenantField, toTenantField } not { mapping }
export async function validateTenantMapping(query: string, fromTenantField: string, toTenantField: string): Promise<QuillResponse> {
  return quillFetch({ task: 'validate-tenant-mapping', metadata: { query, fromTenantField, toTenantField } });
}

// Environment/Client tasks
export async function fetchClient(): Promise<QuillResponse> {
  return quillFetch({ task: 'client' });
}

export async function fetchClients(): Promise<QuillResponse> {
  return quillFetch({ task: 'clients' });
}

// Frontend wraps updates in a 'client' key: { clientId, client: { ...updates } }
export async function updateClient(clientId: string, updates: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'update-client', metadata: { clientId, client: updates } });
}

export async function deleteClient(clientId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'delete-client', metadata: { clientId } });
}

export async function fetchEnvironment(): Promise<QuillResponse> {
  return quillFetch({
    task: 'environment',
    metadata: {
      removeCustomerField: true,
      removeCustomFieldRef: true,
      useNewCustomFields: true,
      fetchDashboards: true,
    },
  });
}

// Promotion tasks
// Frontend uses dashboardName (not ID), fromClientId, toClientId
export async function promoteDashboard(
  dashboardName: string,
  fromClientId: string,
  toClientId: string,
  options?: { addMissingTables?: boolean; skipWarning?: boolean }
): Promise<QuillResponse> {
  return quillFetch({
    task: 'promote-dashboard',
    metadata: { dashboardName, fromClientId, toClientId, ...options },
  });
}

// Frontend uses itemId (not reportId), dashboardName (= TARGET dashboard), fromClientId, toClientId
// Same fromClientId/toClientId = copy between dashboards in same env
export async function promoteReport(
  itemId: string,
  dashboardName: string,
  fromClientId: string,
  toClientId: string,
  options?: { addMissingTables?: boolean; skipWarning?: boolean }
): Promise<QuillResponse> {
  return quillFetch({
    task: 'promote-item',
    metadata: { itemId, dashboardName, fromClientId, toClientId, ...options },
  });
}

// Frontend uses viewName (not viewId), fromClientId, toClientId
export async function promoteVirtualTable(
  viewName: string,
  fromClientId: string,
  toClientId: string,
  options?: { skipWarning?: boolean }
): Promise<QuillResponse> {
  return quillFetch({
    task: 'promote-view',
    metadata: { viewName, fromClientId, toClientId, ...options },
  });
}

// Report builder tasks
export async function reportBuilderQuery(state: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'report-builder-query', metadata: { state } });
}

export async function reportBuilderTables(): Promise<QuillResponse> {
  return quillFetch({ task: 'report-builder-tables' });
}

export async function reportBuilderUniqueValues(table: string, column: string): Promise<QuillResponse> {
  return quillFetch({ task: 'report-builder-unique-values', metadata: { table, column } });
}

export async function reportBuilderDateRanges(table: string, dateField: string): Promise<QuillResponse> {
  return quillFetch({ task: 'report-builder-date-ranges', metadata: { table, dateField } });
}

// Pivot tasks
export async function fetchPivotTemplate(reportId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'pivot-template', metadata: { reportId } });
}

// Filter tasks
export async function fetchFilterOptions(filterId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'filter-options', metadata: { filterId } });
}

// Custom fields
export async function fetchCustomFields(): Promise<QuillResponse> {
  return quillFetch({ task: 'custom-fields' });
}

export async function setCustomFields(fields: unknown[]): Promise<QuillResponse> {
  return quillFetch({ task: 'custom-fields', metadata: { fields } });
}

// ============= Additional CRUD methods for CLI =============

// Dashboard creation (uses edit-dashboard with upsert semantics)
// Frontend always sends both 'name' and 'newDashboardName'
export async function createDashboardRemote(config: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({
    task: 'edit-dashboard',
    metadata: {
      newDashboardName: config.name as string,
      ...config,
    },
  });
}

// Report update -- frontend uses dashboardItemId for updates via 'create' task
export async function updateReportRemote(reportId: string, updates: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'create', metadata: { dashboardItemId: reportId, reportId, ...updates } });
}

// Virtual table listing (uses schema task -- there is no dedicated list-VTs task)
export async function listVirtualTablesRemote(): Promise<QuillResponse> {
  return quillFetch({
    task: 'schema',
    metadata: {
      removeCustomerField: true,
      removeCustomFieldRef: true,
      useNewCustomFields: true,
    },
  });
}

// Virtual table update (uses 'view' task with id field -- no separate edit-virtual-table task)
export async function updateVirtualTableRemote(
  viewId: string,
  updates: Record<string, unknown>
): Promise<QuillResponse> {
  const preQueries = updates.sql || updates.queryString || updates.viewQuery;
  return quillFetch({
    task: 'view',
    metadata: {
      id: viewId,
      name: updates.name,
      preQueries: preQueries ? [String(preQueries).replace(/;$/, '')] : undefined,
      runQueryConfig: { getColumns: true },
      useNewNodeSql: true,
      ownerTenantFields: updates.ownerTenantFields,
      customFieldInfo: updates.customFieldInfo,
      noCustomerField: updates.noCustomerField,
      ...updates,
    },
  });
}

// Virtual table deletion (uses 'view' task with deleted: true -- no separate delete task)
export async function deleteVirtualTableRemote(viewId: string): Promise<QuillResponse> {
  return quillFetch({
    task: 'view',
    metadata: {
      id: viewId,
      deleted: true,
      runQueryConfig: { getColumns: true },
      useNewNodeSql: true,
    },
  });
}
