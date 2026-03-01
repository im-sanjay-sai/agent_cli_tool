import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';

export const formatPromoteDash: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const from = d.from as Record<string, unknown>;
  const to = d.to as Record<string, unknown>;
  return chalk.green(`Dashboard "${d.dashboardName}" promoted.\n  From: ${from.name} (${from.clientId}) -> To: ${to.name} (${to.clientId})`);
};

export const formatPromoteReport: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const from = d.from as Record<string, unknown>;
  const to = d.to as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(chalk.green(`Report "${d.reportId}" promoted to "${d.toDashboard}".`));
  lines.push(`  From: ${from.name} (${from.clientId}) -> To: ${to.name} (${to.clientId})`);
  if (d.sameClient) lines.push(chalk.dim('  (cross-dashboard copy within same environment)'));
  return lines.join('\n');
};

export const formatPromoteVt: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const from = d.from as Record<string, unknown>;
  const to = d.to as Record<string, unknown>;
  return chalk.green(`Virtual table "${d.virtualTableName}" promoted.\n  From: ${from.name} (${from.clientId}) -> To: ${to.name} (${to.clientId})`);
};
