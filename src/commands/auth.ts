/**
 * Authentication commands for RTM CLI
 *
 * Subcommands:
 *   init      - Configure API credentials
 *   login     - Start authentication flow
 *   complete  - Exchange frob for auth token
 *   status    - Verify stored token is valid
 *   show      - Display current configuration
 *   logout    - Remove auth token
 */

import { RTMClient } from "../rtm";
import {
  loadConfig,
  saveConfig,
  updateConfig,
  removeToken,
  purgeConfig,
  storeFrob,
  getFrob,
  hasValidFrob,
  checkConfig,
  getAuthFilePath,
  getConfigDir,
} from "../config";
import { createHash } from "crypto";
import { open } from "fs/promises";

const AUTH_URL = "https://www.rememberthemilk.com/services/auth/";

interface AuthFlags {
  json: boolean;
  force: boolean;
  showSecrets: boolean;
  purge: boolean;
  noOpen: boolean;
  perms: string;
  key?: string;
  secret?: string;
}

function parseAuthFlags(): AuthFlags {
  const argv = Bun.argv.slice(3); // Skip bun, index.ts, auth
  const result: AuthFlags = {
    json: false,
    force: false,
    showSecrets: false,
    purge: false,
    noOpen: false,
    perms: "delete",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--json":
        result.json = true;
        break;
      case "--force":
        result.force = true;
        break;
      case "--show-secrets":
        result.showSecrets = true;
        break;
      case "--purge":
        result.purge = true;
        break;
      case "--no-open":
        result.noOpen = true;
        break;
      case "--key":
        result.key = argv[++i];
        break;
      case "--secret":
        result.secret = argv[++i];
        break;
      case "--perms":
        result.perms = argv[++i] || "delete";
        break;
    }
  }

  return result;
}

/**
 * Initialize config with API credentials
 */
async function initCmd(flags: AuthFlags): Promise<void> {
  const status = checkConfig();

  if (status.exists && !flags.force) {
    console.error("Config already exists. Use --force to overwrite.");
    console.error(`Location: ${status.path}`);
    process.exit(1);
  }

  let apiKey = flags.key;
  let sharedSecret = flags.secret;

  // Interactive prompt if not provided via flags
  if (!apiKey) {
    process.stdout.write("Enter RTM API Key: ");
    apiKey = await readLine();
  }

  if (!sharedSecret) {
    process.stdout.write("Enter RTM Shared Secret: ");
    sharedSecret = await readLine();
  }

  if (!apiKey || !sharedSecret) {
    console.error("Error: Both API key and shared secret are required.");
    process.exit(1);
  }

  saveConfig({ apiKey: apiKey.trim(), sharedSecret: sharedSecret.trim() });

  const newStatus = checkConfig();
  console.log("Configuration saved.");
  console.log(`Location: ${newStatus.path}`);
  console.log(
    `Permissions: ${newStatus.secure ? "secure (0600)" : "WARNING: insecure permissions"}`,
  );
}

/**
 * Start authentication flow - get frob and show auth URL
 */
async function loginCmd(flags: AuthFlags): Promise<void> {
  const config = loadConfig();

  if (!config) {
    console.error("Error: No configuration found. Run 'auth init' first.");
    console.error(`Expected config at: ${getAuthFilePath()}`);
    process.exit(1);
  }

  // Get frob from RTM
  const frob = await getFrobFromRTM(config.apiKey, config.sharedSecret);

  // Store frob for later
  storeFrob(frob);

  // Build auth URL
  const perms = ["read", "write", "delete"].includes(flags.perms) ? flags.perms : "delete";
  const authUrl = buildAuthUrl(config.apiKey, config.sharedSecret, frob, perms);

  console.log("\nAuthentication required.");
  console.log("Visit this URL in your browser and authorize the app:");
  console.log(`\n  ${authUrl}\n`);

  if (!flags.noOpen) {
    // Try to open browser automatically
    try {
      const { exec } = await import("child_process");
      const platform = process.platform;
      const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
      exec(`${cmd} "${authUrl}"`);
      console.log("(Attempted to open browser automatically)");
    } catch {
      // Ignore errors from auto-open
    }
  }

  console.log("After authorizing, run:");
  console.log("  rtm auth complete");
}

/**
 * Exchange frob for permanent auth token
 */
async function completeCmd(_flags: AuthFlags): Promise<void> {
  const config = loadConfig();

  if (!config) {
    console.error("Error: No configuration found. Run 'auth init' first.");
    process.exit(1);
  }

  if (!hasValidFrob()) {
    console.error("Error: No valid frob found. Run 'auth login' first.");
    console.error("Note: The frob expires after 5 minutes.");
    process.exit(1);
  }

  const frob = getFrob();
  if (!frob) {
    console.error("Error: Could not retrieve frob.");
    process.exit(1);
  }

  try {
    const token = await exchangeFrobForToken(config.apiKey, config.sharedSecret, frob);
    updateConfig({ authToken: token });

    // Verify the token works
    const checkResult = await checkToken(config.apiKey, config.sharedSecret, token);

    console.log("\nAuthentication successful!");
    console.log(`User: ${checkResult.user.fullname} (@${checkResult.user.username})`);
    console.log(`Permissions: ${checkResult.perms}`);
    console.log("\nYou can now use the CLI with your stored credentials.");
  } catch (error) {
    console.error("Error: Failed to complete authentication.");
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

/**
 * Check if stored token is valid
 */
async function statusCmd(flags: AuthFlags): Promise<void> {
  const config = loadConfig();

  if (!config) {
    console.error("Status: Not configured");
    console.error(`Config file: ${getAuthFilePath()} (not found)`);
    process.exit(1);
  }

  const hasToken = !!config.authToken;
  const hasCreds = !!config.apiKey && !!config.sharedSecret;

  if (flags.json) {
    const status: Record<string, unknown> = {
      configured: hasCreds,
      hasToken,
      configPath: getAuthFilePath(),
    };

    if (hasToken) {
      try {
        const checkResult = await checkToken(config.apiKey, config.sharedSecret, config.authToken!);
        status.valid = true;
        status.user = checkResult.user;
        status.permissions = checkResult.perms;
      } catch {
        status.valid = false;
      }
    }

    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log("Authentication Status");
  console.log("=====================");
  console.log(`Config: ${getAuthFilePath()}`);
  console.log(`API credentials: ${hasCreds ? "✓ configured" : "✗ missing"}`);
  console.log(`Auth token: ${hasToken ? "✓ present" : "✗ not authenticated"}`);

  if (hasToken) {
    try {
      const checkResult = await checkToken(config.apiKey, config.sharedSecret, config.authToken!);
      console.log(`Token status: ✓ valid`);
      console.log(`User: ${checkResult.user.fullname} (@${checkResult.user.username})`);
      console.log(`Permissions: ${checkResult.perms}`);
    } catch (error) {
      console.log(`Token status: ✗ invalid`);
      if (error instanceof Error) {
        console.log(`Error: ${error.message}`);
      }
    }
  }
}

/**
 * Show current configuration (masked by default)
 */
async function showCmd(flags: AuthFlags): Promise<void> {
  const config = loadConfig();

  if (!config) {
    console.error("Error: No configuration found.");
    console.error(`Expected config at: ${getAuthFilePath()}`);
    process.exit(1);
  }

  const mask = (s: string): string => {
    if (flags.showSecrets) return s;
    if (s.length <= 8) return "****";
    return s.slice(0, 4) + "..." + s.slice(-4);
  };

  console.log("Current Configuration");
  console.log("=====================");
  console.log(`Config directory: ${getConfigDir()}`);
  console.log(`Auth file: ${getAuthFilePath()}`);
  console.log(`API Key: ${mask(config.apiKey)}`);
  console.log(`Shared Secret: ${mask(config.sharedSecret)}`);
  console.log(`Auth Token: ${config.authToken ? mask(config.authToken) : "(not set)"}`);

  if (flags.showSecrets) {
    console.log("\n⚠️  WARNING: Secrets are displayed in plaintext!");
  }
}

/**
 * Logout - remove auth token
 */
async function logoutCmd(flags: AuthFlags): Promise<void> {
  if (flags.purge) {
    purgeConfig();
    console.log("Configuration purged.");
    console.log(`Removed: ${getAuthFilePath()}`);
  } else {
    removeToken();
    console.log("Logged out. Auth token removed.");
    console.log("API credentials are still stored.");
    console.log("Use 'auth logout --purge' to remove everything.");
  }
}

/**
 * Main auth command handler
 */
export async function execute(
  _client: RTMClient,
  args: string[],
  _flags: Set<string>,
): Promise<void> {
  const subcommand = args[0];
  const authFlags = parseAuthFlags();

  switch (subcommand) {
    case "init":
      await initCmd(authFlags);
      break;
    case "login":
      await loginCmd(authFlags);
      break;
    case "complete":
      await completeCmd(authFlags);
      break;
    case "status":
      await statusCmd(authFlags);
      break;
    case "show":
      await showCmd(authFlags);
      break;
    case "logout":
      await logoutCmd(authFlags);
      break;
    default:
      console.error(`Unknown auth subcommand: ${subcommand || "(none)"}`);
      console.error("\nAvailable subcommands:");
      console.error("  init      - Configure API credentials");
      console.error("  login     - Start authentication flow");
      console.error("  complete  - Exchange frob for auth token");
      console.error("  status    - Verify stored token is valid");
      console.error("  show      - Display current configuration");
      console.error("  logout    - Remove auth token");
      process.exit(1);
  }
}

// Helper functions for RTM API calls

async function getFrobFromRTM(apiKey: string, secret: string): Promise<string> {
  const params: Record<string, string> = {
    api_key: apiKey,
    format: "json",
    method: "rtm.auth.getFrob",
  };

  const sig = sign(params, secret);
  const url = new URL("https://api.rememberthemilk.com/services/rest/");
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  url.searchParams.append("api_sig", sig);

  const response = await fetch(url.toString());
  const data = (await response.json()) as {
    rsp: { stat: string; frob?: string; err?: { code: string; msg: string } };
  };

  if (data.rsp.stat !== "ok" || !data.rsp.frob) {
    throw new Error(data.rsp.err?.msg || "Failed to get frob");
  }

  return data.rsp.frob;
}

function buildAuthUrl(apiKey: string, secret: string, frob: string, perms: string): string {
  const params: Record<string, string> = {
    api_key: apiKey,
    frob,
    perms,
  };

  const sig = sign(params, secret);
  const url = new URL(AUTH_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  url.searchParams.append("api_sig", sig);

  return url.toString();
}

async function exchangeFrobForToken(apiKey: string, secret: string, frob: string): Promise<string> {
  const params: Record<string, string> = {
    api_key: apiKey,
    format: "json",
    frob,
    method: "rtm.auth.getToken",
  };

  const sig = sign(params, secret);
  const url = new URL("https://api.rememberthemilk.com/services/rest/");
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  url.searchParams.append("api_sig", sig);

  const response = await fetch(url.toString());
  const data = (await response.json()) as {
    rsp: {
      stat: string;
      auth?: { token: string };
      err?: { code: string; msg: string };
    };
  };

  if (data.rsp.stat !== "ok" || !data.rsp.auth?.token) {
    throw new Error(data.rsp.err?.msg || "Failed to exchange frob for token");
  }

  return data.rsp.auth.token;
}

async function checkToken(
  apiKey: string,
  secret: string,
  token: string,
): Promise<{ perms: string; user: { id: string; username: string; fullname: string } }> {
  const params: Record<string, string> = {
    api_key: apiKey,
    auth_token: token,
    format: "json",
    method: "rtm.auth.checkToken",
  };

  const sig = sign(params, secret);
  const url = new URL("https://api.rememberthemilk.com/services/rest/");
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  url.searchParams.append("api_sig", sig);

  const response = await fetch(url.toString());
  const data = (await response.json()) as {
    rsp: {
      stat: string;
      auth?: { perms: string; user: { id: string; username: string; fullname: string } };
      err?: { code: string; msg: string };
    };
  };

  if (data.rsp.stat !== "ok" || !data.rsp.auth) {
    throw new Error(data.rsp.err?.msg || "Token validation failed");
  }

  return data.rsp.auth;
}

function sign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((key) => `${key}${params[key]}`).join("");
  const sigString = `${secret}${paramString}`;
  return createHash("md5").update(sigString).digest("hex");
}

async function readLine(): Promise<string> {
  const stdin = await open("/dev/stdin", "r");
  try {
    const buffer = Buffer.alloc(1024);
    const bytesRead = await stdin.read(buffer, 0, 1024, null);
    if (bytesRead) {
      return buffer.toString("utf-8", 0, bytesRead.bytesRead).trim();
    }
    return "";
  } finally {
    await stdin.close();
  }
}
