import { Command } from 'commander';
// Environment concept removed -- clientId IS the environment
import { requireAuth } from '../core/auth.js';
import { validateSqlStructure, extractColumns } from '../utils/ast.js';
import {
  fetchDashboard,
  fetchReport,
  fetchReportInfo,
  createReportRemote,
  updateReportRemote,
  deleteReportRemote,
} from '../core/client.js';
import { validateReport } from '../core/validator.js';
import { ReportCreateInputSchema } from '../models/index.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success, successList, successCreated, successUpdated, successDeleted } from '../output/success.js';
import { invalidInput, fromZodError, apiError } from '../output/errors.js';
import { requireValidId } from '../utils/id.js';
import {
  formatReportList, formatReportShow, formatReportCreated,
  formatReportUpdated, formatReportDeleted, formatReportRun,
  formatReportValidate,
} from '../output/report-formatters.js';

/**
 * Resolve a report ID from either a positional id arg or --name + --dashboard options.
 * If id is provided, validates it as an ObjectId and returns it.
 * If --name is provided, requires --dashboard, searches the dashboard for the report by name.
 */
async function resolveReportId(
  id: string | undefined,
  name: string | undefined,
  dashboardName: string | undefined,
): Promise<string> {
  if (id) {
    requireValidId(id, 'report');
    return id;
  }
  if (name) {
    if (!dashboardName) {
      throw invalidInput('--dashboard is required when using --name to identify a report');
    }
    const response = await fetchDashboard(dashboardName);
    if (response.error) throw apiError(response.error);
    const data = response.data as Record<string, unknown> | undefined;
    const sections = (data?.sections ?? {}) as Record<string, Record<string, unknown>[]>;
    for (const sectionReports of Object.values(sections)) {
      for (const report of sectionReports) {
        const reportName = (report.name as string) ?? '';
        if (reportName.toLowerCase() === name.toLowerCase()) {
          return (report.id ?? report._id) as string;
        }
      }
    }
    throw invalidInput(`Report "${name}" not found in dashboard "${dashboardName}". Run 'quill report list --dashboard "${dashboardName}"' to see available reports.`);
  }
  throw invalidInput('Provide either <id> or --name (with --dashboard)');
}

export function registerReportCommands(program: Command): void {
  const reportCmd = program
    .command('report')
    .description('Manage reports');

  // List reports
  reportCmd
    .command('list')
    .description('List reports for a dashboard')
    .requiredOption('--dashboard <name>', 'Dashboard name')
    .option('--limit <n>', 'Max items to return')
    .option('--offset <n>', 'Skip first N items')
    .addHelpText('after', '\nExamples:\n  $ quill report list --dashboard "Sales"\n')
    .action(withErrorHandling(async (options) => {
      await requireAuth();


      const response = await fetchDashboard(options.dashboard);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      const sections = (data?.sections ?? {}) as Record<string, Record<string, unknown>[]>;
      const reports: Record<string, unknown>[] = [];
      
      for (const [sectionName, sectionReports] of Object.entries(sections)) {
        for (const report of sectionReports) {
          reports.push({
            id: report.id ?? report._id,
            name: report.name,
            section: sectionName,
            dashboardName: options.dashboard,
            chartType: report.chartType,
            hasPivot: !!report.pivot,
          });
        }
      }
      
      const offset = parseInt(options.offset || '0', 10);
      const limit = parseInt(options.limit || '0', 10);
      const page = limit > 0 ? reports.slice(offset, offset + limit) : reports;
      output(successList(page, { source: 'remote', total: reports.length }), formatReportList);
    }));

  // Show report
  reportCmd
    .command('show')
    .description('Show report details')
    .argument('[id]', 'Report ID')
    .option('--name <name>', 'Report name')
    .option('--dashboard <dashName>', 'Dashboard name (required when using --name)')
    .addHelpText('after', '\nExamples:\n  $ quill report show 65abc...\n  $ quill report show --name "Revenue" --dashboard "Sales"\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveReportId(id, options.name, options.dashboard);
      await requireAuth();

      const response = await fetchReportInfo(resolvedId);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      // Frontend reads data.report from the response
      const rawData = response.data as Record<string, unknown> | undefined;
      const reportData = rawData?.report ?? rawData;
      output(success(reportData, { source: 'remote' }), formatReportShow);
    }));

  // Create report
  reportCmd
    .command('create')
    .description('Create a new report')
    .requiredOption('--dashboard <name>', 'Dashboard name')
    .requiredOption('--json <data>', 'Inline JSON: { name, baseSql, chartType, pivot?, dateField?, filterMap?, columns? }')
    .addHelpText('after', '\nExamples:\n  $ quill report create --dashboard "Sales" --json \'{"name":"Revenue","baseSql":"SELECT ...","chartType":"line"}\'\n')
    .action(withErrorHandling(async (options) => {
      await requireAuth();

      const data = JSON.parse(options.json);
      
      // Validate input
      const parseResult = ReportCreateInputSchema.safeParse(data);
      if (!parseResult.success) {
        throw fromZodError(parseResult.error);
      }
      
      // Frontend sends 'query'/'queryString' (not 'baseSql') and chart fields at top-level (not nested in 'formatting')
      const sql = parseResult.data.baseSql;
      const formatting = parseResult.data.formatting;

      // Extract referencedTables and referencedColumns from SQL
      const sqlParse = validateSqlStructure(sql);
      const referencedTables = sqlParse.tables ?? [];
      const columns = extractColumns(sql);
      const referencedColumns: Record<string, string[]> = {};
      for (const table of referencedTables) {
        referencedColumns[table] = columns;
      }

      const response = await createReportRemote(options.dashboard, {
        name: parseResult.data.name,
        query: sql,
        queryString: sql,
        chartType: parseResult.data.chartType,
        pivot: parseResult.data.pivot || null,
        dateField: parseResult.data.dateField,
        filterMap: parseResult.data.filterMap,
        order: parseResult.data.order || 0,
        useNewNodeSql: true,
        referencedTables,
        referencedColumns,
        columns: data.columns,
        // Flatten formatting fields to top-level (backend expects them flat, not nested)
        xAxisLabel: formatting?.xAxisLabel || '',
        xAxisFormat: formatting?.xAxisFormat || 'string',
        yAxisFields: formatting?.yAxisFields || [],
        showLegend: formatting?.showLegend,
      });
      
      if (response.error) {
        throw apiError(response.error);
      }

      output(successCreated(response.data, { source: 'remote' }), formatReportCreated);
    }));

  // Update report
  reportCmd
    .command('update')
    .description('Update a report')
    .argument('[id]', 'Report ID')
    .option('--name <name>', 'Report name')
    .option('--dashboard <dashName>', 'Dashboard name (required when using --name)')
    .requiredOption('--json <data>', 'Inline JSON with fields to update')
    .addHelpText('after', '\nExamples:\n  $ quill report update 65abc... --json \'{"chartType":"bar"}\'\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveReportId(id, options.name, options.dashboard);
      await requireAuth();

      const updates = JSON.parse(options.json);

      const response = await updateReportRemote(resolvedId, updates);

      if (response.error) {
        throw apiError(response.error);
      }

      output(successUpdated(response.data, { source: 'remote' }), formatReportUpdated);
    }));

  // Delete report
  reportCmd
    .command('delete')
    .description('Delete a report')
    .argument('[id]', 'Report ID')
    .option('--name <name>', 'Report name')
    .option('--dashboard <dashName>', 'Dashboard name (required when using --name)')
    .addHelpText('after', '\nExamples:\n  $ quill report delete 65abc...\n  $ quill report delete --name "Revenue" --dashboard "Sales"\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveReportId(id, options.name, options.dashboard);
      await requireAuth();

      const response = await deleteReportRemote(resolvedId);

      if (response.error) {
        throw apiError(response.error);
      }

      output(successDeleted(resolvedId, 'report', { source: 'remote' }), formatReportDeleted);
    }));

  // Run report (execute query)
  reportCmd
    .command('run')
    .description('Execute report query')
    .argument('[id]', 'Report ID')
    .option('--name <name>', 'Report name')
    .option('--dashboard <dashName>', 'Dashboard name (required when using --name)')
    .option('--filters <data>', 'Inline JSON filters')
    .addHelpText('after', '\nExamples:\n  $ quill report run 65abc...\n  $ quill report run --name "Revenue" --dashboard "Sales"\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveReportId(id, options.name, options.dashboard);
      await requireAuth();

      let filters;
      if (options.filters) {
        filters = JSON.parse(options.filters);
      }

      const response = await fetchReport(resolvedId, filters);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      const queries = response.queries as Record<string, unknown> | undefined;
      const queryResults = (queries?.queryResults as Record<string, unknown>[] | undefined)?.[0];

      output(success({
        reportId: resolvedId,
        rows: queryResults?.rows || data?.rows || [],
        fields: queryResults?.fields || data?.fields || [],
        rowCount: queryResults?.rowCount || data?.rowCount || 0,
      }, { source: 'remote' }), formatReportRun);
    }));

  // Validate report
  reportCmd
    .command('validate')
    .description('Validate report configuration')
    .argument('[id]', 'Report ID')
    .option('--name <name>', 'Report name')
    .option('--dashboard <dashName>', 'Dashboard name (required when using --name)')
    .addHelpText('after', '\nExamples:\n  $ quill report validate 65abc...\n')
    .action(withErrorHandling(async (id, options) => {
      const resolvedId = await resolveReportId(id, options.name, options.dashboard);
      await requireAuth();

      // Fetch report data from remote, then validate
      const response = await fetchReportInfo(resolvedId);
      
      if (response.error) {
        throw apiError(response.error);
      }
      
      const reportData = response.data as Record<string, unknown>;
      const result = await validateReport(reportData);

      output(success({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      }, { source: 'remote' }), formatReportValidate);
    }));
}
