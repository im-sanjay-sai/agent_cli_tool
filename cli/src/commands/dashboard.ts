import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getCurrentEnv } from '../core/config.js';
import { requireAuth } from '../core/auth.js';
import {
  fetchDashboards,
  fetchDashboard,
  editDashboard,
  createDashboardRemote,
  createReportRemote,
  deleteDashboardRemote,
  setSectionOrder,
} from '../core/client.js';
import { DashboardCreateInputSchema, DashboardFiltersUpdateSchema, ReportCreateInputSchema } from '../models/index.js';
import { confirmDeletion } from '../utils/confirm.js';
import { output, withErrorHandling, verbose } from '../output/formatter.js';
import { success, successList, successCreated, successUpdated, successDeleted } from '../output/success.js';
import { invalidInput, fromZodError, networkError } from '../output/errors.js';

export function registerDashboardCommands(program: Command): void {
  const dashCmd = program
    .command('dashboard')
    .alias('dash')
    .description('Manage dashboards');

  // List dashboards
  dashCmd
    .command('list')
    .description('List all dashboards')
    .action(withErrorHandling(async () => {
      await requireAuth();
      const env = await getCurrentEnv();
      const response = await fetchDashboards();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      const dashboards = (data?.dashboards || data?.items || []) as Record<string, unknown>[];
      
      output(successList(
        dashboards.map(d => ({
          id: d.id || d._id,
          name: d.name,
          reportCount: (d.reportIds as string[])?.length || 0,
          filterCount: (d.globalFilters as unknown[])?.length || 0,
        })),
        { source: 'remote', env }
      ));
    }));

  // Show dashboard
  dashCmd
    .command('show')
    .description('Show dashboard details')
    .argument('<id>', 'Dashboard ID')
    .action(withErrorHandling(async (id) => {
      await requireAuth();
      const env = await getCurrentEnv();
      const response = await fetchDashboard(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(success(response.data, { source: 'remote', env }));
    }));

  // Create dashboard
  dashCmd
    .command('create')
    .description('Create a new dashboard')
    .requiredOption('--name <name>', 'Dashboard name')
    .option('--file <path>', 'JSON file with full dashboard config')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      let input: Record<string, unknown>;
      
      if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        input = JSON.parse(content);
      } else {
        input = { name: options.name };
      }
      
      // Validate input
      const parseResult = DashboardCreateInputSchema.safeParse(input);
      if (!parseResult.success) {
        throw fromZodError(parseResult.error);
      }
      
      // Transform filters to ensure id is present
      const globalFilters = (parseResult.data.globalFilters || []).map((f, idx) => ({
        ...f,
        id: f.id || `filter_${idx}`,
      }));
      
      const response = await createDashboardRemote({
        name: parseResult.data.name,
        globalFilters,
        reportIds: [],
        layout: parseResult.data.layout,
        tenantKeys: parseResult.data.tenantKeys,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successCreated(response.data, { source: 'remote', env }));
    }));

  // Update dashboard
  dashCmd
    .command('update')
    .description('Update a dashboard')
    .argument('<id>', 'Dashboard ID')
    .option('--name <name>', 'New dashboard name')
    .option('--file <path>', 'JSON file with updates')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      let updates: Record<string, unknown> = {};
      
      if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        updates = JSON.parse(content);
      }
      
      if (options.name) {
        updates.name = options.name;
      }
      
      if (Object.keys(updates).length === 0) {
        throw invalidInput('No updates specified. Use --name or --file');
      }
      
      const response = await editDashboard(id, updates);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote', env }));
    }));

  // Delete dashboard
  dashCmd
    .command('delete')
    .description('Delete a dashboard')
    .argument('<id>', 'Dashboard ID')
    .option('--force', 'Skip confirmation')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      if (!options.force) {
        const confirmed = await confirmDeletion('dashboard', id);
        if (!confirmed) {
          output(success({ message: 'Deletion cancelled' }));
          return;
        }
      }
      
      const response = await deleteDashboardRemote(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successDeleted(id, 'dashboard', { source: 'remote', env }));
    }));

  // Set filters
  dashCmd
    .command('set-filters')
    .description('Set dashboard global filters')
    .argument('<id>', 'Dashboard ID')
    .requiredOption('--file <path>', 'JSON file with filters')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      const content = await fs.readFile(options.file, 'utf-8');
      const data = JSON.parse(content);
      
      // Validate filters
      const parseResult = DashboardFiltersUpdateSchema.safeParse(data);
      if (!parseResult.success) {
        throw fromZodError(parseResult.error);
      }
      
      const response = await editDashboard(id, {
        globalFilters: parseResult.data.globalFilters,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote', env }));
    }));

  // Set section order
  dashCmd
    .command('set-section-order')
    .description('Set dashboard section order')
    .argument('<id>', 'Dashboard ID')
    .requiredOption('--file <path>', 'JSON file with section order')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      const content = await fs.readFile(options.file, 'utf-8');
      const data = JSON.parse(content);
      
      const response = await setSectionOrder(id, data.sectionOrder || data);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote', env }));
    }));

  // Setup: create dashboard + reports + filters in one shot
  dashCmd
    .command('setup')
    .description('Create a dashboard with reports and filters in one command')
    .requiredOption('--name <name>', 'Dashboard name')
    .option('--reports <paths>', 'Comma-separated report JSON file paths, or a directory containing report JSON files')
    .option('--filters <path>', 'JSON file with global filters config')
    .option('--file <path>', 'JSON file with full dashboard config (name, globalFilters, layout, tenantKeys)')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      const env = await getCurrentEnv();

      const warnings: string[] = [];
      let dashboardId: string | undefined;

      try {
        // Step 1: Build dashboard config
        let dashboardInput: Record<string, unknown>;
        if (options.file) {
          const content = await fs.readFile(options.file, 'utf-8');
          dashboardInput = JSON.parse(content);
          if (!dashboardInput.name) {
            dashboardInput.name = options.name;
          }
        } else {
          dashboardInput = { name: options.name };
        }

        const parseResult = DashboardCreateInputSchema.safeParse(dashboardInput);
        if (!parseResult.success) {
          throw fromZodError(parseResult.error);
        }

        const globalFilters = (parseResult.data.globalFilters || []).map((f, idx) => ({
          ...f,
          id: f.id || `filter_${idx}`,
        }));

        verbose('Setup step 1: Creating dashboard...');
        const dashResponse = await createDashboardRemote({
          name: parseResult.data.name,
          globalFilters,
          reportIds: [],
          layout: parseResult.data.layout,
          tenantKeys: parseResult.data.tenantKeys,
        });

        if (dashResponse.error) {
          throw networkError(`Failed to create dashboard: ${dashResponse.error}`);
        }

        const dashData = dashResponse.data as Record<string, unknown> | undefined;
        dashboardId = (dashData?.id || dashData?._id) as string | undefined;

        if (!dashboardId) {
          throw networkError('Dashboard created but no ID returned');
        }

        verbose(`Dashboard created with ID: ${dashboardId}`);

        // Step 2: Create reports (if provided)
        const createdReports: Array<{ name: string; id: string }> = [];

        if (options.reports) {
          const reportFiles = await resolveReportFiles(options.reports);
          verbose(`Setup step 2: Creating ${reportFiles.length} reports...`);

          for (const reportFile of reportFiles) {
            try {
              const content = await fs.readFile(reportFile, 'utf-8');
              const reportData = JSON.parse(content);

              const reportParse = ReportCreateInputSchema.safeParse(reportData);
              if (!reportParse.success) {
                warnings.push(`Skipped ${reportFile}: ${reportParse.error.issues[0]?.message || 'validation failed'}`);
                continue;
              }

              const reportResponse = await createReportRemote(dashboardId, {
                name: reportParse.data.name,
                baseSql: reportParse.data.baseSql,
                chartType: reportParse.data.chartType,
                params: reportParse.data.params || [],
                formatting: reportParse.data.formatting,
                pivot: reportParse.data.pivot || null,
                dateField: reportParse.data.dateField,
                filterMap: reportParse.data.filterMap,
                order: reportParse.data.order || createdReports.length,
              });

              if (reportResponse.error) {
                warnings.push(`Failed to create report from ${reportFile}: ${reportResponse.error}`);
                continue;
              }

              const rData = reportResponse.data as Record<string, unknown> | undefined;
              const reportId = (rData?.id || rData?._id) as string | undefined;
              createdReports.push({
                name: reportParse.data.name,
                id: reportId || 'unknown',
              });
              verbose(`Created report: ${reportParse.data.name} (${reportId})`);
            } catch (err) {
              warnings.push(`Error processing ${reportFile}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // Step 3: Set filters from separate file (if provided and not already in dashboard config)
        if (options.filters && !options.file) {
          verbose('Setup step 3: Setting filters...');
          try {
            const filtersContent = await fs.readFile(options.filters, 'utf-8');
            const filtersData = JSON.parse(filtersContent);

            const filtersParse = DashboardFiltersUpdateSchema.safeParse(filtersData);
            if (!filtersParse.success) {
              warnings.push(`Filters validation failed: ${filtersParse.error.issues[0]?.message || 'invalid format'}`);
            } else {
              const filtersResponse = await editDashboard(dashboardId, {
                globalFilters: filtersParse.data.globalFilters,
              });

              if (filtersResponse.error) {
                warnings.push(`Failed to set filters: ${filtersResponse.error}`);
              } else {
                verbose('Filters applied successfully');
              }
            }
          } catch (err) {
            warnings.push(`Error setting filters: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // Step 4: Fetch final state
        verbose('Setup step 4: Verifying dashboard...');
        const finalResponse = await fetchDashboard(dashboardId);
        const finalData = finalResponse.error ? dashData : finalResponse.data;

        output(success({
          dashboardId,
          name: options.name,
          reportsCreated: createdReports.length,
          reports: createdReports,
          dashboard: finalData,
        }, {
          source: 'remote',
          env,
          warnings,
        }));
      } catch (error) {
        // Rollback: delete the partially-created dashboard
        if (dashboardId) {
          verbose(`Rolling back: deleting dashboard ${dashboardId}`);
          try {
            await deleteDashboardRemote(dashboardId);
            verbose('Rollback successful');
          } catch {
            verbose('Rollback failed — dashboard may need manual cleanup');
          }
        }
        throw error;
      }
    }));
}

/**
 * Resolve report file paths from a comma-separated list or directory path.
 */
async function resolveReportFiles(reportsArg: string): Promise<string[]> {
  // Check if it's a directory
  try {
    const stat = await fs.stat(reportsArg);
    if (stat.isDirectory()) {
      const files = await fs.readdir(reportsArg);
      return files
        .filter(f => f.endsWith('.json'))
        .sort()
        .map(f => path.join(reportsArg, f));
    }
  } catch {
    // Not a directory, treat as comma-separated file list
  }

  return reportsArg.split(',').map(f => f.trim()).filter(Boolean);
}
