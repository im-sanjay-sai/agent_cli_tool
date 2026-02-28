import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';

export const formatTemplate: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  lines.push(chalk.bold(`Template: ${d.template}`));
  lines.push(chalk.dim(d.description as string));
  lines.push('');
  lines.push(JSON.stringify(d.example, null, 2));

  return lines.join('\n');
};
