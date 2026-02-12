import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerConfigCommands } from './commands/config.js';
import { registerDashboardCommands } from './commands/dashboard.js';
import { registerReportCommands } from './commands/report.js';
import { registerVirtualTableCommands } from './commands/virtual-table.js';
import { registerSchemaCommands } from './commands/schema.js';
import { registerQueryCommands } from './commands/query.js';
import { registerAiCommands } from './commands/ai.js';
import { registerTenantCommands } from './commands/tenant.js';
import { registerEnvironmentCommands } from './commands/environment.js';
import { registerPromoteCommands } from './commands/promote.js';
import { registerInitCommand } from './commands/init.js';
import { setGlobalOptions, GlobalOptions } from './core/config.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('quill')
    .description('CLI tool for Quill BI - manage dashboards, reports, and virtual tables')
    .version('0.1.0')
    .option('--env <environment>', 'Target environment (staging|prod)', 'staging')
    .option('--json', 'Output as JSON (default)', true)
    .option('--pretty', 'Pretty-print JSON output')
    .option('--verbose', 'Enable verbose logging to stderr')
    .option('--token <token>', 'API token for authentication')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts() as GlobalOptions;
      setGlobalOptions(opts);
    });

  // Register all command groups
  registerAuthCommands(program);
  registerConfigCommands(program);
  registerDashboardCommands(program);
  registerReportCommands(program);
  registerVirtualTableCommands(program);
  registerSchemaCommands(program);
  registerQueryCommands(program);
  registerAiCommands(program);
  registerTenantCommands(program);
  registerEnvironmentCommands(program);
  registerPromoteCommands(program);
  registerInitCommand(program);

  return program;
}
