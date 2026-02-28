import { Command } from 'commander';
// Environment concept removed -- clientId IS the environment
import { requireAuth } from '../core/auth.js';
import {
  listVirtualTablesRemote,
  fetchVirtualTable,
  createVirtualTableRemote,
  updateVirtualTableRemote,
  deleteVirtualTableRemote,
  testVirtualTable,
  queryVirtualTable,
} from '../core/client.js';
import { validateVirtualTable } from '../core/validator.js';
import { VirtualTableCreateInputSchema } from '../models/index.js';
import { confirmDeletion } from '../utils/confirm.js';
import { output, withErrorHandling, verbose } from '../output/formatter.js';
import { success, successList, successCreated, successUpdated, successDeleted } from '../output/success.js';
import { invalidInput, fromZodError, networkError, apiError } from '../output/errors.js';
import { requireValidId } from '../utils/id.js';
import {
  formatVtList, formatVtShow, formatVtCreated,
  formatVtUpdated, formatVtDeleted, formatVtTest,
  formatVtValidate, formatDeletionCancelled,
} from '../output/vt-formatters.js';

/**
 * Fetch VT metadata (name + viewQuery) from the schema list.
 * Needed because fetchVirtualTable (task 'view') requires preQueries + name.
 */
async function getVtMetadata(vtId: string): Promise<{ name: string; viewQuery: string } | null> {
  const response = await listVirtualTablesRemote();
  if (response.error) return null;
  const data = response.data as Record<string, unknown> | undefined;
  const allTables = (data?.tables as Record<string, unknown>[]) ?? [];
  const vt = allTables.find(t => (t._id as string) === vtId || (t.id as string) === vtId);
  if (!vt) return null;
  return {
    name: (vt.name ?? vt.displayName) as string,
    viewQuery: vt.viewQuery as string,
  };
}

export function registerVirtualTableCommands(program: Command): void {
  const vtCmd = program
    .command('vt')
    .alias('virtual-table')
    .description('Manage virtual tables');

  // List virtual tables
  vtCmd
    .command('list')
    .description('List all virtual tables')
    .option('--limit <n>', 'Max items to return')
    .option('--offset <n>', 'Skip first N items')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await listVirtualTablesRemote();
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      const allTables = (data?.tables as Record<string, unknown>[]) ?? [];
      const virtualTables = allTables.filter(t => t.viewQuery);
      const total = virtualTables.length;
      const offset = parseInt(options.offset || '0', 10);
      const limit = parseInt(options.limit || '0', 10);
      const page = limit > 0 ? virtualTables.slice(offset, offset + limit) : virtualTables;
      
      output(successList(
        page.map(t => ({
          id: t._id,
          name: t.name ?? t.displayName,
          columnCount: (t.columns as unknown[])?.length ?? 0,
          ownerTenantFields: t.ownerTenantFields,
          broken: t.broken,
        })),
        { source: 'remote', total }
      ), formatVtList);
    }));

  // Show virtual table
  vtCmd
    .command('show')
    .description('Show virtual table details')
    .argument('<id>', 'Virtual table ID')
    .action(withErrorHandling(async (id) => {
      requireValidId(id, 'virtual table');
      await requireAuth();
      
      // Fetch VT metadata first (name + viewQuery) -- the 'view' task needs preQueries
      const meta = await getVtMetadata(id);
      const response = await fetchVirtualTable(id, meta?.viewQuery, meta?.name);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      if (!response.data) {
        throw networkError('No data returned for virtual table');
      }
      
      output(success(response.data, { source: 'remote' }), formatVtShow);
    }));

  // Create virtual table
  vtCmd
    .command('create')
    .description('Create a new virtual table')
    .requiredOption('--name <name>', 'Virtual table name')
    .requiredOption('--sql <query>', 'SQL query')
    .option('--owner-fields <fields>', 'Comma-separated owner tenant fields')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      
      const input = {
        name: options.name,
        sql: options.sql,
        ownerTenantFields: options.ownerFields?.split(',').map((f: string) => f.trim()),
      };
      
      // Validate input
      const parseResult = VirtualTableCreateInputSchema.safeParse(input);
      if (!parseResult.success) {
        throw fromZodError(parseResult.error);
      }
      
      // Run the query first to get column metadata (like the frontend does)
      let columns: unknown[] | undefined;
      const vtWarnings: string[] = [];
      try {
        const queryResult = await queryVirtualTable(parseResult.data.sql);
        const queryData = queryResult.data as Record<string, unknown> | undefined;
        const queryResults = (queryData?.queryResults as Record<string, unknown>[] | undefined)?.[0];
        columns = queryResults?.fields as unknown[] | undefined;
        if (!columns) {
          vtWarnings.push('Could not extract column metadata from query -- virtual table will be created without column info');
          verbose('Column extraction returned no fields');
        }
      } catch (err) {
        vtWarnings.push(`Column extraction failed: ${err instanceof Error ? err.message : String(err)} -- creating without columns`);
        verbose(`Column extraction error: ${err}`);
      }

      const response = await createVirtualTableRemote(
        parseResult.data.name,
        parseResult.data.sql,
        columns,
        parseResult.data.ownerTenantFields,
      );
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(successCreated(response.data, { source: 'remote', warnings: vtWarnings }), formatVtCreated);
    }));

  // Update virtual table
  vtCmd
    .command('update')
    .description('Update a virtual table')
    .argument('<id>', 'Virtual table ID')
    .option('--name <name>', 'New name')
    .option('--sql <query>', 'New SQL query')
    .option('--owner-fields <fields>', 'Comma-separated owner tenant fields')
    .action(withErrorHandling(async (id, options) => {
      requireValidId(id, 'virtual table');
      await requireAuth();
      
      
      const updates: Record<string, unknown> = {};
      
      if (options.name) updates.name = options.name;
      if (options.sql) updates.sql = options.sql;
      if (options.ownerFields) {
        updates.ownerTenantFields = options.ownerFields.split(',').map((f: string) => f.trim());
      }
      
      if (Object.keys(updates).length === 0) {
        throw invalidInput('No updates specified. Use --name, --sql, or --owner-fields');
      }
      
      const response = await updateVirtualTableRemote(id, updates);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote' }), formatVtUpdated);
    }));

  // Delete virtual table
  vtCmd
    .command('delete')
    .description('Delete a virtual table')
    .argument('<id>', 'Virtual table ID')
    .option('--force', 'Skip confirmation')
    .action(withErrorHandling(async (id, options) => {
      requireValidId(id, 'virtual table');
      await requireAuth();
      
      
      if (!options.force) {
        const confirmed = await confirmDeletion('virtual table', id);
        if (!confirmed) {
          output(success({ message: 'Deletion cancelled' }), formatDeletionCancelled);
          return;
        }
      }
      
      const response = await deleteVirtualTableRemote(id);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(successDeleted(id, 'virtual_table', { source: 'remote' }), formatVtDeleted);
    }));

  // Test virtual table
  vtCmd
    .command('test')
    .description('Test virtual table query')
    .argument('<id>', 'Virtual table ID')
    .action(withErrorHandling(async (id) => {
      requireValidId(id, 'virtual table');
      await requireAuth();
      
      // Backend expects table NAME, not ID. Resolve from metadata.
      const meta = await getVtMetadata(id);
      const vtName = meta?.name || id;
      const response = await testVirtualTable(vtName);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(success({
        id,
        ...response.data as Record<string, unknown>,
      }, { source: 'remote' }), formatVtTest);
    }));

  // Validate virtual table
  vtCmd
    .command('validate')
    .description('Validate virtual table configuration')
    .argument('<id>', 'Virtual table ID')
    .action(withErrorHandling(async (id) => {
      requireValidId(id, 'virtual table');
      await requireAuth();
      
      
      // Fetch VT metadata first (name + viewQuery) -- the 'view' task needs preQueries
      const meta = await getVtMetadata(id);
      const response = await fetchVirtualTable(id, meta?.viewQuery, meta?.name);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const vtData = response.data as Record<string, unknown> | undefined;
      if (!vtData) {
        throw networkError('No data returned for virtual table');
      }
      const result = await validateVirtualTable(vtData);
      
      output(success({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      }, { source: 'remote' }), formatVtValidate);
    }));
}
