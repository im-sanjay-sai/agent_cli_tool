import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';
import { formatWarnings } from './format-helpers.js';

export const formatStatus: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const auth = d.auth as Record<string, unknown>;
  const config = d.config as Record<string, unknown>;
  const connection = d.connection as Record<string, unknown> | undefined;
  const lines: string[] = [];

  // Auth
  const authIcon = auth.authenticated ? chalk.green('✓') : chalk.red('✗');
  const authLabel = auth.authenticated
    ? `${auth.email || 'authenticated'}${auth.orgName ? ` (${auth.orgName})` : ''} [${auth.source}]`
    : 'Not authenticated';
  lines.push(`${authIcon} Auth:       ${authLabel}`);

  // Config
  const hasConfig = config.clientId || config.queryEndpoint;
  const configIcon = hasConfig ? chalk.green('✓') : chalk.yellow('-');
  const configParts: string[] = [];
  if (config.clientId) configParts.push(`clientId=${config.clientId}`);
  if (config.queryEndpoint) configParts.push(`endpoint=${config.queryEndpoint}`);
  if (config.serverUrl) configParts.push(`server=${config.serverUrl}`);
  lines.push(`${configIcon} Config:     ${configParts.length > 0 ? configParts.join(', ') : chalk.dim('not configured')}`);

  // Connection
  if (connection) {
    const connIcon = connection.connected ? chalk.green('✓') : chalk.red('✗');
    lines.push(`${connIcon} Connection: ${connection.message}`);
  } else {
    lines.push(`${chalk.dim('-')} Connection: ${chalk.dim('skipped')}`);
  }

  return lines.join('\n') + formatWarnings(response);
};
