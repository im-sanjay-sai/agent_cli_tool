import { Command } from 'commander';
import * as fs from 'fs/promises';
import { requireAuth } from '../core/auth.js';
import { executeQuery, parseToAst, buildFromAst, aiFix } from '../core/client.js';
import { output, withErrorHandling, verbose } from '../output/formatter.js';
import { success } from '../output/success.js';
import { invalidInput, networkError, apiError } from '../output/errors.js';

export function registerQueryCommands(program: Command): void {
  const queryCmd = program
    .command('query')
    .description('SQL query operations');

  // Run query
  queryCmd
    .command('run')
    .description('Execute a SQL query')
    .requiredOption('--sql <query>', 'SQL query to execute')
    .option('--filters <path>', 'JSON file with filters')
    .option('--auto-fix', 'On SQL error, automatically use AI to fix and retry once')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      let filters;
      if (options.filters) {
        const content = await fs.readFile(options.filters, 'utf-8');
        filters = JSON.parse(content);
      }
      
      const response = await executeQuery(options.sql, filters);
      
      // If query failed and --auto-fix is enabled, try AI fix
      if (response.error && options.autoFix) {
        verbose(`Query failed: ${response.error}`);
        verbose('Auto-fix enabled — attempting AI fix...');

        const fixResponse = await aiFix(options.sql, response.error);
        const fixData = fixResponse.data as Record<string, unknown> | undefined;
        const fixedSql = (fixData?.message || fixData?.sql) as string | undefined;

        if (!fixedSql) {
          verbose('AI fix did not return a corrected query');
          throw apiError(response.error);
        }

        verbose(`AI suggested fix: ${fixedSql}`);

        // Retry with the fixed SQL
        const retryResponse = await executeQuery(fixedSql, filters);

        if (retryResponse.error) {
          // Both original and fixed SQL failed -- return ok: false
          throw networkError(
            `Auto-fix failed. Original error: ${response.error}. AI-fixed SQL also failed: ${retryResponse.error}`,
            { originalSql: options.sql, fixedSql, originalError: response.error, retryError: retryResponse.error }
          );
        }

        // Fixed SQL worked
        const retryQueries = retryResponse.queries as Record<string, unknown> | undefined;
        const retryResults = (retryQueries?.queryResults as Record<string, unknown>[] | undefined)?.[0];
        const retryData = retryResponse.data as Record<string, unknown> | undefined;

        output(success({
          autoFix: {
            originalSql: options.sql,
            originalError: response.error,
            fixedSql,
            resolved: true,
          },
          rows: retryResults?.rows || retryData?.rows || [],
          fields: retryResults?.fields || retryData?.fields || [],
          rowCount: retryResults?.rowCount || retryData?.rowCount || 0,
        }, {
          source: 'remote',
          warnings: [`Original query had error: ${response.error}. Auto-fixed with AI.`],
        }));
        return;
      }

      if (response.error) {
        throw apiError(response.error);
      }
      
      const queries = response.queries as Record<string, unknown> | undefined;
      const queryResults = (queries?.queryResults as Record<string, unknown>[] | undefined)?.[0];
      const queryData = response.data as Record<string, unknown> | undefined;
      output(success({
        rows: queryResults?.rows || queryData?.rows || [],
        fields: queryResults?.fields || queryData?.fields || [],
        rowCount: queryResults?.rowCount || queryData?.rowCount || 0,
      }, { source: 'remote' }));
    }));

  // Parse SQL to AST
  queryCmd
    .command('parse')
    .description('Parse SQL to AST')
    .requiredOption('--sql <query>', 'SQL query to parse')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await parseToAst(options.sql);
      
      const parseData = response.data as Record<string, unknown> | undefined;
      if (parseData?.success === false) {
        throw invalidInput((parseData.message as string) || 'Failed to parse SQL');
      }
      
      output(success({
        ast: parseData?.ast,
        tables: parseData?.tables,
      }, { source: 'remote' }));
    }));

  // Build SQL from AST
  queryCmd
    .command('build')
    .description('Build SQL from AST')
    .requiredOption('--ast <path>', 'JSON file with AST')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const content = await fs.readFile(options.ast, 'utf-8');
      const ast = JSON.parse(content);
      
      const response = await buildFromAst(ast);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      // Frontend reads data.query from sqlify response
      const buildData = response.data as Record<string, unknown> | undefined;
      output(success({
        sql: buildData?.query ?? buildData?.sql,
      }, { source: 'remote' }));
    }));

  // Explain query
  queryCmd
    .command('explain')
    .description('Get query execution plan (EXPLAIN)')
    .requiredOption('--sql <query>', 'SQL query to explain')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      // EXPLAIN is executed via the query API with EXPLAIN wrapper
      const explainSql = `EXPLAIN ${options.sql}`;
      const response = await executeQuery(explainSql);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const queries = response.queries as Record<string, unknown> | undefined;
      const queryResults = (queries?.queryResults as Record<string, unknown>[] | undefined)?.[0];
      const queryData = response.data as Record<string, unknown> | undefined;
      
      output(success({
        sql: options.sql,
        plan: queryResults?.rows || queryData?.rows || [],
      }, { source: 'remote' }));
    }));
}
