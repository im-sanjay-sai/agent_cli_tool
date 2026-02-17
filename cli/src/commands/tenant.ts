import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import {
  fetchTenantMapping,
  fetchViewerTenants,
  validateTenantMapping,
} from '../core/client.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success, successList } from '../output/success.js';
import { apiError } from '../output/errors.js';

export function registerTenantCommands(program: Command): void {
  const tenantCmd = program
    .command('tenant')
    .description('Tenant operations');

  // List tenants
  tenantCmd
    .command('list')
    .description('List available tenants')
    .requiredOption('--dashboard <name>', 'Dashboard name (required by the API)')
    .option('--limit <n>', 'Max items to return')
    .option('--offset <n>', 'Skip first N items')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await fetchViewerTenants(options.dashboard);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const tenantsData = response.data as Record<string, unknown> | undefined;
      const tenants = (tenantsData?.tenants || []) as unknown[];
      const total = tenants.length;
      const offset = parseInt(options.offset || '0', 10);
      const limit = parseInt(options.limit || '0', 10);
      const page = limit > 0 ? tenants.slice(offset, offset + limit) : tenants;
      output(successList(page, { source: 'remote', total }));
    }));

  // Get tenant mapping
  const mappingCmd = tenantCmd
    .command('mapping')
    .description('Tenant mapping operations');

  mappingCmd
    .command('get')
    .description('Get tenant mappings')
    .requiredOption('--dashboard <name>', 'Dashboard name (required by the API)')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await fetchTenantMapping(options.dashboard);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      // Frontend parses data.queryOrder + queries.queryResults for the mapping data
      const mappingsData = response.data as Record<string, unknown> | undefined;
      const queriesData = response.queries as Record<string, unknown> | undefined;
      const queryOrder = (mappingsData?.queryOrder ?? []) as string[];
      const queryResults = (queriesData?.queryResults ?? []) as Record<string, unknown>[];

      const mappings: Record<string, unknown[]> = {};
      queryOrder.forEach((field: string, index: number) => {
        const result = queryResults[index];
        if (result?.rows) {
          mappings[field] = (result.rows as Record<string, unknown>[]).map(row => row[field]);
        }
      });

      output(success({
        mappings: Object.keys(mappings).length > 0 ? mappings : mappingsData,
        queryOrder,
      }, { source: 'remote' }));
    }));

  // Validate tenant mapping
  tenantCmd
    .command('validate')
    .description('Validate tenant mapping')
    .requiredOption('--query <sql>', 'SQL mapping query')
    .requiredOption('--from-field <field>', 'Source tenant field name')
    .requiredOption('--to-field <field>', 'Target tenant field name')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await validateTenantMapping(options.query, options.fromField, options.toField);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const validateData = response.data as Record<string, unknown> | undefined;
      output(success({
        valid: validateData?.valid !== false,
        errors: validateData?.errors || [],
        warnings: validateData?.warnings || [],
      }, { source: 'remote' }));
    }));
}
