import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import {
  promoteDashboard as promoteDashboardRemote,
  promoteReport as promoteReportRemote,
  promoteVirtualTable as promoteVTRemote,
} from '../core/client.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success } from '../output/success.js';
import { invalidInput, networkError } from '../output/errors.js';

export function registerPromoteCommands(program: Command): void {
  const promoteCmd = program
    .command('promote')
    .description('Promote resources between environments');

  // Promote dashboard
  promoteCmd
    .command('dashboard')
    .description('Promote a dashboard to another environment')
    .argument('<id>', 'Dashboard ID')
    .requiredOption('--from <env>', 'Source environment')
    .requiredOption('--to <env>', 'Target environment')
    .option('--auto-resolve', 'Automatically resolve conflicts (e.g. add missing tables)')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      
      if (options.from === options.to) {
        throw invalidInput('--from and --to must be different environments');
      }
      
      const response = await promoteDashboardRemote(id, options.to, {
        addMissingTables: options.autoResolve,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        dashboardId: id,
        from: options.from,
        to: options.to,
        ...(data || {}),
      }, { source: 'remote' }));
    }));

  // Promote report
  promoteCmd
    .command('report')
    .description('Promote a report to another environment')
    .argument('<id>', 'Report ID')
    .requiredOption('--from <env>', 'Source environment')
    .requiredOption('--to <env>', 'Target environment')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      
      if (options.from === options.to) {
        throw invalidInput('--from and --to must be different environments');
      }
      
      const response = await promoteReportRemote(id, options.to);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        reportId: id,
        from: options.from,
        to: options.to,
        ...(data || {}),
      }, { source: 'remote' }));
    }));

  // Promote virtual table
  promoteCmd
    .command('vt')
    .description('Promote a virtual table to another environment')
    .argument('<id>', 'Virtual table ID')
    .requiredOption('--from <env>', 'Source environment')
    .requiredOption('--to <env>', 'Target environment')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      
      if (options.from === options.to) {
        throw invalidInput('--from and --to must be different environments');
      }
      
      const response = await promoteVTRemote(id, options.to);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        virtualTableId: id,
        from: options.from,
        to: options.to,
        ...(data || {}),
      }, { source: 'remote' }));
    }));
}
