import { Command } from 'commander';
import { createRequire } from 'module';
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
import { registerStatusCommand } from './commands/status.js';
import { registerTemplateCommand } from './commands/template.js';
import { setGlobalOptions, GlobalOptions } from './core/config.js';

// Read version from package.json
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

export function createCli(): Command {
  const program = new Command();

  program
    .name('quill')
    .description('CLI tool for Quill BI - manage dashboards, reports, and virtual tables. All output is JSON.')
    .version(pkg.version)
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
  registerStatusCommand(program);
  registerTemplateCommand(program);

  return program;
}
