import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
// Environment concept removed -- clientId IS the environment
import { requireAuth } from '../core/auth.js';
import { validateSqlStructure, extractColumns } from '../utils/ast.js';
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
    .option('--names-only', 'Return only dashboard names (lightweight)')
    .option('--limit <n>', 'Max items to return')
    .option('--offset <n>', 'Skip first N items')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      const response = await fetchDashboards();
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      const dashboards = (data?.dashboards as Record<string, unknown>[]) ?? [];
      const total = dashboards.length;
      const offset = parseInt(options.offset || '0', 10);
      const limit = parseInt(options.limit || '0', 10);
      const page = limit > 0 ? dashboards.slice(offset, offset + limit) : dashboards;

      if (options.namesOnly) {
        output(successList(
          page.map(d => d.name as string),
          { source: 'remote', total }
        ));
        return;
      }
      
      output(successList(
        page.map(d => {
          const filterCount = (d.filters as unknown[])?.length ?? 0;
          return {
            name: d.name,
            filterCount,
          };
        }),
        { source: 'remote', total }
      ));
    }));

  // Show dashboard
  dashCmd
    .command('show')
    .description('Show dashboard details')
    .argument('<name>', 'Dashboard name')
    .option('--full', 'Output the full raw dashboard data (warning: can be very large)')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      const response = await fetchDashboard(name);
      
      if (response.error) {
        throw networkError(response.error);
      }

      if (options.full) {
        output(success(response.data, { source: 'remote' }));
        return;
      }
      
      // Summary view by default -- the raw data can be 100s of KBs
      const data = response.data as Record<string, unknown> | undefined;
      const sections = (data?.sections ?? {}) as Record<string, unknown[]>;
      const sectionSummary: Record<string, number> = {};
      let totalReports = 0;
      for (const [sectionName, reports] of Object.entries(sections)) {
        const label = sectionName || '(default)';
        sectionSummary[label] = reports.length;
        totalReports += reports.length;
      }
      
      output(success({
        name: data?.name,
        totalReports,
        sections: sectionSummary,
        filterCount: (data?.filters as unknown[])?.length ?? 0,
        filters: data?.filters,
        sectionOrder: data?.sectionOrder,
        tenantKeys: data?.tenantKeys,
      }, { source: 'remote' }));
    }));

  // Create dashboard
  dashCmd
    .command('create')
    .description('Create a new dashboard')
    .requiredOption('--name <name>', 'Dashboard name')
    .option('--file <path>', 'JSON file: { name, tenantKeys?, layout? }')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      
      
      let input: Record<string, unknown>;
      
      if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        input = JSON.parse(content);
        if (input.name && input.name !== options.name) {
          verbose(`Warning: --name "${options.name}" overridden by name "${input.name}" from --file`);
        }
        if (!input.name) {
          input.name = options.name;
        }
      } else {
        input = { name: options.name };
      }
      
      // Validate input
      const parseResult = DashboardCreateInputSchema.safeParse(input);
      if (!parseResult.success) {
        throw fromZodError(parseResult.error);
      }
      
      const response = await createDashboardRemote({
        name: parseResult.data.name,
        tenantKeys: parseResult.data.tenantKeys,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      // Frontend reads data.dashboard from response
      const rawData = response.data as Record<string, unknown> | undefined;
      output(successCreated(rawData?.dashboard ?? rawData, { source: 'remote' }));
    }));

  // Update dashboard
  dashCmd
    .command('update')
    .description('Update a dashboard')
    .argument('<name>', 'Dashboard name')
    .option('--new-name <newName>', 'New dashboard name')
    .option('--file <path>', 'JSON file: { newName?, tenantKeys?, filters? }')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      
      let updates: Record<string, unknown> = {};
      
      if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        updates = JSON.parse(content);
      }
      
      if (options.newName) {
        updates.newName = options.newName;
      }
      
      if (Object.keys(updates).length === 0) {
        throw invalidInput('No updates specified. Use --new-name or --file');
      }
      
      const response = await editDashboard(name, updates);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      // Frontend reads data.dashboard from response
      const updateRawData = response.data as Record<string, unknown> | undefined;
      output(successUpdated(updateRawData?.dashboard ?? updateRawData, { source: 'remote' }));
    }));

  // Delete dashboard
  dashCmd
    .command('delete')
    .description('Delete a dashboard')
    .argument('<name>', 'Dashboard name')
    .option('--force', 'Skip confirmation')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      
      if (!options.force) {
        const confirmed = await confirmDeletion('dashboard', name);
        if (!confirmed) {
          output(success({ message: 'Deletion cancelled' }));
          return;
        }
      }
      
      const response = await deleteDashboardRemote(name);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successDeleted(name, 'dashboard', { source: 'remote' }));
    }));

  // Set filters
  dashCmd
    .command('set-filters')
    .description('Set dashboard filters')
    .argument('<name>', 'Dashboard name')
    .requiredOption('--file <path>', 'JSON file: { globalFilters: [{ id, type, field, label? }] }')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      
      const content = await fs.readFile(options.file, 'utf-8');
      const data = JSON.parse(content);
      
      // Validate filters
      const parseResult = DashboardFiltersUpdateSchema.safeParse(data);
      if (!parseResult.success) {
        throw fromZodError(parseResult.error);
      }
      
      const response = await editDashboard(name, {
        filters: parseResult.data.globalFilters,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote' }));
    }));

  // Set section order
  dashCmd
    .command('set-section-order')
    .description('Set dashboard section order')
    .argument('<name>', 'Dashboard name')
    .requiredOption('--file <path>', 'JSON file: { sectionOrder: [{ section, reportOrder: [id, ...] }] }')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();
      
      
      const content = await fs.readFile(options.file, 'utf-8');
      const data = JSON.parse(content);
      
      const response = await setSectionOrder(name, data.sectionOrder || data);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote' }));
    }));

  // Setup: create dashboard + reports + filters in one shot
  dashCmd
    .command('setup')
    .description('Create a dashboard with reports and filters in one command')
    .requiredOption('--name <name>', 'Dashboard name')
    .option('--reports <paths>', 'Comma-separated report JSON file paths, or a directory containing report JSON files')
    .option('--filters <path>', 'JSON file with global filters config')
    .option('--file <path>', 'JSON file: { name, tenantKeys?, layout? }')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      

      const warnings: string[] = [];
      let dashboardName: string = options.name;

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

        verbose('Setup step 1: Creating dashboard...');
        const dashResponse = await createDashboardRemote({
          name: parseResult.data.name,
          tenantKeys: parseResult.data.tenantKeys,
        });

        if (dashResponse.error) {
          throw networkError(`Failed to create dashboard: ${dashResponse.error}`);
        }

        const dashData = dashResponse.data as Record<string, unknown> | undefined;
        dashboardName = (dashData?.name || parseResult.data.name) as string;

        verbose(`Dashboard created: ${dashboardName}`);

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

              const sql = reportParse.data.baseSql;
              const fmt = reportParse.data.formatting;
              const sqlParse = validateSqlStructure(sql);
              const refTables = sqlParse.tables ?? [];
              const refCols = extractColumns(sql);
              const refColumnsMap: Record<string, string[]> = {};
              for (const t of refTables) { refColumnsMap[t] = refCols; }

              const reportResponse = await createReportRemote(dashboardName, {
                name: reportParse.data.name,
                query: sql,
                queryString: sql,
                chartType: reportParse.data.chartType,
                pivot: reportParse.data.pivot || null,
                dateField: reportParse.data.dateField,
                filterMap: reportParse.data.filterMap,
                order: reportParse.data.order || createdReports.length,
                useNewNodeSql: true,
                referencedTables: refTables,
                referencedColumns: refColumnsMap,
                columns: (reportData as Record<string, unknown>).columns,
                xAxisLabel: fmt?.xAxisLabel || '',
                xAxisFormat: fmt?.xAxisFormat || 'string',
                yAxisFields: fmt?.yAxisFields || [],
                showLegend: fmt?.showLegend,
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
              const filtersResponse = await editDashboard(dashboardName, {
                filters: filtersParse.data.globalFilters,
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
        const finalResponse = await fetchDashboard(dashboardName);
        const finalData = finalResponse.error ? dashData : finalResponse.data;

        output(success({
          dashboardName,
          name: options.name,
          reportsCreated: createdReports.length,
          reports: createdReports,
          dashboard: finalData,
        }, {
          source: 'remote',
          warnings,
        }));
      } catch (error) {
        // Rollback: delete the partially-created dashboard
        if (dashboardName) {
          verbose(`Rolling back: deleting dashboard ${dashboardName}`);
          try {
            await deleteDashboardRemote(dashboardName);
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
