import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { notInitialized } from '../output/errors.js';
import { Environment, EnvironmentSchema } from '../models/index.js';

// Global options from CLI flags
export interface GlobalOptions {
  env: string;
  json: boolean;
  pretty: boolean;
  verbose: boolean;
  token?: string;
}

let globalOptions: GlobalOptions = {
  env: 'staging',
  json: true,
  pretty: false,
  verbose: false,
};

export function setGlobalOptions(opts: Partial<GlobalOptions>): void {
  globalOptions = { ...globalOptions, ...opts };
}

export function getGlobalOptions(): GlobalOptions {
  return globalOptions;
}

// Global config schema (stored in ~/.quill/config.json)
export const GlobalConfigSchema = z.object({
  token: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.string().optional(),
  clerkOrgId: z.string().optional(),
  email: z.string().optional(),
  orgName: z.string().optional(),
  defaultEnv: EnvironmentSchema.default('staging'),
  queryEndpoint: z.string().url().optional(),
  serverUrl: z.string().url().optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

// Project config schema (stored in .quill/config.json)
export const ProjectConfigSchema = z.object({
  clientId: z.string().optional(),
  queryEndpoint: z.string().url().optional(),
  queryHeaders: z.record(z.string()).optional(),
  currentEnv: EnvironmentSchema.default('staging'),
  withCredentials: z.boolean().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// Paths
const GLOBAL_CONFIG_DIR = path.join(homedir(), '.quill');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'config.json');
const PROJECT_STORE_DIR = '.quill';
const PROJECT_CONFIG_FILE = 'config.json';

export function getGlobalConfigDir(): string {
  return GLOBAL_CONFIG_DIR;
}

export function getGlobalConfigFile(): string {
  return GLOBAL_CONFIG_FILE;
}

export function getProjectStoreDir(cwd: string = process.cwd()): string {
  return path.join(cwd, PROJECT_STORE_DIR);
}

export function getProjectConfigFile(cwd: string = process.cwd()): string {
  return path.join(getProjectStoreDir(cwd), PROJECT_CONFIG_FILE);
}

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Read JSON file safely
 */
async function readJsonFile<T>(filePath: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return schema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write JSON file
 */
async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Global config operations
export async function getGlobalConfig(): Promise<GlobalConfig> {
  const config = await readJsonFile(GLOBAL_CONFIG_FILE, GlobalConfigSchema);
  if (config) return config as GlobalConfig;
  return { defaultEnv: 'staging' } as GlobalConfig;
}

export async function setGlobalConfig(config: Partial<GlobalConfig>): Promise<GlobalConfig> {
  const current = await getGlobalConfig();
  const merged: GlobalConfig = {
    ...current,
    ...config,
    defaultEnv: config.defaultEnv || current.defaultEnv || 'staging',
  };
  const updated = GlobalConfigSchema.parse(merged);
  await writeJsonFile(GLOBAL_CONFIG_FILE, updated);
  return updated;
}

export async function getGlobalConfigValue<K extends keyof GlobalConfig>(key: K): Promise<GlobalConfig[K]> {
  const config = await getGlobalConfig();
  return config[key];
}

export async function setGlobalConfigValue<K extends keyof GlobalConfig>(
  key: K,
  value: GlobalConfig[K]
): Promise<void> {
  const config = await getGlobalConfig();
  config[key] = value;
  await writeJsonFile(GLOBAL_CONFIG_FILE, config);
}

// Project config operations
export async function isProjectInitialized(cwd: string = process.cwd()): Promise<boolean> {
  try {
    await fs.access(getProjectConfigFile(cwd));
    return true;
  } catch {
    return false;
  }
}

export async function requireProjectInitialized(cwd: string = process.cwd()): Promise<void> {
  if (!(await isProjectInitialized(cwd))) {
    throw notInitialized();
  }
}

export async function getProjectConfig(cwd: string = process.cwd()): Promise<ProjectConfig> {
  await requireProjectInitialized(cwd);
  const config = await readJsonFile(getProjectConfigFile(cwd), ProjectConfigSchema);
  if (config) return config as ProjectConfig;
  return { currentEnv: 'staging' } as ProjectConfig;
}

export async function setProjectConfig(
  config: Partial<ProjectConfig>,
  cwd: string = process.cwd()
): Promise<ProjectConfig> {
  let current: ProjectConfig;
  try {
    current = await getProjectConfig(cwd);
  } catch {
    current = { currentEnv: 'staging' } as ProjectConfig;
  }
  const merged = {
    ...current,
    ...config,
    currentEnv: config.currentEnv || current.currentEnv || 'staging',
  };
  const updated = ProjectConfigSchema.parse(merged) as ProjectConfig;
  await writeJsonFile(getProjectConfigFile(cwd), updated);
  return updated;
}

export async function getProjectConfigValue<K extends keyof ProjectConfig>(
  key: K,
  cwd: string = process.cwd()
): Promise<ProjectConfig[K]> {
  const config = await getProjectConfig(cwd);
  return config[key];
}

export async function setProjectConfigValue<K extends keyof ProjectConfig>(
  key: K,
  value: ProjectConfig[K],
  cwd: string = process.cwd()
): Promise<void> {
  const config = await getProjectConfig(cwd);
  config[key] = value;
  await writeJsonFile(getProjectConfigFile(cwd), config);
}

/**
 * Initialize project config directory
 */
export async function initProjectStore(
  cwd: string = process.cwd(),
  options?: {
    clientId?: string;
    queryEndpoint?: string;
  }
): Promise<void> {
  const storeDir = getProjectStoreDir(cwd);
  await ensureDir(storeDir);

  // Create config file
  const config: ProjectConfig = {
    currentEnv: 'staging',
    clientId: options?.clientId,
    queryEndpoint: options?.queryEndpoint,
  };
  
  await writeJsonFile(getProjectConfigFile(cwd), config);
}

/**
 * Get current environment (from flag, project config, or global config)
 */
export async function getCurrentEnv(cwd: string = process.cwd()): Promise<Environment> {
  // 1. Check CLI flag
  const opts = getGlobalOptions();
  if (opts.env && (opts.env === 'staging' || opts.env === 'prod')) {
    return opts.env as Environment;
  }

  // 2. Check project config
  try {
    const projectConfig = await getProjectConfig(cwd);
    if (projectConfig.currentEnv) {
      return projectConfig.currentEnv;
    }
  } catch {
    // Project not initialized, continue to global config
  }

  // 3. Check global config
  const globalConfig = await getGlobalConfig();
  return globalConfig.defaultEnv || 'staging';
}

/**
 * Get merged config (global + project)
 */
export async function getMergedConfig(cwd: string = process.cwd()): Promise<{
  token?: string;
  clientId?: string;
  queryEndpoint?: string;
  queryHeaders?: Record<string, string>;
  currentEnv: Environment;
  withCredentials?: boolean;
}> {
  const globalConfig = await getGlobalConfig();
  
  let projectConfig: ProjectConfig | undefined;
  try {
    projectConfig = await getProjectConfig(cwd);
  } catch {
    // Project not initialized
  }

  const currentEnv = await getCurrentEnv(cwd);
  const opts = getGlobalOptions();

  return {
    token: opts.token || globalConfig.token,
    clientId: projectConfig?.clientId,
    queryEndpoint: projectConfig?.queryEndpoint || globalConfig.queryEndpoint,
    queryHeaders: projectConfig?.queryHeaders,
    currentEnv,
    withCredentials: projectConfig?.withCredentials,
  };
}
