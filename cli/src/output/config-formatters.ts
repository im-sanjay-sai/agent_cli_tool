import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';
import { maskToken } from './format-helpers.js';

const SENSITIVE_KEYS = ['token', 'refreshToken'];

function formatConfigObject(label: string, obj: Record<string, unknown> | null): string[] {
  const lines: string[] = [];
  lines.push(chalk.bold(`${label}:`));
  if (!obj || Object.keys(obj).length === 0) {
    lines.push(chalk.dim('  (empty)'));
    return lines;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    let display: string;
    if (SENSITIVE_KEYS.includes(key) && typeof value === 'string') {
      display = maskToken(value);
    } else if (typeof value === 'object') {
      display = JSON.stringify(value);
    } else {
      display = String(value);
    }
    lines.push(`  ${key}: ${display}`);
  }
  return lines;
}

export const formatConfigInit: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines = [chalk.green('Initialized at .quill/')];
  if (d.clientId) lines.push(`  Client ID: ${d.clientId}`);
  if (d.endpoint) lines.push(`  Endpoint:  ${d.endpoint}`);
  return lines.join('\n');
};

export const formatConfigGet: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;

  // Full config dump (global + project)
  if ('global' in d && 'project' in d) {
    const lines: string[] = [];
    lines.push(...formatConfigObject('Global', d.global as Record<string, unknown> | null));
    lines.push('');
    lines.push(...formatConfigObject('Project', d.project as Record<string, unknown> | null));
    return lines.join('\n');
  }

  // Single key lookup
  const entries = Object.entries(d);
  if (entries.length === 1) {
    const [key, value] = entries[0];
    let display: string;
    if (SENSITIVE_KEYS.includes(key) && typeof value === 'string') {
      display = maskToken(value);
    } else if (value === undefined || value === null) {
      display = chalk.dim('(not set)');
    } else {
      display = String(value);
    }
    return `${key}: ${display}`;
  }

  // Fallback
  return JSON.stringify(d, null, 2);
};

export const formatConfigSet: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  return chalk.green(`Updated ${d.scope} config: ${d.key} = ${d.value}`);
};
