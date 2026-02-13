import { Command } from 'commander';
import * as fs from 'fs/promises';
import { getCurrentEnv } from '../core/config.js';
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
import { confirmDeletion } from '../utils/confirm.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success, successList, successCreated, successUpdated, successDeleted } from '../output/success.js';
import { fromZodError, networkError } from '../output/errors.js';

export function registerReportCommands(program: Command): void {
  const reportCmd = program
    .command('report')
    .description('Manage reports');

  // List reports
  reportCmd
    .command('list')
    .description('List reports for a dashboard')
    .requiredOption('--dashboard <name>', 'Dashboard name')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      const response = await fetchDashboard(options.dashboard);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      // sections is { sectionName: Report[] } -- an object, not an array
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
      
      output(successList(reports, { source: 'remote', env }));
    }));

  // Show report
  reportCmd
    .command('show')
    .description('Show report details')
    .argument('<id>', 'Report ID')
    .action(withErrorHandling(async (id) => {
      await requireAuth();
      const env = await getCurrentEnv();
      const response = await fetchReportInfo(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      // Frontend reads data.report from the response
      const rawData = response.data as Record<string, unknown> | undefined;
      const reportData = rawData?.report ?? rawData;
      output(success(reportData, { source: 'remote', env }));
    }));

  // Create report
  reportCmd
    .command('create')
    .description('Create a new report')
    .requiredOption('--dashboard <name>', 'Dashboard name')
    .requiredOption('--file <path>', 'JSON file with report config')
    .action(withErrorHandling(async (options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      const content = await fs.readFile(options.file, 'utf-8');
      const data = JSON.parse(content);
      
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
        columns: (data as Record<string, unknown>).columns,
        // Flatten formatting fields to top-level (backend expects them flat, not nested)
        xAxisLabel: formatting?.xAxisLabel || '',
        xAxisFormat: formatting?.xAxisFormat || 'string',
        yAxisFields: formatting?.yAxisFields || [],
        showLegend: formatting?.showLegend,
      });
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successCreated(response.data, { source: 'remote', env }));
    }));

  // Update report
  reportCmd
    .command('update')
    .description('Update a report')
    .argument('<id>', 'Report ID')
    .requiredOption('--file <path>', 'JSON file with updates')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      const content = await fs.readFile(options.file, 'utf-8');
      const updates = JSON.parse(content);
      
      const response = await updateReportRemote(id, updates);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successUpdated(response.data, { source: 'remote', env }));
    }));

  // Delete report
  reportCmd
    .command('delete')
    .description('Delete a report')
    .argument('<id>', 'Report ID')
    .option('--force', 'Skip confirmation')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      if (!options.force) {
        const confirmed = await confirmDeletion('report', id);
        if (!confirmed) {
          output(success({ message: 'Deletion cancelled' }));
          return;
        }
      }
      
      const response = await deleteReportRemote(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      output(successDeleted(id, 'report', { source: 'remote', env }));
    }));

  // Run report (execute query)
  reportCmd
    .command('run')
    .description('Execute report query')
    .argument('<id>', 'Report ID')
    .option('--filters <path>', 'JSON file with filters')
    .action(withErrorHandling(async (id, options) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      let filters;
      if (options.filters) {
        const content = await fs.readFile(options.filters, 'utf-8');
        filters = JSON.parse(content);
      }
      
      const response = await fetchReport(id, filters);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const data = response.data as Record<string, unknown> | undefined;
      const queries = response.queries as Record<string, unknown> | undefined;
      const queryResults = (queries?.queryResults as Record<string, unknown>[] | undefined)?.[0];
      
      output(success({
        reportId: id,
        rows: queryResults?.rows || data?.rows || [],
        fields: queryResults?.fields || data?.fields || [],
        rowCount: queryResults?.rowCount || data?.rowCount || 0,
      }, { source: 'remote', env }));
    }));

  // Validate report
  reportCmd
    .command('validate')
    .description('Validate report configuration')
    .argument('<id>', 'Report ID')
    .action(withErrorHandling(async (id) => {
      await requireAuth();
      const env = await getCurrentEnv();
      
      // Fetch report data from remote, then validate
      const response = await fetchReportInfo(id);
      
      if (response.error) {
        throw networkError(response.error);
      }
      
      const reportData = response.data as Record<string, unknown>;
      const result = await validateReport(reportData);
      
      output(success({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      }, { source: 'remote', env }));
    }));
}
