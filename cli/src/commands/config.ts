import { Command } from 'commander';
import {
  getGlobalConfig,
  setGlobalConfigValue,
  getProjectConfig,
  setProjectConfigValue,
  initProjectStore,
  isProjectInitialized,
  getCurrentEnv,
} from '../core/config.js';
import { output, withErrorHandling } from '../output/formatter.js';
import { success } from '../output/success.js';
import { invalidInput, alreadyExists } from '../output/errors.js';

export function registerConfigCommands(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage CLI configuration');

  // Config init
  configCmd
    .command('init')
    .description('Initialize Quill CLI in current directory')
    .option('--client-id <id>', 'Quill client ID')
    .option('--endpoint <url>', 'Query endpoint URL')
    .option('--force', 'Overwrite existing configuration')
    .action(withErrorHandling(async (options) => {
      const cwd = process.cwd();
      
      if (await isProjectInitialized(cwd) && !options.force) {
        throw alreadyExists('Configuration', cwd);
      }
      
      await initProjectStore(cwd, {
        clientId: options.clientId,
        queryEndpoint: options.endpoint,
      });
      
      output(success({
        message: 'Quill CLI initialized',
        path: '.quill/',
        clientId: options.clientId,
        endpoint: options.endpoint,
      }));
    }));

  // Config get
  configCmd
    .command('get')
    .description('Get configuration values')
    .argument('[key]', 'Configuration key to get')
    .option('--global', 'Get from global config only')
    .option('--project', 'Get from project config only')
    .action(withErrorHandling(async (key, options) => {
      const globalConfig = await getGlobalConfig();
      
      let projectConfig = null;
      try {
        projectConfig = await getProjectConfig();
      } catch {
        // Project not initialized
      }
      
      const currentEnv = await getCurrentEnv();
      
      if (key) {
        // Get specific key
        let value: unknown;
        if (options.global) {
          value = (globalConfig as Record<string, unknown>)[key];
        } else if (options.project) {
          value = projectConfig ? (projectConfig as Record<string, unknown>)[key] : undefined;
        } else {
          // Merged: project overrides global
          value = projectConfig 
            ? (projectConfig as Record<string, unknown>)[key] ?? (globalConfig as Record<string, unknown>)[key]
            : (globalConfig as Record<string, unknown>)[key];
        }
        
        output(success({ [key]: value }));
      } else {
        // Get all config
        output(success({
          global: globalConfig,
          project: projectConfig,
          currentEnv,
        }));
      }
    }));

  // Config set
  configCmd
    .command('set')
    .description('Set configuration value')
    .argument('<key>', 'Configuration key')
    .argument('<value>', 'Configuration value')
    .option('--global', 'Set in global config')
    .action(withErrorHandling(async (key, value, options) => {
      // Parse value
      let parsedValue: unknown = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);
      
      if (options.global) {
        // Set global config
        const validKeys = ['token', 'defaultEnv', 'queryEndpoint', 'serverUrl'];
        if (!validKeys.includes(key)) {
          throw invalidInput(`Invalid global config key: ${key}. Valid keys: ${validKeys.join(', ')}`);
        }
        await setGlobalConfigValue(key as any, parsedValue as any);
      } else {
        // Set project config
        const validKeys = ['clientId', 'queryEndpoint', 'currentEnv', 'withCredentials', 'queryHeaders'];
        if (!validKeys.includes(key)) {
          throw invalidInput(`Invalid project config key: ${key}. Valid keys: ${validKeys.join(', ')}`);
        }
        await setProjectConfigValue(key as any, parsedValue as any);
      }
      
      output(success({
        message: 'Configuration updated',
        key,
        value: parsedValue,
        scope: options.global ? 'global' : 'project',
      }));
    }));
}
