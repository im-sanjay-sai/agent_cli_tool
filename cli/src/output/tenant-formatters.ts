import chalk from 'chalk';
import type { HumanFormatter } from './formatter.js';
import { formatWarnings } from './format-helpers.js';
export { formatValidationResult as formatTenantValidate } from './format-helpers.js';

export const formatTenantList: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const { items, total } = response.data as { items: unknown[]; total: number };
  const lines: string[] = [];

  lines.push(chalk.bold(`Tenants (${total}):`));
  lines.push('');

  if (items.length === 0) {
    lines.push(chalk.dim('  No tenants found.'));
    return lines.join('\n');
  }

  for (const item of items) {
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      // Best-effort: show id/name or stringify
      const label = obj.name || obj.id || obj._id || JSON.stringify(obj);
      lines.push(`  ${label}`);
    } else {
      lines.push(`  ${String(item)}`);
    }
  }

  return lines.join('\n') + formatWarnings(response);
};

export const formatTenantMapping: HumanFormatter = (response) => {
  if (!response.ok) return '';
  const d = response.data as Record<string, unknown>;
  const lines: string[] = [];

  const queryOrder = d.queryOrder as string[] | undefined;
  if (queryOrder && queryOrder.length > 0) {
    lines.push(`Query order: ${queryOrder.join(', ')}`);
    lines.push('');
  }

  const mappings = d.mappings as Record<string, unknown[]> | Record<string, unknown> | undefined;
  if (mappings && typeof mappings === 'object') {
    lines.push(chalk.bold('Mappings:'));
    for (const [field, values] of Object.entries(mappings)) {
      if (Array.isArray(values)) {
        const display = values.length > 10
          ? values.slice(0, 10).join(', ') + `, ... (${values.length} total)`
          : values.join(', ');
        lines.push(`  ${field}: ${display}`);
      } else {
        lines.push(`  ${field}: ${JSON.stringify(values)}`);
      }
    }
  }

  return lines.join('\n') + formatWarnings(response);
};
