import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';
import { formatWarnings, formatQueryResultsData } from './format-helpers.js';
export { formatDeletionCancelled } from './format-helpers.js';

export const formatReportList: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { items, total } = response.data as { items: Array<Record<string, unknown>>; total: number };
  const lines: string[] = [];

  lines.push(chalk.bold(`Reports (${total}):`));
  lines.push('');

  if (items.length === 0) {
    lines.push(chalk.dim('  No reports found.'));
    return lines.join('\n');
  }

  // Column alignment
  const ids = items.map(r => String(r.id ?? ''));
  const names = items.map(r => String(r.name ?? ''));
  const sections = items.map(r => String(r.section ?? ''));
  const types = items.map(r => String(r.chartType ?? ''));

  const idW = Math.max(2, ...ids.map(s => s.length));
  const nameW = Math.max(4, ...names.map(s => s.length));
  const secW = Math.max(7, ...sections.map(s => s.length));

  lines.push(chalk.bold(`  ${'ID'.padEnd(idW)}  ${'Name'.padEnd(nameW)}  ${'Section'.padEnd(secW)}  Type`));
  lines.push(chalk.dim(`  ${'-'.repeat(idW)}  ${'-'.repeat(nameW)}  ${'-'.repeat(secW)}  ----`));

  for (let i = 0; i < items.length; i++) {
    const pivot = items[i].hasPivot ? ' [pivot]' : '';
    lines.push(`  ${ids[i].padEnd(idW)}  ${chalk.cyan(names[i].padEnd(nameW))}  ${sections[i].padEnd(secW)}  ${types[i]}${pivot}`);
  }

  return lines.join('\n') + formatWarnings(response);
};

export const formatReportShow: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  const name = (d.name ?? d.reportName ?? 'Unknown') as string;
  lines.push(chalk.bold(`Report: ${chalk.cyan(name)}`));
  lines.push('');
  if (d.id || d._id) lines.push(`  ID:         ${d.id ?? d._id}`);
  if (d.chartType) lines.push(`  Chart type: ${d.chartType}`);
  if (d.dashboardName) lines.push(`  Dashboard:  ${d.dashboardName}`);
  if (d.section) lines.push(`  Section:    ${d.section}`);

  const sql = (d.query ?? d.queryString ?? d.baseSql) as string | undefined;
  if (sql) {
    const truncated = sql.length > 200 ? sql.slice(0, 200) + '...' : sql;
    lines.push('');
    lines.push(chalk.bold('  SQL:'));
    lines.push(chalk.dim(`    ${truncated}`));
  }

  if (d.pivot) lines.push(`\n  Pivot: yes`);
  if (d.dateField) lines.push(`  Date field: ${JSON.stringify(d.dateField)}`);

  return lines.join('\n') + formatWarnings(response);
};

export const formatReportCreated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { created } = response.data as { created: Record<string, unknown> };
  const name = (created?.name ?? 'unknown') as string;
  const id = (created?.id ?? created?._id ?? '') as string;
  const idPart = id ? ` (${id})` : '';
  return chalk.green(`Report "${name}" created.${idPart}`) + formatWarnings(response);
};

export const formatReportUpdated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { updated } = response.data as { updated: Record<string, unknown> };
  const id = (updated?.id ?? updated?._id ?? '') as string;
  return chalk.green(`Report "${id}" updated.`) + formatWarnings(response);
};

export const formatReportDeleted: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { deleted } = response.data as { deleted: { id: string; type: string } };
  return chalk.green(`Report "${deleted.id}" deleted.`) + formatWarnings(response);
};

export const formatReportRun: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];
  if (d.reportId) lines.push(chalk.dim(`Report: ${d.reportId}`));
  lines.push('');
  lines.push(formatQueryResultsData(d));
  return lines.join('\n') + formatWarnings(response);
};

export { formatValidationResult as formatReportValidate } from './format-helpers.js';
