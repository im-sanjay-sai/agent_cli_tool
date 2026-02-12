import { Command } from 'commander';
import * as fs from 'fs/promises';
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
    .requiredOption('--file <path>', 'JSON file with tenant mapping to validate')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const content = await fs.readFile(options.file, 'utf-8');
      const mapping = JSON.parse(content);
      
      const response = await validateTenantMapping(mapping);
      
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
