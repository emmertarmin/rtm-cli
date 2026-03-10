/**
 * XDG-compliant configuration management for RTM CLI
 *
 * Config location: ~/.config/rtm/auth.json (or $XDG_CONFIG_HOME/rtm/auth.json)
 * File permissions: 0600 (owner read/write only)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface AuthConfig {
  apiKey: string;
  sharedSecret: string;
  authToken?: string;
  frobs?: {
    current?: string;
    requestedAt?: string;
  };
}

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "rtm")
  : join(homedir(), ".config", "rtm");

const AUTH_FILE = join(CONFIG_DIR, "auth.json");

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the full path to auth.json
 */
export function getAuthFilePath(): string {
  return AUTH_FILE;
}

/**
 * Ensure config directory exists with proper permissions
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load authentication configuration from file
 * Returns null if file doesn't exist or is invalid
 */
export function loadConfig(): AuthConfig | null {
  if (!existsSync(AUTH_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(AUTH_FILE, "utf-8");
    const config = JSON.parse(content) as AuthConfig;

    // Validate required fields
    if (!config.apiKey || !config.sharedSecret) {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Save authentication configuration to file
 * Creates directory if needed, sets file permissions to 0600
 */
export function saveConfig(config: AuthConfig): void {
  ensureConfigDir();

  const content = JSON.stringify(config, null, 2);
  writeFileSync(AUTH_FILE, content, { mode: 0o600 });

  // Ensure permissions are restrictive (owner only)
  try {
    chmodSync(AUTH_FILE, 0o600);
  } catch {
    // Ignore chmod errors on platforms that don't support it
  }
}

/**
 * Check if config file exists and has secure permissions
 */
export function checkConfig(): { exists: boolean; secure: boolean; path: string } {
  if (!existsSync(AUTH_FILE)) {
    return { exists: false, secure: false, path: AUTH_FILE };
  }

  try {
    const stats = statSync(AUTH_FILE);
    // Check if permissions are 0600 or more restrictive (owner only)
    const mode = stats.mode & 0o777;
    const secure = (mode & 0o077) === 0; // No group or other permissions

    return { exists: true, secure, path: AUTH_FILE };
  } catch {
    return { exists: true, secure: false, path: AUTH_FILE };
  }
}

/**
 * Update specific fields in the config (merges with existing)
 */
export function updateConfig(updates: Partial<AuthConfig>): void {
  const existing = loadConfig() || { apiKey: "", sharedSecret: "" };
  const merged = { ...existing, ...updates };
  saveConfig(merged);
}

/**
 * Remove auth token from config (logout)
 */
export function removeToken(): void {
  const config = loadConfig();
  if (config) {
    delete config.authToken;
    delete config.frobs;
    saveConfig(config);
  }
}

/**
 * Delete entire config (purge)
 */
export function purgeConfig(): void {
  if (existsSync(AUTH_FILE)) {
    writeFileSync(AUTH_FILE, "", { mode: 0o600 });
  }
}

/**
 * Store a frob temporarily (during login flow)
 */
export function storeFrob(frob: string): void {
  updateConfig({
    frobs: {
      current: frob,
      requestedAt: new Date().toISOString(),
    },
  });
}

/**
 * Get and clear the stored frob
 */
export function getFrob(): string | null {
  const config = loadConfig();
  const frob = config?.frobs?.current;

  if (frob) {
    // Clear frob after retrieval (one-time use)
    delete config!.frobs;
    if (config) {
      saveConfig(config);
    }
  }

  return frob || null;
}

/**
 * Check if frob exists and is not expired (5 minute timeout)
 */
export function hasValidFrob(): boolean {
  const config = loadConfig();
  if (!config?.frobs?.current || !config?.frobs?.requestedAt) {
    return false;
  }

  const requestedAt = new Date(config.frobs.requestedAt);
  const now = new Date();
  const diffMs = now.getTime() - requestedAt.getTime();

  // Frob is valid for 5 minutes
  return diffMs < 5 * 60 * 1000;
}
