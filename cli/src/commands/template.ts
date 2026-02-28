import { Command } from 'commander';
import { output, outputError } from '../output/formatter.js';
import { success } from '../output/success.js';
import { invalidInput } from '../output/errors.js';
import { formatTemplate } from '../output/template-formatters.js';

/**
 * `quill template <command>` -- output example JSON for --file flags.
 * Helps agents and users know what JSON shape to provide.
 */

const templates: Record<string, { description: string; example: Record<string, unknown> }> = {
  'report-create': {
    description: 'JSON for quill report create --file',
    example: {
      name: 'Revenue by Day',
      baseSql: 'SELECT DATE(created_at) as day, SUM(amount) as revenue FROM orders GROUP BY day ORDER BY day DESC',
      chartType: 'line',
      formatting: {
        xAxisLabel: 'Date',
        xAxisFormat: 'MMM_dd',
        yAxisFields: [{ field: 'revenue', label: 'Revenue', format: 'dollar_amount' }],
        showLegend: true,
      },
      pivot: null,
      dateField: { table: 'orders', field: 'created_at' },
      filterMap: {},
      columns: [],
      order: 0,
    },
  },
  'dashboard-create': {
    description: 'JSON for quill dashboard create --file',
    example: {
      name: 'Sales Analytics',
      tenantKeys: [],
    },
  },
  'dashboard-filters': {
    description: 'JSON for quill dashboard set-filters --file',
    example: {
      globalFilters: [
        { id: 'filter_0', type: 'string', field: 'region', label: 'Region' },
        { id: 'filter_1', type: 'date', field: 'created_at', label: 'Date Range' },
      ],
    },
  },
  'dashboard-section-order': {
    description: 'JSON for quill dashboard set-section-order --file',
    example: {
      sectionOrder: [
        { section: 'Overview', reportOrder: ['report_id_1', 'report_id_2'] },
        { section: 'Details', reportOrder: ['report_id_3'] },
      ],
    },
  },
  'pivot-config': {
    description: 'JSON for quill ai pivot --file',
    example: {
      pivotCountRequest: 5,
      allowedRowFields: ['category', 'region'],
      allowedColumnFields: ['month'],
      allowedValueFields: ['revenue', 'count'],
      tableSchema: { category: 'varchar', region: 'varchar', month: 'date', revenue: 'numeric', count: 'int4' },
    },
  },
  'env-update': {
    description: 'JSON for quill env update --file',
    example: {
      name: 'Production',
      schemaNames: ['public'],
      databaseType: 'postgres',
      databaseConnectionString: 'postgresql://user:pass@host:5432/db',
    },
  },
};

// Short aliases so `quill template report` works as well as `quill template report-create`
templates['report'] = templates['report-create'];
templates['dashboard'] = templates['dashboard-create'];
templates['filters'] = templates['dashboard-filters'];
templates['pivot'] = templates['pivot-config'];
templates['env'] = templates['env-update'];

export function registerTemplateCommand(program: Command): void {
  program
    .command('template')
    .description('Show example JSON template for --file flags')
    .argument('<name>', `Template name: ${Object.keys(templates).join(', ')}`)
    .action((name) => {
      const template = templates[name];
      if (!template) {
        const err = invalidInput(
          `Unknown template: ${name}. Available: ${Object.keys(templates).join(', ')}`
        );
        outputError(err);
        return;
      }

      output(success({
        template: name,
        description: template.description,
        example: template.example,
      }, { source: 'local' }), formatTemplate);
    });
}
