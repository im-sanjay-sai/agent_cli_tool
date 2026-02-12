import { getGlobalOptions, getGlobalConfig, setGlobalConfig } from './config.js';
import { authRequired, networkError } from '../output/errors.js';
import { verbose } from '../output/formatter.js';

// Environment variable name for API token
const TOKEN_ENV_VAR = 'QUILL_API_TOKEN';

// Default Quill auth server (placeholder -- update when backend endpoints exist)
const DEFAULT_AUTH_BASE_URL = 'https://api.quillsql.com';

// ============= Types =============

export interface AuthState {
  authenticated: boolean;
  token?: string;
  source?: 'env' | 'flag' | 'config';
  email?: string;
  orgName?: string;
  clerkOrgId?: string;
}

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresIn: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  clerkOrgId?: string;
  email?: string;
  orgName?: string;
}

interface DeviceTokenPollResponse {
  status: 'pending' | 'success' | 'expired';
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  clerkOrgId?: string;
  email?: string;
  orgName?: string;
}

// ============= Auth Base URL =============

async function getAuthBaseUrl(): Promise<string> {
  const config = await getGlobalConfig();
  return config.serverUrl || DEFAULT_AUTH_BASE_URL;
}

// ============= Device Code Flow =============

/**
 * Start the device code flow by requesting a device code from the server.
 * The server returns a code the user must enter in their browser.
 */
export async function startDeviceCodeFlow(): Promise<DeviceCodeResponse> {
  const baseUrl = await getAuthBaseUrl();
  const url = `${baseUrl}/cli/auth/device-code`;

  verbose('Starting device code flow', { url });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw networkError(`Failed to start device code flow: ${response.status} ${response.statusText}`, {
      body: text,
    });
  }

  const data = await response.json() as DeviceCodeResponse;

  if (!data.deviceCode || !data.verificationUrl) {
    throw networkError('Invalid device code response from server');
  }

  return data;
}

/**
 * Poll the server for a token after the user has been directed to the browser.
 * Resolves when the user approves or the code expires.
 */
export async function pollForToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
): Promise<TokenResponse> {
  const baseUrl = await getAuthBaseUrl();
  const url = `${baseUrl}/cli/auth/token`;
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    await sleep(interval * 1000);

    verbose('Polling for token', { deviceCode });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw networkError(`Token poll failed: ${response.status} ${response.statusText}`, { body: text });
    }

    const data = await response.json() as DeviceTokenPollResponse;

    if (data.status === 'success' && data.accessToken) {
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt || new Date(Date.now() + 3600 * 1000).toISOString(),
        clerkOrgId: data.clerkOrgId,
        email: data.email,
        orgName: data.orgName,
      };
    }

    if (data.status === 'expired') {
      throw authRequired('Device code expired. Please run `quill login` again.');
    }

    // status === 'pending' -- keep polling
  }

  throw authRequired('Device code expired (timeout). Please run `quill login` again.');
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const baseUrl = await getAuthBaseUrl();
  const url = `${baseUrl}/cli/auth/refresh`;

  verbose('Refreshing access token');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    verbose(`Token refresh failed: ${response.status}`);
    throw authRequired('Session expired. Please run `quill login` to re-authenticate.');
  }

  const data = await response.json() as {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  };

  if (!data.accessToken) {
    throw authRequired('Session expired. Please run `quill login` to re-authenticate.');
  }

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt || new Date(Date.now() + 3600 * 1000).toISOString(),
  };
}

// ============= Token Resolution =============

/**
 * Check if a stored token is expired.
 */
function isTokenExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false; // API tokens without expiry are never considered expired
  const expiry = new Date(expiresAt).getTime();
  // Consider expired 60 seconds before actual expiry to avoid race conditions
  return Date.now() > expiry - 60_000;
}

/**
 * Get authentication token with precedence:
 * 1. QUILL_API_TOKEN environment variable
 * 2. --token flag
 * 3. Stored token in ~/.quill/config.json (with auto-refresh if expired)
 */
export async function getToken(): Promise<string | undefined> {
  // 1. Check environment variable
  const envToken = process.env[TOKEN_ENV_VAR];
  if (envToken) {
    verbose('Using token from environment variable');
    return envToken;
  }

  // 2. Check CLI flag
  const opts = getGlobalOptions();
  if (opts.token) {
    verbose('Using token from --token flag');
    return opts.token;
  }

  // 3. Check stored config
  const globalConfig = await getGlobalConfig();
  if (globalConfig.token) {
    // Check if token is expired
    if (isTokenExpired(globalConfig.tokenExpiresAt)) {
      verbose('Stored token is expired');

      // Try to refresh
      if (globalConfig.refreshToken) {
        try {
          verbose('Attempting token refresh');
          const refreshed = await refreshAccessToken(globalConfig.refreshToken);

          // Store the refreshed token
          await setGlobalConfig({
            token: refreshed.accessToken,
            refreshToken: refreshed.refreshToken || globalConfig.refreshToken,
            tokenExpiresAt: refreshed.expiresAt,
          });

          verbose('Token refreshed successfully');
          return refreshed.accessToken;
        } catch (error) {
          verbose(`Token refresh failed: ${error}`);
          // Refresh failed -- token is expired and unrecoverable
          return undefined;
        }
      }

      // No refresh token -- expired and unrecoverable
      return undefined;
    }

    verbose('Using token from config file');
    return globalConfig.token;
  }

  return undefined;
}

/**
 * Get token or throw if not authenticated
 */
export async function requireToken(): Promise<string> {
  const token = await getToken();
  if (!token) {
    throw authRequired();
  }
  return token;
}

// ============= Auth State =============

/**
 * Get authentication state with full details
 */
export async function getAuthState(): Promise<AuthState> {
  // 1. Check environment variable
  const envToken = process.env[TOKEN_ENV_VAR];
  if (envToken) {
    return {
      authenticated: true,
      token: maskToken(envToken),
      source: 'env',
    };
  }

  // 2. Check CLI flag
  const opts = getGlobalOptions();
  if (opts.token) {
    return {
      authenticated: true,
      token: maskToken(opts.token),
      source: 'flag',
    };
  }

  // 3. Check stored config
  const globalConfig = await getGlobalConfig();
  if (globalConfig.token) {
    const expired = isTokenExpired(globalConfig.tokenExpiresAt);
    return {
      authenticated: !expired,
      token: maskToken(globalConfig.token),
      source: 'config',
      email: globalConfig.email,
      orgName: globalConfig.orgName,
      clerkOrgId: globalConfig.clerkOrgId,
    };
  }

  return { authenticated: false };
}

// ============= Login / Logout =============

/**
 * Store a static API token (from --token flag)
 */
export async function loginWithToken(token: string): Promise<void> {
  await setGlobalConfig({
    token,
    // Clear device-flow fields when using static token
    refreshToken: undefined,
    tokenExpiresAt: undefined,
    clerkOrgId: undefined,
    email: undefined,
    orgName: undefined,
  });
  verbose('Static API token stored in config file');
}

/**
 * Store credentials from a device code flow
 */
export async function loginWithDeviceCode(tokenResponse: TokenResponse): Promise<void> {
  await setGlobalConfig({
    token: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    tokenExpiresAt: tokenResponse.expiresAt,
    clerkOrgId: tokenResponse.clerkOrgId,
    email: tokenResponse.email,
    orgName: tokenResponse.orgName,
  });
  verbose('Device code credentials stored in config file');
}

/**
 * Remove all auth data from global config
 */
export async function logout(): Promise<void> {
  await setGlobalConfig({
    token: undefined,
    refreshToken: undefined,
    tokenExpiresAt: undefined,
    clerkOrgId: undefined,
    email: undefined,
    orgName: undefined,
  });
  verbose('All auth data removed from config file');
}

// ============= Helpers =============

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

/**
 * Require authentication for a command -- throws if not authenticated
 */
export async function requireAuth(): Promise<string> {
  return requireToken();
}

/**
 * Get token for API requests (returns function as expected by quillFetch pattern)
 */
export function getTokenFn(): () => Promise<string> {
  return async () => {
    const token = await getToken();
    return token || '';
  };
}

/**
 * Mask token for display (show first 4 and last 4 characters)
 */
function maskToken(token: string): string {
  if (token.length <= 8) {
    return '****';
  }
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

/**
 * Validate token format (basic check)
 */
export function isValidTokenFormat(token: string): boolean {
  return token.length >= 10 && token.length <= 500;
}

/**
 * Sleep for ms milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
