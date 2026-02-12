import { getMergedConfig } from './config.js';
import { getToken } from './auth.js';
import { networkError, CliError } from '../output/errors.js';
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
  const timeout = options.timeout || 30000;
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
          ...options.metadata,
        },
      }),
      signal: options.abortSignal || controller.signal,
      credentials: config.withCredentials ? 'include' : 'omit',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw networkError(`API request failed: ${response.status} ${response.statusText}`, {
        status: response.status,
        body: errorText,
      });
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
export async function fetchDashboards(): Promise<QuillResponse> {
  return quillFetch({ task: 'dashboards' });
}

export async function fetchDashboard(dashboardId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'dashboard', metadata: { dashboardId } });
}

export async function editDashboard(dashboardId: string, updates: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'edit-dashboard', metadata: { dashboardId, ...updates } });
}

export async function deleteDashboardRemote(dashboardId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'delete-dashboard', metadata: { dashboardId } });
}

export async function setSectionOrder(dashboardId: string, sectionOrder: unknown[]): Promise<QuillResponse> {
  return quillFetch({ task: 'set-section-order', metadata: { dashboardId, sectionOrder } });
}

// Report tasks
export async function fetchReport(reportId: string, filters?: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'report', metadata: { reportId, filters } });
}

export async function fetchReportInfo(reportId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'report-info', metadata: { reportId } });
}

export async function createReportRemote(dashboardId: string, report: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'create', metadata: { dashboardId, ...report } });
}

export async function deleteReportRemote(reportId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'delete', metadata: { reportId } });
}

// Virtual table tasks
export async function fetchVirtualTable(viewId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'view', metadata: { viewId } });
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
  return quillFetch({ task: 'query-view', metadata: { view, databaseType } });
}

export async function testVirtualTable(view: string): Promise<QuillResponse> {
  return quillFetch({ task: 'test-view', metadata: { view } });
}

// Query tasks
export async function executeQuery(sql: string, filters?: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'query', metadata: { sql, filters } });
}

export async function parseToAst(query: string): Promise<QuillResponse> {
  return quillFetch({ task: 'astify', metadata: { query, useNewNodeSql: true } });
}

export async function buildFromAst(ast: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'sqlify', metadata: { ast } });
}

// Schema tasks
export async function fetchSchema(): Promise<QuillResponse> {
  return quillFetch({ task: 'schema' });
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
    timeout: 10000,
  });
}

export async function fetchSchemaNames(): Promise<QuillResponse> {
  return quillFetch({ task: 'get-schema-names' });
}

export async function setSchemas(schemaNames: string[]): Promise<QuillResponse> {
  return quillFetch({ task: 'set-schemas', metadata: { schemaNames } });
}

// AI tasks
export async function aiQuery(prompt: string, schemaNames?: string[]): Promise<QuillResponse> {
  return quillFetch({ task: 'quillai', metadata: { prompt, schemaNames } });
}

export async function aiGenerateFromSchema(prompt: string, schemaNames?: string[]): Promise<QuillResponse> {
  return quillFetch({ task: 'ai-from-client-schema', metadata: { prompt, schemaNames } });
}

export async function aiSqlGenerator(initialQuestion: string, tableSchemas?: unknown[]): Promise<QuillResponse> {
  return quillFetch({ task: 'sql-generator', metadata: { initialQuestion, tableSchemas } });
}

export async function aiFix(query: string, error: string): Promise<QuillResponse> {
  return quillFetch({ task: 'plsfix', metadata: { query, error } });
}

export async function aiPivot(prompt: string, reportId?: string): Promise<QuillResponse> {
  return quillFetch({ task: 'pivotai', metadata: { prompt, reportId } });
}

export async function aiMagic(prompt: string): Promise<QuillResponse> {
  return quillFetch({ task: 'magic', metadata: { prompt } });
}

export async function aiMagicEdit(prompt: string, existingQuery: string): Promise<QuillResponse> {
  return quillFetch({ task: 'magic-edit', metadata: { prompt, existingQuery } });
}

// Tenant tasks
export async function fetchTenantMapping(): Promise<QuillResponse> {
  return quillFetch({ task: 'tenant-mapping' });
}

export async function fetchViewerTenants(): Promise<QuillResponse> {
  return quillFetch({ task: 'viewer-tenants' });
}

export async function fetchMappedTenants(): Promise<QuillResponse> {
  return quillFetch({ task: 'mapped-tenants' });
}

export async function validateTenantMapping(mapping: unknown): Promise<QuillResponse> {
  return quillFetch({ task: 'validate-tenant-mapping', metadata: { mapping } });
}

// Environment/Client tasks
export async function fetchClient(): Promise<QuillResponse> {
  return quillFetch({ task: 'client' });
}

export async function fetchClients(): Promise<QuillResponse> {
  return quillFetch({ task: 'clients' });
}

export async function updateClient(updates: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'update-client', metadata: updates });
}

export async function deleteClient(clientId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'delete-client', metadata: { clientId } });
}

export async function fetchEnvironment(): Promise<QuillResponse> {
  return quillFetch({ task: 'environment' });
}

// Promotion tasks
export async function promoteDashboard(
  dashboardId: string,
  targetClientId: string,
  options?: { addMissingTables?: boolean }
): Promise<QuillResponse> {
  return quillFetch({
    task: 'promote-dashboard',
    metadata: { dashboardId, targetClientId, ...options },
  });
}

export async function promoteReport(
  reportId: string,
  targetClientId: string,
  options?: { addMissingTables?: boolean }
): Promise<QuillResponse> {
  return quillFetch({
    task: 'promote-item',
    metadata: { reportId, targetClientId, ...options },
  });
}

export async function promoteVirtualTable(viewId: string, targetClientId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'promote-view', metadata: { viewId, targetClientId } });
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
export async function createDashboardRemote(config: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'edit-dashboard', metadata: config });
}

// Report update
export async function updateReportRemote(reportId: string, updates: Record<string, unknown>): Promise<QuillResponse> {
  return quillFetch({ task: 'create', metadata: { reportId, ...updates } });
}

// Virtual table listing (derived from environment data)
export async function listVirtualTablesRemote(): Promise<QuillResponse> {
  return quillFetch({ task: 'virtual-tables' });
}

// Virtual table update
export async function updateVirtualTableRemote(
  viewId: string,
  updates: Record<string, unknown>
): Promise<QuillResponse> {
  return quillFetch({
    task: 'edit-virtual-table',
    metadata: { viewId, ...updates },
  });
}

// Virtual table deletion
export async function deleteVirtualTableRemote(viewId: string): Promise<QuillResponse> {
  return quillFetch({ task: 'delete-virtual-table', metadata: { viewId } });
}
