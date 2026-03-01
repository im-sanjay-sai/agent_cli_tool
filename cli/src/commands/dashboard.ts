import { Command } from 'commander';
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
import { output, withErrorHandling, verbose } from '../output/formatter.js';
import { success, successList, successCreated, successUpdated, successDeleted } from '../output/success.js';
import { invalidInput, fromZodError, networkError, apiError } from '../output/errors.js';
import {
  formatDashboardList,
  formatDashboardShow,
  formatDashboardCreated,
  formatDashboardUpdated,
  formatDashboardDeleted,
  formatFiltersUpdated,
  formatSectionOrderUpdated,
  formatDashboardSetup,
} from '../output/dashboard-formatters.js';

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
    .addHelpText('after', '\nExamples:\n  $ quill dashboard list\n  $ quill dash list --limit 5\n')
    .action(withErrorHandling(async (options) => {
      await requireAuth();

      const response = await fetchDashboards();
      
      if (response.error) {
        throw apiError(response.error);
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
        ), formatDashboardList);
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
      ), formatDashboardList);
    }));

  // Show dashboard
  dashCmd
    .command('show')
    .description('Show dashboard details')
    .argument('<name>', 'Dashboard name')
    .option('--full', 'Output the full raw dashboard data (warning: can be very large)')
    .addHelpText('after', '\nExamples:\n  $ quill dashboard show "Sales"\n')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();

      const response = await fetchDashboard(name);
      
      if (response.error) {
        throw apiError(response.error);
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
      }, { source: 'remote' }), formatDashboardShow);
    }));

  // Create dashboard
  dashCmd
    .command('create')
    .description('Create a new dashboard')
    .requiredOption('--name <name>', 'Dashboard name')
    .option('--json <data>', 'Inline JSON: { name, tenantKeys?, layout? }')
    .addHelpText('after', '\nExamples:\n  $ quill dashboard create --name "Sales Dashboard"\n')
    .action(withErrorHandling(async (options) => {
      await requireAuth();

      let input: Record<string, unknown>;

      if (options.json) {
        input = JSON.parse(options.json);
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
        throw apiError(response.error);
      }
      
      // Frontend reads data.dashboard from response
      const rawData = response.data as Record<string, unknown> | undefined;
      output(successCreated(rawData?.dashboard ?? rawData, { source: 'remote' }), formatDashboardCreated);
    }));

  // Update dashboard
  dashCmd
    .command('update')
    .description('Update a dashboard')
    .argument('<name>', 'Dashboard name')
    .option('--new-name <newName>', 'New dashboard name')
    .option('--json <data>', 'Inline JSON: { newName?, tenantKeys?, filters? }')
    .addHelpText('after', '\nExamples:\n  $ quill dashboard update "Sales" --new-name "Revenue"\n')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();

      let updates: Record<string, unknown> = {};

      if (options.json) {
        updates = JSON.parse(options.json);
      }

      if (options.newName) {
        updates.newName = options.newName;
      }
      
      if (Object.keys(updates).length === 0) {
        throw invalidInput('No updates specified. Use --new-name or --json');
      }
      
      const response = await editDashboard(name, updates);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      // Frontend reads data.dashboard from response
      const updateRawData = response.data as Record<string, unknown> | undefined;
      output(successUpdated(updateRawData?.dashboard ?? updateRawData, { source: 'remote' }), formatDashboardUpdated);
    }));

  // Delete dashboard
  dashCmd
    .command('delete')
    .description('Delete a dashboard')
    .argument('<name>', 'Dashboard name')
    .addHelpText('after', '\nExamples:\n  $ quill dashboard delete "Old Dashboard"\n')
    .action(withErrorHandling(async (name) => {
      await requireAuth();

      const response = await deleteDashboardRemote(name);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(successDeleted(name, 'dashboard', { source: 'remote' }), formatDashboardDeleted);
    }));

  // Set filters
  dashCmd
    .command('set-filters')
    .description('Set dashboard filters')
    .argument('<name>', 'Dashboard name')
    .requiredOption('--json <data>', 'Inline JSON: { globalFilters: [{ id, type, field, label? }] }')
    .addHelpText('after', '\nExamples:\n  $ quill dashboard set-filters "Sales" --json \'{"globalFilters": [{"id":"f1","type":"string","field":"region"}]}\'\n')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();

      const data = JSON.parse(options.json);

      // Validate filters
      const parseResult = DashboardFiltersUpdateSchema.safeParse(data);
      if (!parseResult.success) {
        throw fromZodError(parseResult.error);
      }
      
      const response = await editDashboard(name, {
        filters: parseResult.data.globalFilters,
      });
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote' }), formatFiltersUpdated);
    }));

  // Set section order
  dashCmd
    .command('set-section-order')
    .description('Set dashboard section order')
    .argument('<name>', 'Dashboard name')
    .requiredOption('--json <data>', 'Inline JSON: { sectionOrder: [{ section, reportOrder: [id, ...] }] }')
    .addHelpText('after', '\nExamples:\n  $ quill dashboard set-section-order "Sales" --json \'{"sectionOrder": [{"section":"Overview","reportOrder":["id1"]}]}\'\n')
    .action(withErrorHandling(async (name, options) => {
      await requireAuth();

      const data = JSON.parse(options.json);

      const response = await setSectionOrder(name, data.sectionOrder || data);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote' }), formatSectionOrderUpdated);
    }));

  // Setup: create dashboard + reports + filters in one shot
  dashCmd
    .command('setup')
    .description('Create a dashboard with reports and filters in one command')
    .requiredOption('--name <name>', 'Dashboard name')
    .option('--reports-json <data>', 'JSON array of report objects')
    .option('--filters-json <data>', 'Inline JSON: { globalFilters: [...] }')
    .option('--json <data>', 'Inline JSON: { name, tenantKeys?, layout? }')
    .addHelpText('after', '\nExamples:\n  $ quill dashboard setup --name "Sales" --reports-json \'[...]\' --filters-json \'{"globalFilters":[...]}\'\n')
    .action(withErrorHandling(async (options) => {
      await requireAuth();

      const warnings: string[] = [];
      let dashboardName: string = options.name;

      try {
        // Step 1: Build dashboard config
        let dashboardInput: Record<string, unknown>;
        if (options.json) {
          dashboardInput = JSON.parse(options.json);
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

        if (options.reportsJson) {
          const reportsList = JSON.parse(options.reportsJson) as Record<string, unknown>[];
          verbose(`Setup step 2: Creating ${reportsList.length} reports...`);

          for (const reportData of reportsList) {
            try {
              const reportParse = ReportCreateInputSchema.safeParse(reportData);
              if (!reportParse.success) {
                warnings.push(`Skipped report: ${reportParse.error.issues[0]?.message || 'validation failed'}`);
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
                columns: reportData.columns,
                xAxisLabel: fmt?.xAxisLabel || '',
                xAxisFormat: fmt?.xAxisFormat || 'string',
                yAxisFields: fmt?.yAxisFields || [],
                showLegend: fmt?.showLegend,
              });

              if (reportResponse.error) {
                warnings.push(`Failed to create report "${reportParse.data.name}": ${reportResponse.error}`);
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
              warnings.push(`Error processing report: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // Step 3: Set filters (if provided and not already in dashboard config)
        if (options.filtersJson && !options.json) {
          verbose('Setup step 3: Setting filters...');
          try {
            const filtersData = JSON.parse(options.filtersJson);

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
        }), formatDashboardSetup);
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
