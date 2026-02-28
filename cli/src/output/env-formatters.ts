import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';
import { formatWarnings } from './format-helpers.js';
export { formatDeletionCancelled } from './format-helpers.js';

export const formatEnvList: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { items, total } = response.data as { items: Array<Record<string, unknown>>; total: number };
  const lines: string[] = [];

  lines.push(chalk.bold(`Environments (${total}):`));
  lines.push('');

  if (items.length === 0) {
    lines.push(chalk.dim('  No environments found.'));
    return lines.join('\n');
  }

  const ids = items.map(e => String(e.id ?? ''));
  const names = items.map(e => String(e.name ?? ''));
  const dbs = items.map(e => String(e.databaseType ?? ''));
  const idW = Math.max(2, ...ids.map(s => s.length));
  const nameW = Math.max(4, ...names.map(s => s.length));
  const dbW = Math.max(8, ...dbs.map(s => s.length));

  lines.push(chalk.bold(`     ${'ID'.padEnd(idW)}  ${'Name'.padEnd(nameW)}  ${'Database'.padEnd(dbW)}  Schemas`));
  lines.push(chalk.dim(`     ${'-'.repeat(idW)}  ${'-'.repeat(nameW)}  ${'-'.repeat(dbW)}  -------`));

  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    const marker = e.active ? chalk.green('  *  ') : '     ';
    const schemas = Array.isArray(e.schemaNames) ? (e.schemaNames as string[]).join(', ') : '-';
    const nameStr = e.active ? chalk.green(names[i].padEnd(nameW)) : chalk.cyan(names[i].padEnd(nameW));
    lines.push(`${marker}${ids[i].padEnd(idW)}  ${nameStr}  ${dbs[i].padEnd(dbW)}  ${schemas}`);
  }

  return lines.join('\n') + formatWarnings(response);
};

export const formatEnvShow: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  lines.push(chalk.bold(`Environment: ${chalk.cyan(d.name as string)}`));
  lines.push('');
  if (d.clientId) lines.push(`  ID:       ${d.clientId}`);
  if (d.databaseType) lines.push(`  Database: ${d.databaseType}`);
  const schemas = d.schemaNames as string[] | undefined;
  if (schemas) lines.push(`  Schemas:  ${schemas.join(', ')}`);

  return lines.join('\n') + formatWarnings(response);
};

export const formatEnvUpdated: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  return chalk.green(`Environment "${d.clientId}" updated.`) + formatWarnings(response);
};

export const formatEnvDeleted: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { deleted } = response.data as { deleted: { id: string; type: string } };
  return chalk.green(`Environment "${deleted.id}" deleted.`) + formatWarnings(response);
};

export const formatEnvSwitched: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  return chalk.green(`Switched to "${d.name}" (${d.clientId})`);
};
