import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';

export const formatLogin: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  if (d.method === 'token') {
    return chalk.green('Logged in with API token.');
  }
  const parts = [chalk.green('Logged in successfully.')];
  if (d.email) parts.push(`  Email: ${d.email}`);
  if (d.orgName) parts.push(`  Org:   ${d.orgName}`);
  return parts.join('\n');
};

export const formatLogout: HumanFormatter = (response) => {
  if (!response.ok) return '';
  return chalk.green('Logged out successfully.');
};

export const formatWhoami: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  if (!d.authenticated) {
    return chalk.yellow('Not authenticated.');
  }
  const lines: string[] = [];
  lines.push(chalk.green('Authenticated'));
  if (d.email) lines.push(`  Email:  ${d.email}`);
  if (d.orgName) lines.push(`  Org:    ${d.orgName}`);
  if (d.tokenSource) lines.push(`  Source: ${d.tokenSource}`);
  if (d.tokenPreview) lines.push(chalk.dim(`  Token:  ${d.tokenPreview}`));
  return lines.join('\n');
};
