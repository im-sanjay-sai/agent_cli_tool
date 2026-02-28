import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';
import { formatWarnings, formatQueryResultsData, renderTable } from './format-helpers.js';

export const formatQueryRun: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  // Auto-fix info
  const autoFix = d.autoFix as Record<string, unknown> | undefined;
  if (autoFix) {
    lines.push(chalk.yellow('Auto-fixed with AI:'));
    lines.push(chalk.dim(`  Original: ${autoFix.originalSql}`));
    lines.push(chalk.dim(`  Error:    ${autoFix.originalError}`));
    lines.push(chalk.green(`  Fixed:    ${autoFix.fixedSql}`));
    lines.push('');
  }

  lines.push(formatQueryResultsData(d));
  return lines.join('\n') + formatWarnings(response);
};

export const formatQueryParse: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  const tables = d.tables as string[] | undefined;
  if (tables && tables.length > 0) {
    lines.push(`Tables: ${tables.join(', ')}`);
  }

  if (d.ast) {
    lines.push('');
    lines.push(chalk.bold('AST:'));
    lines.push(JSON.stringify(d.ast, null, 2));
  }

  return lines.join('\n');
};

export const formatQueryBuild: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  return String(d.sql ?? '');
};

export const formatQueryExplain: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  lines.push(chalk.bold('SQL:'));
  lines.push(chalk.dim(`  ${d.sql}`));
  lines.push('');
  lines.push(chalk.bold('Plan:'));

  const plan = d.plan as Record<string, unknown>[] | undefined;
  if (plan && plan.length > 0) {
    lines.push(renderTable(plan));
  } else {
    lines.push(chalk.dim('  No plan data.'));
  }

  return lines.join('\n');
};
