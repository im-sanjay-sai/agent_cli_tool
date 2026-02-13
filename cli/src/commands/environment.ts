import { Command } from 'commander';
import * as fs from 'fs/promises';
import {
  getCurrentEnv,
  setProjectConfigValue,
} from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import {
  fetchClients,
  fetchEnvironment,
  updateClient,
  deleteClient,
} from '../core/client.js';
import { confirmDeletion } from '../utils/confirm.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success, successList, successDeleted } from '../output/success.js';
import { invalidInput, networkError } from '../output/errors.js';

export function registerEnvironmentCommands(program: Command): void {
  const envCmd = program
    .command('env')
    .alias('environment')
    .description('Environment/client operations');

  // List environments
  envCmd
    .command('list')
    .description('List available environments/clients')
    .action(withErrorHandling(async () => {
      await requireAuth();
      
      const response = await fetchClients();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const clientsData = response.data as Record<string, unknown> | undefined;
      output(successList((clientsData?.clients || []) as unknown[], { source: 'remote' }));
    }));

  // Show environment
  envCmd
    .command('show')
    .description('Show current environment details')
    .action(withErrorHandling(async () => {
      await requireAuth();
      const currentEnv = await getCurrentEnv();
      
      const response = await fetchEnvironment();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const rawData = response.data as Record<string, unknown> | undefined;
      // Frontend reads data.environment or data directly
      const envData = (rawData?.environment ?? rawData) as Record<string, unknown> | undefined;
      // Only output useful fields -- the raw response includes ALL dashboards
      // and other heavy data that bloats output (especially for LLM agents).
      output(success({
        currentEnv,
        name: envData?.name,
        clientId: envData?.clientId || envData?._id,
        databaseType: envData?.databaseType,
        schemaNames: envData?.schemaNames,
      }, { source: 'remote' }));
    }));

  // Update environment
  envCmd
    .command('update')
    .description('Update environment settings')
    .argument('<id>', 'Client/environment ID')
    .requiredOption('--file <path>', 'JSON file: { name?, schemaNames?, databaseType?, databaseConnectionString? }')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      
      const content = await fs.readFile(options.file, 'utf-8');
      const updates = JSON.parse(content);
      
      const response = await updateClient(id, updates);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const updateData = response.data as Record<string, unknown> | undefined;
      output(success({
        message: 'Environment updated',
        clientId: id,
        ...(updateData || {}),
      }, { source: 'remote' }));
    }));

  // Delete environment
  envCmd
    .command('delete')
    .description('Delete an environment')
    .argument('<id>', 'Client/environment ID')
    .option('--force', 'Skip confirmation')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      
      if (!options.force) {
        const confirmed = await confirmDeletion('environment', id);
        if (!confirmed) {
          output(success({ message: 'Deletion cancelled' }));
          return;
        }
      }
      
      const response = await deleteClient(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successDeleted(id, 'environment', { source: 'remote' }));
    }));

  // Switch environment
  envCmd
    .command('switch')
    .description('Switch current environment')
    .argument('<env>', 'Environment name (staging or prod)')
    .action(withErrorHandling(async (env) => {
      if (env !== 'staging' && env !== 'prod') {
        throw invalidInput('Environment must be "staging" or "prod"');
      }
      
      await setProjectConfigValue('currentEnv', env);
      
      output(success({
        message: `Switched to ${env} environment`,
        currentEnv: env,
      }));
    }));
}
