import { Command } from 'commander';
import { requireAuth } from '../core/auth.js';
import {
  promoteDashboard as promoteDashboardRemote,
  promoteReport as promoteReportRemote,
  promoteVirtualTable as promoteVTRemote,
  resolveClientId,
} from '../core/client.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success } from '../output/success.js';
import { invalidInput, apiError } from '../output/errors.js';
import {
  formatPromoteDashDryRun, formatPromoteDash,
  formatPromoteReportDryRun, formatPromoteReport,
  formatPromoteVtDryRun, formatPromoteVt,
} from '../output/promote-formatters.js';

export function registerPromoteCommands(program: Command): void {
  const promoteCmd = program
    .command('promote')
    .description('Promote resources between environments');

  // Promote dashboard
  promoteCmd
    .command('dashboard')
    .description('Promote a dashboard to another environment')
    .argument('<name>', 'Dashboard name')
    .requiredOption('--from <nameOrId>', 'Source environment name or client ID')
    .requiredOption('--to <nameOrId>', 'Target environment name or client ID')
    .option('--auto-resolve', 'Automatically resolve conflicts (e.g. add missing tables)')
    .option('--skip-warning', 'Skip promotion warnings')
    .option('--dry-run', 'Preview what would be promoted without making changes')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      const from = await resolveClientId(options.from);
      const to = await resolveClientId(options.to);
      
      if (from.clientId === to.clientId) {
        throw invalidInput('--from and --to must be different environments for dashboard promotion');
      }

      if (options.dryRun) {
        output(success({
          dryRun: true,
          action: 'promote-dashboard',
          dashboardName: name,
          from: from.clientId,
          to: to.clientId,
          autoResolve: !!options.autoResolve,
        }, { source: 'local' }), formatPromoteDashDryRun);
        return;
      }
      
      const response = await promoteDashboardRemote(name, from.clientId, to.clientId, {
        addMissingTables: options.autoResolve,
        skipWarning: options.skipWarning,
      });
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        dashboardName: name,
        from: { clientId: from.clientId, name: from.name },
        to: { clientId: to.clientId, name: to.name },
        ...(data || {}),
      }, { source: 'remote' }), formatPromoteDash);
    }));

  // Promote/copy report to another dashboard or environment
  // Same --from and --to = copy between dashboards in the same env
  // Different --from and --to = cross-environment promotion
  promoteCmd
    .command('report')
    .description('Promote/copy a report to another dashboard or environment')
    .argument('<id>', 'Report ID')
    .requiredOption('--to-dashboard <name>', 'Target dashboard name to copy the report into')
    .requiredOption('--from <nameOrId>', 'Source environment name or client ID')
    .requiredOption('--to <nameOrId>', 'Target environment name or client ID (same as --from for cross-dashboard copy)')
    .option('--auto-resolve', 'Automatically add missing virtual tables (cross-env only)')
    .option('--skip-warning', 'Skip promotion warnings')
    .option('--dry-run', 'Preview what would be promoted without making changes')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      
      const from = await resolveClientId(options.from);
      const to = await resolveClientId(options.to);

      if (options.dryRun) {
        output(success({
          dryRun: true,
          action: 'promote-report',
          reportId: id,
          toDashboard: options.toDashboard,
          from: from.clientId,
          to: to.clientId,
          sameClient: from.clientId === to.clientId,
          autoResolve: !!options.autoResolve,
        }, { source: 'local' }), formatPromoteReportDryRun);
        return;
      }
      
      const response = await promoteReportRemote(id, options.toDashboard, from.clientId, to.clientId, {
        addMissingTables: from.clientId !== to.clientId ? options.autoResolve : false,
        skipWarning: options.skipWarning,
      });
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        reportId: id,
        toDashboard: options.toDashboard,
        from: { clientId: from.clientId, name: from.name },
        to: { clientId: to.clientId, name: to.name },
        sameClient: from.clientId === to.clientId,
        ...(data || {}),
      }, { source: 'remote' }), formatPromoteReport);
    }));

  // Promote virtual table
  promoteCmd
    .command('vt')
    .description('Promote a virtual table to another environment')
    .argument('<name>', 'Virtual table name')
    .requiredOption('--from <nameOrId>', 'Source environment name or client ID')
    .requiredOption('--to <nameOrId>', 'Target environment name or client ID')
    .option('--skip-warning', 'Skip promotion warnings')
    .option('--dry-run', 'Preview what would be promoted without making changes')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      const from = await resolveClientId(options.from);
      const to = await resolveClientId(options.to);
      
      if (from.clientId === to.clientId) {
        throw invalidInput('--from and --to must be different environments for VT promotion');
      }

      if (options.dryRun) {
        output(success({
          dryRun: true,
          action: 'promote-vt',
          virtualTableName: name,
          from: from.clientId,
          to: to.clientId,
        }, { source: 'local' }), formatPromoteVtDryRun);
        return;
      }
      
      const response = await promoteVTRemote(name, from.clientId, to.clientId, {
        skipWarning: options.skipWarning,
      });
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      output(success({
        promoted: true,
        virtualTableName: name,
        from: { clientId: from.clientId, name: from.name },
        to: { clientId: to.clientId, name: to.name },
        ...(data || {}),
      }, { source: 'remote' }), formatPromoteVt);
    }));
}
