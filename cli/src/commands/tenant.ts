import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import {
  fetchTenantMapping,
  fetchViewerTenants,
  validateTenantMapping,
} from '../core/client.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success, successList } from '../output/success.js';
import { networkError } from '../output/errors.js';

export function registerTenantCommands(program: Command): void {
  const tenantCmd = program
    .command('tenant')
    .description('Tenant operations');

  // List tenants
  tenantCmd
    .command('list')
    .description('List available tenants')
    .action(withErrorHandling(async () => {
      await requireAuth();
      
      const response = await fetchViewerTenants();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const tenantsData = response.data as Record<string, unknown> | undefined;
      output(successList((tenantsData?.tenants || []) as unknown[], { source: 'remote' }));
    }));

  // Get tenant mapping
  const mappingCmd = tenantCmd
    .command('mapping')
    .description('Tenant mapping operations');

  mappingCmd
    .command('get')
    .description('Get tenant mappings')
    .action(withErrorHandling(async () => {
      await requireAuth();
      
      const response = await fetchTenantMapping();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const mappingsData = response.data as Record<string, unknown> | undefined;
      output(success({
        mappings: mappingsData?.mappings || mappingsData,
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
        throw networkError(response.error);
      }
      
      const validateData = response.data as Record<string, unknown> | undefined;
      output(success({
        valid: validateData?.valid !== false,
        errors: validateData?.errors || [],
        warnings: validateData?.warnings || [],
      }, { source: 'remote' }));
    }));
}
