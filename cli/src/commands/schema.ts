import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import {
  fetchSchema,
  fetchSchemaNames,
  fetchTablesBySchema,
  fetchTableInfo,
  testConnection,
} from '../core/client.js';
import { output, withErrorHandling, verbose } from '../output/formatter.js';
import { success, successList } from '../output/success.js';
import { networkError } from '../output/errors.js';

export function registerSchemaCommands(program: Command): void {
  const schemaCmd = program
    .command('schema')
    .description('Database schema operations');

  // List schemas
  schemaCmd
    .command('list')
    .description('List available database schemas')
    .action(withErrorHandling(async () => {
      await requireAuth();
      
      const response = await fetchSchemaNames();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      // The API returns schemas in multiple possible formats:
      // 1. data.schemas (array) -- direct format
      // 2. queries.queryResults[0].rows with schema_name/SCHEMA_NAME -- DB query format
      const schemasData = response.data as Record<string, unknown> | undefined;
      const queriesData = response.queries as Record<string, unknown> | undefined;
      
      let schemas: string[] = [];
      
      if (Array.isArray(schemasData?.schemas)) {
        schemas = schemasData.schemas as string[];
      } else if (queriesData?.queryResults) {
        const queryResults = queriesData.queryResults as Record<string, unknown>[];
        const rows = (queryResults?.[0]?.rows || []) as Record<string, unknown>[];
        schemas = rows.map(r => (r.schema_name || r.SCHEMA_NAME || r.nspname) as string).filter(Boolean);
      }
      
      output(successList(schemas, { source: 'remote' }));
    }));

  // List tables
  schemaCmd
    .command('tables')
    .description('List tables in a schema')
    .option('--schema <name>', 'Schema name')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      let response;
      if (options.schema) {
        response = await fetchTablesBySchema(options.schema);
      } else {
        response = await fetchSchema();
      }
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      // The backend may return tables in multiple formats:
      // 1. data.tables (direct) 2. queries.queryResults[0].rows (DB query) 3. data.schema
      const tablesData = response.data as Record<string, unknown> | undefined;
      const queriesData = response.queries as Record<string, unknown> | undefined;
      
      let tables: unknown[] = [];
      if (Array.isArray(tablesData?.tables)) {
        tables = tablesData.tables as unknown[];
      } else if (queriesData?.queryResults) {
        const qr = queriesData.queryResults as Record<string, unknown>[];
        tables = (qr?.[0]?.rows || []) as unknown[];
      } else if (tablesData?.schema) {
        const schema = tablesData.schema;
        tables = Array.isArray(schema) ? schema as unknown[] : Object.keys(schema as object);
      }
      
      output(successList(tables, { source: 'remote' }));
    }));

  // Show table columns
  schemaCmd
    .command('columns')
    .description('Show columns for a table')
    .argument('<table>', 'Table name (schema.table format)')
    .action(withErrorHandling(async (table) => {
      await requireAuth();
      
      // Parse schema.table format
      const parts = table.split('.');
      const schema = parts.length > 1 ? parts[0] : 'public';
      const tableName = parts.length > 1 ? parts[1] : parts[0];
      
      const response = await fetchTableInfo(schema, tableName);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const columnsData = response.data as Record<string, unknown> | undefined;
      output(success({
        schema,
        table: tableName,
        columns: columnsData?.columns || [],
      }, { source: 'remote' }));
    }));

  // Test connection
  schemaCmd
    .command('test-connection')
    .description('Test database connection')
    .action(withErrorHandling(async () => {
      await requireAuth();
      
      const response = await testConnection(
        process.env.QUILL_DATABASE_CONNECTION_STRING,
        process.env.QUILL_DATABASE_TYPE
      );
      
      const connData = response.data as Record<string, unknown> | undefined;
      const connected = connData?.success === true;
      const message = (connData?.message as string) || response.error || (connData?.success ? 'Connection successful' : 'Unknown result');

      if (!connected) {
        throw networkError(`Database connection failed: ${message}`);
      }

      output(success({
        connected: true,
        message,
      }, { source: 'remote' }));
    }));

  // Explore: full schema tree in one call
  schemaCmd
    .command('explore')
    .description('Explore database schema — returns a full tree of schemas, tables, and columns in one call')
    .option('--schema <name>', 'Only explore a specific schema')
    .option('--table <name>', 'Only explore a specific table (schema.table or just table for public)')
    .option('--max-tables <n>', 'Maximum number of tables to fetch columns for (default: 50)', '50')
    .action(withErrorHandling(async (options) => {
      await requireAuth();

      const maxTables = parseInt(options.maxTables, 10) || 50;
      const warnings: string[] = [];

      // If a specific table is requested, just show that
      if (options.table) {
        const parts = (options.table as string).split('.');
        const schema = parts.length > 1 ? parts[0] : 'public';
        const tableName = parts.length > 1 ? parts[1] : parts[0];

        const response = await fetchTableInfo(schema, tableName);
        if (response.error) {
          throw networkError(response.error);
        }

        const columnsData = response.data as Record<string, unknown> | undefined;
        output(success({
          schema,
          table: tableName,
          columns: columnsData?.columns || [],
        }, { source: 'remote' }));
        return;
      }

      // Step 1: Get schemas
      verbose('Explore step 1: Fetching schema names...');
      const schemasResponse = await fetchSchemaNames();
      if (schemasResponse.error) {
        throw networkError(schemasResponse.error);
      }

      // Parse schemas from multiple response formats (same as schema list)
      const schemasData = schemasResponse.data as Record<string, unknown> | undefined;
      const schemasQueries = schemasResponse.queries as Record<string, unknown> | undefined;
      let schemaNames: string[] = [];
      if (Array.isArray(schemasData?.schemas)) {
        schemaNames = schemasData.schemas as string[];
      } else if (schemasQueries?.queryResults) {
        const qr = schemasQueries.queryResults as Record<string, unknown>[];
        const rows = (qr?.[0]?.rows || []) as Record<string, unknown>[];
        schemaNames = rows.map(r => (r.schema_name || r.SCHEMA_NAME || r.nspname) as string).filter(Boolean);
      }

      // Filter to specific schema if requested
      if (options.schema) {
        schemaNames = schemaNames.filter(s => s === options.schema);
        if (schemaNames.length === 0) {
          schemaNames = [options.schema as string]; // Try it anyway
        }
      }

      verbose(`Found schemas: ${schemaNames.join(', ')}`);

      // Step 2: Get tables for each schema
      const tree: Array<{
        schema: string;
        tables: Array<{
          name: string;
          columns?: unknown[];
        }>;
      }> = [];

      let totalTablesProcessed = 0;

      for (const schemaName of schemaNames) {
        verbose(`Explore step 2: Fetching tables for schema ${schemaName}...`);
        const tablesResponse = await fetchTablesBySchema(schemaName);

        if (tablesResponse.error) {
          warnings.push(`Failed to fetch tables for schema ${schemaName}: ${tablesResponse.error}`);
          continue;
        }

        const tablesData = tablesResponse.data as Record<string, unknown> | undefined;
        const tablesQueries = tablesResponse.queries as Record<string, unknown> | undefined;
        let rawTables: unknown[] | Record<string, unknown> = [];
        if (Array.isArray(tablesData?.tables)) {
          rawTables = tablesData.tables as unknown[];
        } else if (tablesQueries?.queryResults) {
          const qr = tablesQueries.queryResults as Record<string, unknown>[];
          rawTables = (qr?.[0]?.rows || []) as unknown[];
        } else if (tablesData?.schema) {
          rawTables = tablesData.schema as unknown[] | Record<string, unknown>;
        }
        const tableNames: string[] = Array.isArray(rawTables)
          ? (rawTables as Array<string | Record<string, unknown>>).map(t =>
              typeof t === 'string' ? t : (t.name as string) || String(t))
          : Object.keys(rawTables as object);

        verbose(`Found ${tableNames.length} tables in ${schemaName}`);

        // Step 3: Get columns for each table (up to maxTables)
        const tables: Array<{ name: string; columns?: unknown[] }> = [];

        for (const tableName of tableNames) {
          if (totalTablesProcessed >= maxTables) {
            warnings.push(`Reached max-tables limit (${maxTables}). Some tables may not have column details.`);
            tables.push({ name: tableName });
            continue;
          }

          verbose(`Explore step 3: Fetching columns for ${schemaName}.${tableName}...`);
          try {
            const colResponse = await fetchTableInfo(schemaName, tableName);
            if (colResponse.error) {
              warnings.push(`Failed to fetch columns for ${schemaName}.${tableName}: ${colResponse.error}`);
              tables.push({ name: tableName });
            } else {
              const colData = colResponse.data as Record<string, unknown> | undefined;
              tables.push({
                name: tableName,
                columns: (colData?.columns || []) as unknown[],
              });
            }
          } catch (err) {
            warnings.push(`Error fetching columns for ${schemaName}.${tableName}: ${err instanceof Error ? err.message : String(err)}`);
            tables.push({ name: tableName });
          }
          totalTablesProcessed++;
        }

        tree.push({ schema: schemaName, tables });
      }

      output(success({
        schemas: tree,
        totalSchemas: tree.length,
        totalTables: tree.reduce((sum, s) => sum + s.tables.length, 0),
      }, {
        source: 'remote',
        warnings,
      }));
    }));
}
