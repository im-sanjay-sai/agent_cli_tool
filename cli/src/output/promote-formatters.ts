import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';

export const formatPromoteDashDryRun: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(chalk.yellow(`[DRY RUN] Would promote dashboard "${d.dashboardName}"`));
  lines.push(`  From: ${d.from}`);
  lines.push(`  To:   ${d.to}`);
  if (d.autoResolve) lines.push(`  Auto-resolve: yes`);
  return lines.join('\n');
};

export const formatPromoteDash: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const from = d.from as Record<string, unknown>;
  const to = d.to as Record<string, unknown>;
  return chalk.green(`Dashboard "${d.dashboardName}" promoted.\n  From: ${from.name} (${from.clientId}) -> To: ${to.name} (${to.clientId})`);
};

export const formatPromoteReportDryRun: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(chalk.yellow(`[DRY RUN] Would promote report "${d.reportId}" -> "${d.toDashboard}"`));
  lines.push(`  From: ${d.from}`);
  lines.push(`  To:   ${d.to}`);
  if (d.sameClient) lines.push(`  Same environment (cross-dashboard copy)`);
  if (d.autoResolve) lines.push(`  Auto-resolve: yes`);
  return lines.join('\n');
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

export const formatPromoteVtDryRun: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(chalk.yellow(`[DRY RUN] Would promote virtual table "${d.virtualTableName}"`));
  lines.push(`  From: ${d.from}`);
  lines.push(`  To:   ${d.to}`);
  return lines.join('\n');
};

export const formatPromoteVt: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const from = d.from as Record<string, unknown>;
  const to = d.to as Record<string, unknown>;
  return chalk.green(`Virtual table "${d.virtualTableName}" promoted.\n  From: ${from.name} (${from.clientId}) -> To: ${to.name} (${to.clientId})`);
};
