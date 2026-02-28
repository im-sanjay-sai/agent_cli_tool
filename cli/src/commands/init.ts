import { Command } from 'commander';
import { loginWithToken, isValidTokenFormat, isAuthenticated, getAuthState } from '../core/auth.js';
import { initProjectStore, isProjectInitialized } from '../core/config.js';
import { testConnection } from '../core/client.js';
import { output, withErrorHandling, verbose } from '../output/formatter.js';
import { success } from '../output/success.js';
import { invalidInput } from '../output/errors.js';
import { formatInit } from '../output/init-formatters.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize Quill CLI: authenticate, set up project config, and verify connection')
    .option('--token <token>', 'API token for authentication')
    .option('--client-id <id>', 'Quill client ID for this project')
    .option('--query-endpoint <url>', 'Custom query endpoint URL')
    .option('--skip-connection-test', 'Skip the database connection test')
    .action(withErrorHandling(async (options) => {
      const steps: Array<{ step: string; status: 'success' | 'skipped' | 'failed'; message: string }> = [];

      // Step 1: Authentication
      if (options.token) {
        if (!isValidTokenFormat(options.token)) {
          throw invalidInput('Invalid token format. Token must be between 10 and 500 characters.');
        }
        await loginWithToken(options.token);
        steps.push({ step: 'auth', status: 'success', message: 'Authenticated with API token' });
        verbose('Step 1: Authenticated with API token');
      } else {
        // Check if already authenticated
        const alreadyAuthed = await isAuthenticated();
        if (alreadyAuthed) {
          const state = await getAuthState();
          steps.push({
            step: 'auth',
            status: 'skipped',
            message: `Already authenticated${state.email ? ` as ${state.email}` : ''} (source: ${state.source})`,
          });
          verbose('Step 1: Already authenticated, skipping');
        } else {
          steps.push({
            step: 'auth',
            status: 'failed',
            message: 'Not authenticated. Provide --token or run `quill login` first.',
          });
        }
      }

      // Step 2: Initialize project config (seed from --client-id/--query-endpoint or from env)
      const initialized = await isProjectInitialized();
      const clientId = options.clientId || process.env.QUILL_CLIENT_ID;
      const queryEndpoint = options.queryEndpoint || process.env.QUILL_QUERY_ENDPOINT;
      if (!initialized || options.clientId || options.queryEndpoint || clientId || queryEndpoint) {
        await initProjectStore(process.cwd(), {
          clientId,
          queryEndpoint,
        });
        steps.push({
          step: 'project',
          status: 'success',
          message: `Project initialized${clientId ? ` with clientId: ${clientId}` : ''}`,
        });
        verbose('Step 2: Project config initialized');
      } else {
        steps.push({
          step: 'project',
          status: 'skipped',
          message: 'Project already initialized',
        });
        verbose('Step 2: Project already initialized, skipping');
      }

      // Step 3: Test connection
      if (options.skipConnectionTest) {
        steps.push({ step: 'connection', status: 'skipped', message: 'Connection test skipped (--skip-connection-test)' });
        verbose('Step 3: Connection test skipped');
      } else {
        const authOk = steps.find(s => s.step === 'auth')?.status !== 'failed';
        if (authOk) {
          try {
            const response = await testConnection(
              process.env.QUILL_DATABASE_CONNECTION_STRING,
              process.env.QUILL_DATABASE_TYPE
            );
            const connData = response.data as Record<string, unknown> | undefined;
            const connected = connData?.success === true;
            steps.push({
              step: 'connection',
              status: connected ? 'success' : 'failed',
              message: connected
                ? 'Database connection verified'
                : `Connection test failed: ${(connData?.message as string) || response.error || 'Connection check returned no details'}`,
            });
            verbose(`Step 3: Connection test ${connected ? 'passed' : 'failed'}`);
          } catch (error) {
            steps.push({
              step: 'connection',
              status: 'failed',
              message: `Connection test error: ${error instanceof Error ? error.message : String(error)}`,
            });
            verbose('Step 3: Connection test threw an error');
          }
        } else {
          steps.push({
            step: 'connection',
            status: 'skipped',
            message: 'Skipped (not authenticated)',
          });
          verbose('Step 3: Skipped connection test (not authenticated)');
        }
      }

      const allSuccessOrSkipped = steps.every(s => s.status === 'success' || s.status === 'skipped');
      const warnings = steps.filter(s => s.status === 'failed').map(s => `${s.step}: ${s.message}`);

      output(success({
        initialized: allSuccessOrSkipped,
        steps,
      }, {
        source: 'local',
        warnings,
      }), formatInit);
    }));
}
