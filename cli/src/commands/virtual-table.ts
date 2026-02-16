import { Command } from 'commander';
import { getCurrentEnv } from '../core/config.js';
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
import { invalidInput, fromZodError, networkError } from '../output/errors.js';
import { requireValidId } from '../utils/id.js';

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
      const env = await getCurrentEnv();
      const response = await listVirtualTablesRemote();
      
      if (response.error) {
        throw networkError(response.error);
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
        { source: 'remote', env, total }
      ));
    }));

  // Show virtual table
  vtCmd
    .command('show')
    .description('Show virtual table details')
    .argument('<id>', 'Virtual table ID')
    .action(withErrorHandling(async (id) => {
      requireValidId(id, 'virtual table');
      await requireAuth();
      const env = await getCurrentEnv();
      const response = await fetchVirtualTable(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(success(response.data, { source: 'remote', env }));
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
      const env = await getCurrentEnv();
      
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
        throw networkError(response.error);
      }
      
      output(successCreated(response.data, { source: 'remote', env, warnings: vtWarnings }));
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
      const env = await getCurrentEnv();
      
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
        throw networkError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote', env }));
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
      const env = await getCurrentEnv();
      
      if (!options.force) {
        const confirmed = await confirmDeletion('virtual table', id);
        if (!confirmed) {
          output(success({ message: 'Deletion cancelled' }));
          return;
        }
      }
      
      const response = await deleteVirtualTableRemote(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successDeleted(id, 'virtual_table', { source: 'remote', env }));
    }));

  // Test virtual table
  vtCmd
    .command('test')
    .description('Test virtual table query')
    .argument('<id>', 'Virtual table ID')
    .action(withErrorHandling(async (id) => {
      requireValidId(id, 'virtual table');
      await requireAuth();
      const env = await getCurrentEnv();
      
      const response = await testVirtualTable(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(success({
        id,
        ...response.data as Record<string, unknown>,
      }, { source: 'remote', env }));
    }));

  // Validate virtual table
  vtCmd
    .command('validate')
    .description('Validate virtual table configuration')
    .argument('<id>', 'Virtual table ID')
    .action(withErrorHandling(async (id) => {
      requireValidId(id, 'virtual table');
      await requireAuth();
      const env = await getCurrentEnv();
      
      // Fetch VT data from remote, then validate
      const response = await fetchVirtualTable(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const vtData = response.data as Record<string, unknown>;
      const result = await validateVirtualTable(vtData);
      
      output(success({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      }, { source: 'remote', env }));
    }));
}
