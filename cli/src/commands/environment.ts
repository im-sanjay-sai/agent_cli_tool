import { Command } from 'commander';
import * as fs from 'fs/promises';
import {
  setProjectConfigValue,
  getMergedConfig,
} from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import {
  fetchClient,
  fetchClients,
  resolveClientId,
  updateClient,
  deleteClient,
} from '../core/client.js';
import { confirmDeletion } from '../utils/confirm.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success, successList, successDeleted } from '../output/success.js';
import { networkError } from '../output/errors.js';
import { requireValidId } from '../utils/id.js';

export function registerEnvironmentCommands(program: Command): void {
  const envCmd = program
    .command('env')
    .alias('environment')
    .description('Environment/client operations');

  // List environments -- marks the active one
  envCmd
    .command('list')
    .description('List available environments/clients')
    .option('--limit <n>', 'Max items to return')
    .option('--offset <n>', 'Skip first N items')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await fetchClients();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      // Get current clientId to mark the active environment
      const config = await getMergedConfig();
      const activeClientId = config.clientId;

      const clientsData = response.data as Record<string, unknown> | undefined;
      const clients = (clientsData?.clients || []) as Record<string, unknown>[];
      const total = clients.length;
      const offset = parseInt(options.offset || '0', 10);
      const limit = parseInt(options.limit || '0', 10);
      const page = limit > 0 ? clients.slice(offset, offset + limit) : clients;
      output(successList(
        page.map(c => ({
          id: c._id || c.clientId,
          name: c.name,
          databaseType: c.databaseType,
          schemaNames: c.schemaNames,
          active: (c._id || c.clientId) === activeClientId,
        })),
        { source: 'remote', total }
      ));
    }));

  // Show current environment details
  envCmd
    .command('show')
    .description('Show current environment/client details')
    .action(withErrorHandling(async () => {
      await requireAuth();
      
      // Use task: 'client' (lighter than 'environment' which includes all dashboards)
      const response = await fetchClient();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const rawData = response.data as Record<string, unknown> | undefined;
      const clientData = (rawData?.client ?? rawData) as Record<string, unknown> | undefined;
      output(success({
        clientId: clientData?.clientId || clientData?._id,
        name: clientData?.name,
        databaseType: clientData?.databaseType,
        schemaNames: clientData?.schemaNames,
      }, { source: 'remote' }));
    }));

  // Update environment
  envCmd
    .command('update')
    .description('Update environment settings')
    .argument('<id>', 'Client/environment ID')
    .requiredOption('--file <path>', 'JSON file: { name?, schemaNames?, databaseType?, databaseConnectionString? }')
    .action(withErrorHandling(async (id, options) => {
      requireValidId(id, 'environment');
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
      requireValidId(id, 'environment');
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

  // Switch environment -- accepts client name or ID
  envCmd
    .command('switch')
    .description('Switch to a different environment/client by name or ID')
    .argument('<nameOrId>', 'Environment name or client ID')
    .action(withErrorHandling(async (nameOrId) => {
      await requireAuth();
      
      // Resolve name to clientId
      const resolved = await resolveClientId(nameOrId);
      
      // Update clientId in project config
      await setProjectConfigValue('clientId', resolved.clientId);
      
      // If the resolved client has a queryEndpoint, update that too
      if (resolved.queryEndpoint) {
        await setProjectConfigValue('queryEndpoint', resolved.queryEndpoint);
      }
      
      output(success({
        switched: true,
        clientId: resolved.clientId,
        name: resolved.name,
      }));
    }));
}
