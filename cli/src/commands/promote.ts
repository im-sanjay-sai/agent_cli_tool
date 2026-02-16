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
    .option('--dry-run', 'Preview what would be promoted without making changes')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      if (options.from === options.to) {
        throw invalidInput('--from and --to must be different environments');
      }

      if (options.dryRun) {
        output(success({
          dryRun: true,
          action: 'promote-dashboard',
          dashboardName: name,
          from: options.from,
          to: options.to,
          autoResolve: !!options.autoResolve,
        }, { source: 'local' }));
        return;
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

  // Promote/copy report to another dashboard or environment
  // Same --from and --to = copy between dashboards in the same env
  // Different --from and --to = cross-environment promotion
  promoteCmd
    .command('report')
    .description('Promote/copy a report to another dashboard or environment')
    .argument('<id>', 'Report ID')
    .requiredOption('--to-dashboard <name>', 'Target dashboard name to copy the report into')
    .requiredOption('--from <clientId>', 'Source environment client ID')
    .requiredOption('--to <clientId>', 'Target environment client ID (can be same as --from for cross-dashboard copy)')
    .option('--auto-resolve', 'Automatically add missing virtual tables (cross-env only)')
    .option('--skip-warning', 'Skip promotion warnings')
    .option('--dry-run', 'Preview what would be promoted without making changes')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();

      if (options.dryRun) {
        output(success({
          dryRun: true,
          action: 'promote-report',
          reportId: id,
          toDashboard: options.toDashboard,
          from: options.from,
          to: options.to,
          sameClient: options.from === options.to,
          autoResolve: !!options.autoResolve,
        }, { source: 'local' }));
        return;
      }
      
      const response = await promoteReportRemote(id, options.toDashboard, options.from, options.to, {
        addMissingTables: options.from !== options.to ? options.autoResolve : false,
        skipWarning: options.skipWarning,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        reportId: id,
        toDashboard: options.toDashboard,
        from: options.from,
        to: options.to,
        sameClient: options.from === options.to,
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
    .option('--dry-run', 'Preview what would be promoted without making changes')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      if (options.from === options.to) {
        throw invalidInput('--from and --to must be different environments');
      }

      if (options.dryRun) {
        output(success({
          dryRun: true,
          action: 'promote-vt',
          virtualTableName: name,
          from: options.from,
          to: options.to,
        }, { source: 'local' }));
        return;
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
