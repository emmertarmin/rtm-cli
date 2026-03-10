#!/usr/bin/env bun
/**
 * RTM CLI - Remember The Milk Command Line Interface
 */

import { VERSION } from "./src/version";
import { RTMClient } from "./src/rtm";
import * as listsCommand from "./src/commands/lists";
import * as tasksCommand from "./src/commands/tasks";
import * as tagsCommand from "./src/commands/tags";
import type { CommandDef, SubcommandDef } from "./src/cli";
import { showHelp, showCommandHelp } from "./src/cli";

import { execute as authExecute } from "./src/commands/auth";

// Command registry - just data, no logic
const COMMANDS: CommandDef[] = [
  {
    name: "auth",
    description:
      "Manage RTM authentication and API credentials",
    example: "rtm auth <subcommand> [options]",
    flags: [],
    subcommands: [
      {
        name: "init",
        args: "[--key <k>] [--secret <s>] [--force]",
        description: "Configure API credentials interactively or via flags",
        flags: [
          { name: "--key <k>", description: "API key (optional, will prompt if not provided)" },
          { name: "--secret <s>", description: "Shared secret (optional, will prompt if not provided)" },
          { name: "--force", description: "Overwrite existing config" },
        ],
      },
      {
        name: "login",
        args: "[--perms <level>] [--no-open]",
        description: "Start authentication flow, prints URL to visit",
        flags: [
          { name: "--perms <level>", description: "Permission level: read|write|delete (default: delete)" },
          { name: "--no-open", description: "Don't auto-open browser" },
        ],
      },
      {
        name: "complete",
        description: "Exchange frob for permanent auth token after browser approval",
      },
      {
        name: "status",
        args: "[--json]",
        description: "Verify stored token is valid",
        flags: [
          { name: "--json", description: "Output as JSON" },
        ],
      },
      {
        name: "show",
        args: "[--show-secrets]",
        description: "Display current configuration (secrets masked by default)",
        flags: [
          { name: "--show-secrets", description: "Show unmasked secrets (use with caution)" },
        ],
      },
      {
        name: "logout",
        args: "[--purge]",
        description: "Remove auth token (or entire config with --purge)",
        flags: [
          { name: "--purge", description: "Delete entire config including API credentials" },
        ],
      },
    ],
    handler: async (_client, flags, args) => {
      await authExecute({} as RTMClient, args, flags);
    },
  },
  {
    name: "lists",
    description: "Manage RTM lists",
    example: "rtm lists [subcommand] [args]",
    flags: [
      { name: "--help, -h", description: "Show detailed help for lists subcommands" },
    ],
    subcommands: [
      {
        name: "(none)",
        description: "List all lists (default)",
        flags: [
          { name: "--json", description: "Output as JSON instead of markdown" },
          { name: "--all", description: "Include all items (deleted, archived)" },
        ],
      },
      {
        name: "add",
        args: "<name>",
        description: "Create a new list",
        flags: [
          { name: "--json", description: "Output as JSON instead of markdown" },
        ],
      },
      {
        name: "rename",
        args: "<id> <name>",
        description: "Rename a list",
        flags: [
          { name: "--json", description: "Output as JSON instead of markdown" },
        ],
      },
      {
        name: "delete",
        args: "<id>",
        description: "Delete a list",
      },
      {
        name: "archive",
        args: "<id>",
        description: "Archive a list",
      },
      {
        name: "unarchive",
        args: "<id>",
        description: "Unarchive a list",
      },
    ],
    handler: async (client, flags, args) => {
      await listsCommand.execute(client, args, {
        format: flags.has("--json") ? "json" : "markdown",
        all: flags.has("--all"),
      });
    },
  },
  {
    name: "tasks",
    description: "Manage RTM tasks and notes",
    example: "rtm tasks [subcommand] [args]",
    flags: [
      { name: "--help, -h", description: "Show detailed help for tasks subcommands" },
    ],
    subcommands: [
      {
        name: "(none)",
        description: "List tasks with optional filters (default: pending only)",
        flags: [
          { name: "--json", description: "Output as JSON instead of markdown" },
          { name: "--list <id>", description: "Filter by list ID" },
          { name: "--status <s>", description: "pending, completed, all (default: pending)" },
          { name: "--due <filter>", description: "today, tomorrow, week, overdue, none, all" },
          { name: "--priority <p>", description: "1 (high), 2, 3, N (none), any" },
          { name: "--tag <tag>", description: "Filter by tag (can repeat)" },
          { name: "--filter <string>", description: "Raw RTM filter string" },
          { name: "--sort <field>", description: "due, priority, name (default: due)" },
          { name: "--limit <n>", description: "Max results" },
        ],
      },
      {
        name: "add",
        args: "<name>",
        description: "Add new task",
        flags: [
          { name: "--list <id>", description: "List ID to add task to" },
          { name: "--due <date>", description: "Due date (today, tomorrow, ISO, or smart date)" },
          { name: "--time <time>", description: "Due time (HH:MM)" },
          { name: "--priority <1|2|3|N>", description: "Task priority" },
          { name: "--tags <t1,t2,...>", description: "Comma-separated tags" },
          { name: "--estimate <time>", description: "Time estimate (e.g., '30 min', '1 hour')" },
          { name: "--url <url>", description: "Associate URL with task" },
        ],
      },
      { name: "done", args: "<id...>", description: "Complete task(s) by ID" },
      { name: "undo", args: "<id...>", description: "Uncomplete task(s) by ID" },
      { name: "delete", args: "<id...>", description: "Delete task(s) by ID" },
      { name: "post", args: "<id...>", description: "Postpone task(s) by one day" },
      {
        name: "move",
        args: "<list-id> <task-id...>",
        description: "Move tasks to a different list",
      },
      { name: "priority", args: "<1|2|3|N> <id...>", description: "Set priority on tasks" },
      {
        name: "due",
        args: "<date> <id...>",
        description: "Set due date. Date: ISO, today, tomorrow",
      },
      { name: "tag", args: "<tag> <id...>", description: "Add tag to tasks" },
      { name: "untag", args: "<tag> <id...>", description: "Remove tag from tasks" },
      {
        name: "notes",
        args: "<id>",
        description: "List notes for a task",
        flags: [
          { name: "--json", description: "Output as JSON instead of markdown" },
        ],
      },
      {
        name: "note",
        args: "{add|delete|edit}",
        description:
          "Manage notes: add <id> <title> <text>, delete <note-id>, edit <note-id> <title> <text>",
      },
    ],
    handler: async (client, flags, args) => {
      // Pass original argv for flag parsing, and processed args for subcommands
      await tasksCommand.execute(client, args, flags);
    },
  },
  {
    name: "tags",
    description: "Manage RTM tags",
    example: "rtm tags [subcommand] [args]",
    flags: [
      { name: "--help, -h", description: "Show detailed help for tags subcommands" },
    ],
    subcommands: [
      {
        name: "(none)",
        description: "List all tags with task counts (default)",
        flags: [
          { name: "--json", description: "Output as JSON instead of markdown" },
        ],
      },
      {
        name: "rename",
        args: "<old-name> <new-name>",
        description: "Rename a tag across all tasks",
      },
      {
        name: "delete",
        args: "<name>",
        description: "Remove a tag from all tasks",
      },
    ],
    handler: async (client, flags, args) => {
      await tagsCommand.execute(client, args, {
        format: flags.has("--json") ? "json" : "markdown",
      });
    },
  },
];

// Parse args: process.argv format -> [node, script, command, args..., flags...]
function parseArgs(argv: string[]): {
  command: string | null;
  args: string[];
  flags: Set<string>;
} {
  // Skip first 2 elements: [node/bun executable, script path]
  const allArgs = argv.slice(2);

  if (allArgs.length === 0) {
    return { command: null, args: [], flags: new Set() };
  }

  const command = allArgs[0] ?? null;
  const remaining = allArgs.slice(1);

  // Separate flags from positional args
  const flags = new Set<string>();
  const args: string[] = [];

  for (const arg of remaining) {
    if (arg.startsWith("--") || arg.startsWith("-")) {
      flags.add(arg);
    } else {
      args.push(arg);
    }
  }

  return { command, args, flags };
}

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv);

  // Handle --version as first argument or global flag
  if (command === "--version" || command === "-v" || flags.has("--version") || flags.has("-v")) {
    console.log(VERSION);
    process.exit(0);
  }

  // Handle --help as first argument
  if (command === "--help" || command === "-h") {
    showHelp(COMMANDS);
    process.exit(0);
  }

  // Show help if no command
  if (!command) {
    showHelp(COMMANDS);
    process.exit(1);
  }

  // Handle --help flag on a command
  if (flags.has("--help") || flags.has("-h")) {
    showCommandHelp(command, COMMANDS);
    process.exit(0);
  }

  // Find and execute command
  const cmd = COMMANDS.find((c) => c.name === command || c.aliases?.includes(command));

  if (!cmd) {
    console.error(`Unknown command: ${command}`);
    showHelp(COMMANDS);
    process.exit(1);
  }

  try {
    // Auth commands don't need a valid RTMClient (they handle auth themselves)
    if (command === "auth") {
      await cmd.handler({} as RTMClient, flags, args);
    } else {
      const client = new RTMClient();
      await cmd.handler(client, flags, args);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
