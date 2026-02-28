import chalk from 'chalk';
import type { OutputResponse, HumanFormatter } from './formatter.js';

/**
 * Append warnings (if any) as yellow text.
 */
export function formatWarnings(response: OutputResponse): string {
  if ('warnings' in response && response.warnings?.length) {
    return '\n' + response.warnings.map(w => chalk.yellow(`  Warning: ${w}`)).join('\n');
  }
  return '';
}

/**
 * Shared formatter for deletion-cancelled messages.
 */
export const formatDeletionCancelled: HumanFormatter = (_response) => {
  return chalk.yellow('Deletion cancelled.');
};

/**
 * Shared formatter for validation results ({valid, errors, warnings}).
 * Used by report validate, vt validate, tenant validate.
 */
export const formatValidationResult: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as { valid: boolean; errors: Array<{ field?: string; message: string; code?: string } | string>; warnings: Array<{ field?: string; message: string; code?: string } | string> };
  const lines: string[] = [];

  if (d.valid) {
    lines.push(chalk.green('Valid: yes'));
  } else {
    lines.push(chalk.red('Valid: no'));
  }

  if (d.errors && d.errors.length > 0) {
    lines.push('');
    lines.push(chalk.red('Errors:'));
    for (const e of d.errors) {
      const msg = typeof e === 'string' ? e : (e.field ? `${e.field}: ${e.message}` : e.message);
      lines.push(chalk.red(`  - ${msg}`));
    }
  }

  if (d.warnings && d.warnings.length > 0) {
    lines.push('');
    lines.push(chalk.yellow('Warnings:'));
    for (const w of d.warnings) {
      const msg = typeof w === 'string' ? w : (w.field ? `${w.field}: ${w.message}` : w.message);
      lines.push(chalk.yellow(`  - ${msg}`));
    }
  }

  return lines.join('\n') + formatWarnings(response);
};

/**
 * Render query results as an ASCII table.
 * Used by report run and query run.
 */
export function renderTable(rows: Record<string, unknown>[], fields?: unknown[]): string {
  if (!rows || rows.length === 0) {
    return chalk.dim('  No rows returned.');
  }

  // Determine columns from first row or fields array
  const columns = fields && fields.length > 0
    ? fields.map(f => typeof f === 'string' ? f : (f as Record<string, unknown>)?.name as string || String(f))
    : Object.keys(rows[0]);

  const maxColWidth = 30;
  const maxRows = 50;
  const displayRows = rows.length > maxRows ? rows.slice(0, maxRows) : rows;

  // Calculate column widths
  const widths = columns.map(col => {
    const headerLen = col.length;
    const maxDataLen = displayRows.reduce((max, row) => {
      const val = String(row[col] ?? '');
      return Math.max(max, val.length);
    }, 0);
    return Math.min(Math.max(headerLen, maxDataLen), maxColWidth);
  });

  // Build header
  const header = columns.map((col, i) => col.padEnd(widths[i])).join('  ');
  const separator = widths.map(w => '-'.repeat(w)).join('  ');

  const lines: string[] = [];
  lines.push(chalk.bold(header));
  lines.push(chalk.dim(separator));

  // Build rows
  for (const row of displayRows) {
    const cells = columns.map((col, i) => {
      let val = String(row[col] ?? '');
      if (val.length > maxColWidth) {
        val = val.slice(0, maxColWidth - 3) + '...';
      }
      return val.padEnd(widths[i]);
    });
    lines.push(cells.join('  '));
  }

  if (rows.length > maxRows) {
    lines.push(chalk.dim(`  ... and ${rows.length - maxRows} more rows`));
  }

  return lines.join('\n');
}

/**
 * Shared formatter for query results ({rows, fields, rowCount}).
 */
export function formatQueryResultsData(data: Record<string, unknown>): string {
  const rows = (data.rows || []) as Record<string, unknown>[];
  const fields = data.fields as unknown[] | undefined;
  const rowCount = (data.rowCount ?? rows.length) as number;
  const lines: string[] = [];

  lines.push(renderTable(rows, fields));
  lines.push('');
  lines.push(chalk.dim(`${rowCount} row${rowCount !== 1 ? 's' : ''} returned.`));

  return lines.join('\n');
}

/**
 * Mask a token for display (first 4 + last 4 chars).
 */
export function maskToken(token: string): string {
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}
