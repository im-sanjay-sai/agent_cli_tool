import { Command } from 'commander';
// Environment concept removed -- clientId IS the environment
import { requireAuth } from '../core/auth.js';
import {
  listVirtualTablesRemote,
  createVirtualTableRemote,
  updateVirtualTableRemote,
  deleteVirtualTableRemote,
  testVirtualTable,
  queryVirtualTable,
} from '../core/client.js';
import { validateVirtualTable } from '../core/validator.js';
import { VirtualTableCreateInputSchema } from '../models/index.js';
import { output, withErrorHandling, verbose } from '../output/formatter.js';
import { success, successList, successCreated, successUpdated, successDeleted } from '../output/success.js';
import { invalidInput, fromZodError, apiError } from '../output/errors.js';
import { requireValidId } from '../utils/id.js';
import {
  formatVtList, formatVtShow, formatVtCreated,
  formatVtUpdated, formatVtDeleted, formatVtTest,
  formatVtValidate,
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

/**
 * Resolve a virtual table ID from either a positional id arg or --name option.
 * If id is provided, validates it as an ObjectId and returns it.
 * If --name is provided, looks up the VT by name and returns its _id.
 */
async function resolveVtId(id: string | undefined, name: string | undefined): Promise<string> {
  if (id) {
    requireValidId(id, 'virtual table');
    return id;
  }
  if (name) {
    const response = await listVirtualTablesRemote();
    if (response.error) throw apiError(response.error);
    const data = response.data as Record<string, unknown> | undefined;
    const allTables = (data?.tables as Record<string, unknown>[]) ?? [];
    const needle = name.trim().toLowerCase();
    const vt = allTables.find(t =>
      ((t.name as string) ?? '').trim().toLowerCase() === needle ||
      ((t.displayName as string) ?? '').trim().toLowerCase() === needle
    );
    if (!vt) {
      throw invalidInput(`Virtual table "${name}" not found. Run 'quill vt list' to see available tables.`);
    }
    return (vt._id ?? vt.id) as string;
  }
  throw invalidInput('Provide either <id> or --name');
}

export function registerVirtualTableCommands(program: Command): void {
  const vtCmd = program
    .command('virtual-table')
    .alias('vt')
    .description('Manage virtual tables');

  // List virtual tables
  vtCmd
    .command('list')
    .description('List all virtual tables')
    .option('--limit <n>', 'Max items to return')
    .option('--offset <n>', 'Skip first N items')
    .addHelpText('after', '\nExamples:\n  $ quill vt list\n')
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
    .argument('[id]', 'Virtual table ID')
    .option('--name <name>', 'Virtual table name')
    .addHelpText('after', '\nExamples:\n  $ quill vt show 65abc...\n  $ quill vt show --name "orders_view"\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveVtId(id, options.name);
      await requireAuth();

      const vt = await getVtFromSchema(resolvedId);
      if (!vt) {
        throw apiError(`Virtual table '${resolvedId}' not found`);
      }

      output(success(vt, { source: 'remote' }), formatVtShow);
    }));

  // Create virtual table
  vtCmd
    .command('create')
    .description('Create a new virtual table')
    .requiredOption('--name <name>', 'Virtual table name')
    .requiredOption('--sql <query>', 'SQL query')
    .option('--owner-fields <fields>', 'Comma-separated owner tenant fields')
    .addHelpText('after', '\nExamples:\n  $ quill vt create --name orders_view --sql "SELECT * FROM orders"\n')
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
        const queries = queryResult.queries as Record<string, unknown> | undefined;
        const queryResults = (queries?.queryResults as Record<string, unknown>[] | undefined)?.[0];
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
    .argument('[id]', 'Virtual table ID')
    .option('--name <name>', 'Virtual table name (to identify which VT to update)')
    .option('--new-name <newName>', 'New name for the virtual table')
    .option('--sql <query>', 'New SQL query')
    .option('--owner-fields <fields>', 'Comma-separated owner tenant fields')
    .addHelpText('after', '\nExamples:\n  $ quill vt update 65abc... --sql "SELECT id FROM orders"\n  $ quill vt update --name "orders_view" --new-name "orders_v2"\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveVtId(id, options.name);
      await requireAuth();

      const updates: Record<string, unknown> = {};

      if (options.newName) updates.name = options.newName;
      if (options.sql) updates.sql = options.sql;
      if (options.ownerFields) {
        updates.ownerTenantFields = options.ownerFields.split(',').map((f: string) => f.trim());
      }
      
      if (Object.keys(updates).length === 0) {
        throw invalidInput('No updates specified. Use --new-name, --sql, or --owner-fields');
      }

      const response = await updateVirtualTableRemote(resolvedId, updates);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote' }), formatVtUpdated);
    }));

  // Delete virtual table
  vtCmd
    .command('delete')
    .description('Delete a virtual table')
    .argument('[id]', 'Virtual table ID')
    .option('--name <name>', 'Virtual table name')
    .addHelpText('after', '\nExamples:\n  $ quill vt delete 65abc...\n  $ quill vt delete --name "orders_view"\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveVtId(id, options.name);
      await requireAuth();

      const response = await deleteVirtualTableRemote(resolvedId);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(successDeleted(resolvedId, 'virtual_table', { source: 'remote' }), formatVtDeleted);
    }));

  // Test virtual table
  vtCmd
    .command('test')
    .description('Test virtual table query')
    .argument('[id]', 'Virtual table ID')
    .option('--name <name>', 'Virtual table name')
    .addHelpText('after', '\nExamples:\n  $ quill vt test --name "orders_view"\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveVtId(id, options.name);
      await requireAuth();

      // Backend expects table NAME, not ID. Resolve from metadata.
      const vt = await getVtFromSchema(resolvedId);
      const vtName = (vt?.name ?? vt?.displayName ?? resolvedId) as string;
      const response = await testVirtualTable(vtName);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(success({
        id: resolvedId,
        ...response.data as Record<string, unknown>,
      }, { source: 'remote' }), formatVtTest);
    }));

  // Validate virtual table
  vtCmd
    .command('validate')
    .description('Validate virtual table configuration')
    .argument('[id]', 'Virtual table ID')
    .option('--name <name>', 'Virtual table name')
    .addHelpText('after', '\nExamples:\n  $ quill vt validate --name "orders_view"\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveVtId(id, options.name);
      await requireAuth();

      const vt = await getVtFromSchema(resolvedId);
      if (!vt) {
        throw apiError(`Virtual table '${resolvedId}' not found`);
      }
      const result = await validateVirtualTable(vt);
      
      output(success({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      }, { source: 'remote' }), formatVtValidate);
    }));
}
