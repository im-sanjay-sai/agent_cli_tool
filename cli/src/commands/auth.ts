import { Command } from 'commander';
import open from 'open';
import ora from 'ora';
import chalk from 'chalk';
import {
  loginWithToken,
  loginWithDeviceCode,
  logout,
  getAuthState,
  isValidTokenFormat,
  startDeviceCodeFlow,
  pollForToken,
} from '../core/auth.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success } from '../output/success.js';
import { invalidInput } from '../output/errors.js';

export function registerAuthCommands(program: Command): void {
  // Login command
  program
    .command('login')
    .description('Authenticate with Quill API')
    .option('--token <token>', 'API token (for CI/CD and non-interactive use)')
    .action(withErrorHandling(async (options) => {
      if (options.token) {
        // ---- Method 1: Static API token ----
        const token = options.token;

        if (!isValidTokenFormat(token)) {
          throw invalidInput('Invalid token format. Token should be between 10 and 500 characters.');
        }

        await loginWithToken(token);

        output(success({
          message: 'Successfully logged in with API token',
          method: 'token',
          tokenStored: true,
        }));
      } else {
        // ---- Method 2: Device Code Flow ----
        // Step 1: Request a device code from the server
        const deviceCode = await startDeviceCodeFlow();

        // Step 2: Build the verification URL with the user code
        const verificationUrlWithCode = `${deviceCode.verificationUrl}?code=${deviceCode.userCode}`;

        // Step 3: Open browser
        console.error(chalk.bold('\n  Opening browser to authenticate...\n'));
        console.error(`  If the browser doesn't open, visit:`);
        console.error(chalk.cyan(`  ${verificationUrlWithCode}\n`));
        console.error(`  Your code: ${chalk.bold(deviceCode.userCode)}\n`);

        try {
          await open(verificationUrlWithCode);
        } catch {
          // Browser failed to open -- the URL is already printed above
        }

        // Step 4: Poll for approval with a spinner
        const spinner = ora({
          text: 'Waiting for approval...',
          stream: process.stderr,
        }).start();

        try {
          const tokenResponse = await pollForToken(
            deviceCode.deviceCode,
            deviceCode.interval,
            deviceCode.expiresIn,
          );

          // Step 5: Store credentials
          await loginWithDeviceCode(tokenResponse);

          spinner.succeed(
            tokenResponse.email
              ? `Authenticated as ${tokenResponse.email}${tokenResponse.orgName ? ` (${tokenResponse.orgName})` : ''}`
              : 'Authenticated successfully'
          );

          output(success({
            message: 'Successfully logged in',
            method: 'device_code',
            email: tokenResponse.email,
            orgName: tokenResponse.orgName,
            clerkOrgId: tokenResponse.clerkOrgId,
            tokenStored: true,
          }));
        } catch (error) {
          spinner.fail('Authentication failed');
          throw error;
        }
      }
    }));

  // Logout command
  program
    .command('logout')
    .description('Clear stored credentials')
    .action(withErrorHandling(async () => {
      await logout();

      output(success({
        message: 'Successfully logged out',
        tokenCleared: true,
      }));
    }));

  // Whoami command
  program
    .command('whoami')
    .description('Show current authentication status')
    .action(withErrorHandling(async () => {
      const state = await getAuthState();

      output(success({
        authenticated: state.authenticated,
        tokenSource: state.source,
        tokenPreview: state.token,
        email: state.email,
        orgName: state.orgName,
        clerkOrgId: state.clerkOrgId,
      }));
    }));
}
