import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';
import { formatWarnings } from './format-helpers.js';
export { formatDeletionCancelled } from './format-helpers.js';
export { formatValidationResult as formatVtValidate } from './format-helpers.js';

export const formatVtList: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { items, total } = response.data as { items: Array<Record<string, unknown>>; total: number };
  const lines: string[] = [];

  lines.push(chalk.bold(`Virtual Tables (${total}):`));
  lines.push('');

  if (items.length === 0) {
    lines.push(chalk.dim('  No virtual tables found.'));
    return lines.join('\n');
  }

  const ids = items.map(t => String(t.id ?? ''));
  const names = items.map(t => String(t.name ?? ''));
  const idW = Math.max(2, ...ids.map(s => s.length));
  const nameW = Math.max(4, ...names.map(s => s.length));

  lines.push(chalk.bold(`  ${'ID'.padEnd(idW)}  ${'Name'.padEnd(nameW)}  Cols  Owner Fields       Status`));
  lines.push(chalk.dim(`  ${'-'.repeat(idW)}  ${'-'.repeat(nameW)}  ----  ------------       ------`));

  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    const cols = String(t.columnCount ?? '?');
    const owners = Array.isArray(t.ownerTenantFields) ? (t.ownerTenantFields as string[]).join(', ') : '-';
    const status = t.broken ? chalk.red('BROKEN') : chalk.green('OK');
    lines.push(`  ${ids[i].padEnd(idW)}  ${chalk.cyan(names[i].padEnd(nameW))}  ${cols.padEnd(4)}  ${owners.padEnd(17)}  ${status}`);
  }

  return lines.join('\n') + formatWarnings(response);
};

export const formatVtShow: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  const name = (d.name ?? d.displayName ?? 'Unknown') as string;
  lines.push(chalk.bold(`Virtual Table: ${chalk.cyan(name)}`));
  lines.push('');
  if (d._id || d.id) lines.push(`  ID:      ${d._id ?? d.id}`);

  const cols = d.columns as unknown[] | undefined;
  if (cols) lines.push(`  Columns: ${cols.length}`);

  const owners = d.ownerTenantFields as string[] | undefined;
  if (owners && owners.length > 0) lines.push(`  Owner fields: ${owners.join(', ')}`);
  if (d.broken) lines.push(chalk.red(`  Status: BROKEN`));

  const sql = (d.viewQuery ?? d.sql) as string | undefined;
  if (sql) {
    const truncated = sql.length > 300 ? sql.slice(0, 300) + '...' : sql;
    lines.push('');
    lines.push(chalk.bold('  SQL:'));
    lines.push(chalk.dim(`    ${truncated}`));
  }

  return lines.join('\n') + formatWarnings(response);
};

export const formatVtCreated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { created } = response.data as { created: Record<string, unknown> };
  const name = (created?.name ?? created?.displayName ?? 'unknown') as string;
  const id = (created?._id ?? created?.id ?? '') as string;
  const idPart = id ? ` (${id})` : '';
  return chalk.green(`Virtual table "${name}" created.${idPart}`) + formatWarnings(response);
};

export const formatVtUpdated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { updated } = response.data as { updated: Record<string, unknown> };
  const id = (updated?._id ?? updated?.id ?? '') as string;
  return chalk.green(`Virtual table "${id}" updated.`) + formatWarnings(response);
};

export const formatVtDeleted: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { deleted } = response.data as { deleted: { id: string; type: string } };
  return chalk.green(`Virtual table "${deleted.id}" deleted.`) + formatWarnings(response);
};

export const formatVtTest: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  // The test response shape varies — check for common success/failure indicators
  const success = d.success !== false && !d.error;
  if (success) {
    lines.push(chalk.green('Test passed.'));
  } else {
    lines.push(chalk.red('Test failed.'));
    if (d.error) lines.push(chalk.red(`  ${d.error}`));
    if (d.message) lines.push(`  ${d.message}`);
  }
  if (d.id) lines.push(chalk.dim(`  ID: ${d.id}`));

  return lines.join('\n') + formatWarnings(response);
};
