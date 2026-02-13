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
    .argument('<name>', 'Dashboard name')
    .requiredOption('--from <clientId>', 'Source environment client ID')
    .requiredOption('--to <clientId>', 'Target environment client ID')
    .option('--auto-resolve', 'Automatically resolve conflicts (e.g. add missing tables)')
    .option('--skip-warning', 'Skip promotion warnings')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      if (options.from === options.to) {
        throw invalidInput('--from and --to must be different environments');
      }
      
      const response = await promoteDashboardRemote(name, options.from, options.to, {
        addMissingTables: options.autoResolve,
        skipWarning: options.skipWarning,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        dashboardName: name,
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
    .requiredOption('--dashboard <name>', 'Dashboard name the report belongs to')
    .requiredOption('--from <clientId>', 'Source environment client ID')
    .requiredOption('--to <clientId>', 'Target environment client ID')
    .option('--auto-resolve', 'Automatically add missing virtual tables')
    .option('--skip-warning', 'Skip promotion warnings')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      
      if (options.from === options.to) {
        throw invalidInput('--from and --to must be different environments');
      }
      
      const response = await promoteReportRemote(id, options.dashboard, options.from, options.to, {
        addMissingTables: options.autoResolve,
        skipWarning: options.skipWarning,
      });
      
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
    .argument('<name>', 'Virtual table name')
    .requiredOption('--from <clientId>', 'Source environment client ID')
    .requiredOption('--to <clientId>', 'Target environment client ID')
    .option('--skip-warning', 'Skip promotion warnings')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      if (options.from === options.to) {
        throw invalidInput('--from and --to must be different environments');
      }
      
      const response = await promoteVTRemote(name, options.from, options.to, {
        skipWarning: options.skipWarning,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        virtualTableName: name,
        from: options.from,
        to: options.to,
        ...(data || {}),
      }, { source: 'remote' }));
    }));
}
