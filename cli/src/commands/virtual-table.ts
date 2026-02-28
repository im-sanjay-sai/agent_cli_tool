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
import { invalidInput, fromZodError, apiError } from '../output/errors.js';
import { requireValidId } from '../utils/id.js';
import {
  formatVtList, formatVtShow, formatVtCreated,
  formatVtUpdated, formatVtDeleted, formatVtTest,
  formatVtValidate, formatDeletionCancelled,
} from '../output/vt-formatters.js';

/**
 * Fetch the full VT object from the schema list.
 * The 'schema' task returns all table metadata (name, viewQuery, columns, etc.)
 * which is what we need for show/validate. The 'view' task executes the query
 * and returns rows — not useful for metadata display.
 */
async function getVtFromSchema(vtId: string): Promise<Record<string, unknown> | null> {
  const response = await listVirtualTablesRemote();
  if (response.error) return null;
  const data = response.data as Record<string, unknown> | undefined;
  const allTables = (data?.tables as Record<string, unknown>[]) ?? [];
  return (allTables.find(t => (t._id as string) === vtId || (t.id as string) === vtId) as Record<string, unknown>) ?? null;
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

      // Get metadata from the schema listing (name, viewQuery, columns, etc.)
      const vtMeta = await getVtFromSchema(id);
      verbose('Schema metadata for VT', vtMeta);

      // Also fetch via 'view' task (returns query execution data + columns)
      const viewResponse = await fetchVirtualTable(
        id,
        (vtMeta?.viewQuery as string) ?? undefined,
        (vtMeta?.name ?? vtMeta?.displayName) as string ?? undefined,
      );
      verbose('View task response', viewResponse.data);

      if (viewResponse.error) {
        throw apiError(viewResponse.error);
      }

      // Merge: schema metadata first, then view response data on top
      const merged = {
        ...(vtMeta || {}),
        ...(viewResponse.data as Record<string, unknown> || {}),
        // Ensure key metadata fields aren't overwritten by view response
        _id: vtMeta?._id ?? (viewResponse.data as Record<string, unknown>)?.id ?? id,
        name: vtMeta?.name ?? vtMeta?.displayName ?? (viewResponse.data as Record<string, unknown>)?.name,
        viewQuery: vtMeta?.viewQuery,
        columns: vtMeta?.columns ?? (viewResponse.data as Record<string, unknown>)?.columns,
        ownerTenantFields: vtMeta?.ownerTenantFields,
        broken: vtMeta?.broken,
      };

      output(success(merged, { source: 'remote' }), formatVtShow);
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
      const vt = await getVtFromSchema(id);
      const vtName = (vt?.name ?? vt?.displayName ?? id) as string;
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

      const vt = await getVtFromSchema(id);
      if (!vt) {
        throw apiError(`Virtual table '${id}' not found`);
      }
      const result = await validateVirtualTable(vt);
      
      output(success({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      }, { source: 'remote' }), formatVtValidate);
    }));
}
