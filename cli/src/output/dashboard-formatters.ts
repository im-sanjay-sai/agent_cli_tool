import chalk from 'chalk';
import type { OutputResponse, HumanFormatter } from './formatter.js';

/**
 * Append warnings (if any) as yellow text.
 */
function formatWarnings(response: OutputResponse): string {
  if ('warnings' in response && response.warnings?.length) {
    return '\n' + response.warnings.map(w => chalk.yellow(`  Warning: ${w}`)).join('\n');
  }
  return '';
}

/**
 * dashboard list
 */
export const formatDashboardList: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { items, total } = response.data as { items: Array<{ name: string; filterCount?: number } | string>; total: number };
  const lines: string[] = [];

  lines.push(chalk.bold(`Dashboards (${total}):`));
  lines.push('');

  if (items.length === 0) {
    lines.push(chalk.dim('  No dashboards found.'));
  } else {
    // Calculate column width for alignment
    const names = items.map(i => typeof i === 'string' ? i : (i.name as string));
    const maxLen = Math.max(...names.map(n => n.length));

    for (const item of items) {
      if (typeof item === 'string') {
        lines.push(`  ${item}`);
      } else {
        const name = (item.name as string).padEnd(maxLen + 2);
        lines.push(`  ${chalk.cyan(name)} ${chalk.dim(`${item.filterCount ?? 0} filters`)}`);
      }
    }
  }

  return lines.join('\n') + formatWarnings(response);
};

/**
 * dashboard show (summary view)
 */
export const formatDashboardShow: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  lines.push(chalk.bold(`Dashboard: ${chalk.cyan(d.name as string)}`));
  lines.push('');
  lines.push(`  Total reports: ${d.totalReports ?? 'N/A'}`);
  lines.push(`  Filters:       ${d.filterCount ?? 0}`);

  const sections = d.sections as Record<string, number> | undefined;
  if (sections && Object.keys(sections).length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Sections:'));
    for (const [name, count] of Object.entries(sections)) {
      lines.push(`    ${name}: ${count} report${count !== 1 ? 's' : ''}`);
    }
  }

  const tenantKeys = d.tenantKeys as string[] | undefined;
  if (tenantKeys && tenantKeys.length > 0) {
    lines.push('');
    lines.push(`  Tenant keys: ${tenantKeys.join(', ')}`);
  }

  return lines.join('\n') + formatWarnings(response);
};

/**
 * dashboard create
 */
export const formatDashboardCreated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { created } = response.data as { created: Record<string, unknown> };
  const name = (created?.name ?? 'unknown') as string;
  return chalk.green(`Dashboard "${name}" created successfully.`) + formatWarnings(response);
};

/**
 * dashboard update
 */
export const formatDashboardUpdated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { updated } = response.data as { updated: Record<string, unknown> };
  const name = (updated?.name ?? '') as string;
  const msg = name ? `Dashboard "${name}" updated.` : 'Dashboard updated.';
  return chalk.green(msg) + formatWarnings(response);
};

/**
 * dashboard delete
 */
export const formatDashboardDeleted: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { deleted } = response.data as { deleted: { id: string; type: string } };
  return chalk.green(`Dashboard "${deleted.id}" deleted.`) + formatWarnings(response);
};

/**
 * dashboard set-filters
 */
export const formatFiltersUpdated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  return chalk.green('Dashboard filters updated.') + formatWarnings(response);
};

/**
 * dashboard set-section-order
 */
export const formatSectionOrderUpdated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  return chalk.green('Section order updated.') + formatWarnings(response);
};

/**
 * dashboard setup
 */
export const formatDashboardSetup: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  lines.push(chalk.green.bold(`Dashboard "${d.dashboardName}" setup complete.`));
  lines.push('');
  lines.push(`  Reports created: ${d.reportsCreated}`);

  const reports = d.reports as Array<{ name: string; id: string }> | undefined;
  if (reports && reports.length > 0) {
    for (const r of reports) {
      lines.push(`    ${chalk.dim('-')} ${r.name} ${chalk.dim(`(${r.id})`)}`);
    }
  }

  return lines.join('\n') + formatWarnings(response);
};

/**
 * dashboard delete (cancelled by user)
 */
export const formatDeletionCancelled: HumanFormatter = (response) => {
  if (!response.ok) return '';
  return chalk.yellow('Deletion cancelled.');
};
