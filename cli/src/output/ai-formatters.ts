import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';

export const formatAiQuery: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(chalk.dim(`Prompt: "${d.prompt}"`));
  lines.push('');
  lines.push(chalk.bold('Generated SQL:'));
  lines.push(`  ${d.sql}`);
  return lines.join('\n');
};

export const formatAiFix: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(chalk.dim(`Original: ${d.originalSql}`));
  lines.push(chalk.red(`Error:    ${d.error}`));
  lines.push('');
  lines.push(chalk.bold('Fixed SQL:'));
  lines.push(chalk.green(`  ${d.fixedSql}`));
  return lines.join('\n');
};

export const formatAiPivot: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const pivots = d.pivotTables;
  const lines: string[] = [];

  lines.push(chalk.bold('Pivot Configurations:'));
  lines.push(JSON.stringify(pivots, null, 2));
  return lines.join('\n');
};

export const formatAiEdit: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(chalk.dim(`Original: ${d.originalSql}`));
  lines.push(chalk.dim(`Prompt:   "${d.prompt}"`));
  lines.push('');
  lines.push(chalk.bold('Edited SQL:'));
  lines.push(chalk.green(`  ${d.editedSql}`));
  return lines.join('\n');
};

export const formatAiSearchDocs: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(chalk.dim(`Search: "${d.searchQuery}" (top ${d.k})`));
  lines.push('');
  lines.push(chalk.bold('Results:'));
  lines.push(JSON.stringify(d.result, null, 2));
  return lines.join('\n');
};
