import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';
import { formatWarnings } from './format-helpers.js';

export const formatInit: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const steps = d.steps as Array<{ step: string; status: string; message: string }>;
  const lines: string[] = [];

  lines.push(chalk.bold('Quill CLI Initialization'));
  lines.push('');

  for (const s of steps) {
    let icon: string;
    let color: typeof chalk;
    if (s.status === 'success') {
      icon = chalk.green('✓');
      color = chalk;
    } else if (s.status === 'skipped') {
      icon = chalk.yellow('-');
      color = chalk;
    } else {
      icon = chalk.red('✗');
      color = chalk.red;
    }
    lines.push(`  ${icon} ${color(s.step)}: ${s.message}`);
  }

  lines.push('');
  if (d.initialized) {
    lines.push(chalk.green('Ready to use.'));
  } else {
    lines.push(chalk.yellow('Initialization incomplete. See warnings above.'));
  }

  return lines.join('\n') + formatWarnings(response);
};
