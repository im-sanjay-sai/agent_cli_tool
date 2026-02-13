import { Command } from 'commander';
import { getAuthState } from '../core/auth.js';
import { getMergedConfig, getCurrentEnv } from '../core/config.js';
import { testConnection } from '../core/client.js';
import { output, withErrorHandling, verbose } from '../output/formatter.js';
import { success } from '../output/success.js';

/**
 * `quill status` -- single command to check auth, config, environment, and connection.
 * Designed for agents/CI to quickly diagnose issues.
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show authentication, configuration, environment, and connection status in one call')
    .option('--skip-connection-test', 'Skip the database connection test')
    .action(withErrorHandling(async (options) => {
      const warnings: string[] = [];

      // 1. Auth status
      const authState = await getAuthState();

      // 2. Config
      const config = await getMergedConfig();
      const currentEnv = await getCurrentEnv();

      // 3. Connection test (optional)
      let connectionStatus: { connected: boolean; message: string } | undefined;
      if (!options.skipConnectionTest && authState.authenticated) {
        try {
          verbose('Testing database connection...');
          const connResponse = await testConnection();
          const connData = connResponse.data as Record<string, unknown> | undefined;
          connectionStatus = {
            connected: connData?.success === true,
            message: (connData?.message as string) || connResponse.error || 'Unknown',
          };
        } catch (err) {
          connectionStatus = {
            connected: false,
            message: err instanceof Error ? err.message : String(err),
          };
          warnings.push(`Connection test failed: ${connectionStatus.message}`);
        }
      } else if (!authState.authenticated) {
        warnings.push('Skipping connection test: not authenticated');
      }

      output(success({
        auth: {
          authenticated: authState.authenticated,
          source: authState.source,
          email: authState.email,
          orgName: authState.orgName,
        },
        config: {
          clientId: config.clientId,
          queryEndpoint: config.queryEndpoint,
          serverUrl: config.serverUrl,
          currentEnv,
        },
        connection: connectionStatus,
      }, {
        source: 'local',
        warnings,
      }));
    }));
}
