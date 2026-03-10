/**
 * CLI Types and Registry
 */

import { RTMClient } from "./rtm";

export interface FlagDef {
  name: string;
  aliases?: string[];
  description: string;
  example?: string;
}

export interface SubcommandDef {
  name: string;
  args?: string;
  description: string;
  flags?: FlagDef[];
}

export interface CommandDef {
  name: string;
  aliases?: string[];
  description: string;
  example: string;
  flags: FlagDef[];
  subcommands?: SubcommandDef[];
  handler: (client: RTMClient, flags: Set<string>, args: string[]) => Promise<void>;
}

export const GLOBAL_FLAGS: FlagDef[] = [
  {
    name: "--help",
    aliases: ["-h"],
    description: "Show help message",
  },
];

export function formatFlagHelp(flag: FlagDef): string {
  const aliases = flag.aliases?.length ? ` (${flag.aliases.join(", ")})` : "";
  return `  ${flag.name}${aliases}\n    ${flag.description}`;
}

export function formatCommandHelp(cmd: CommandDef): string {
  const lines: string[] = [];
  const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(", ")})` : "";

  lines.push(`  ${cmd.name}${aliases}`);
  lines.push(`    ${cmd.description}`);

  // Global command flags (shared across subcommands)
  if (cmd.flags.length > 0) {
    const globalFlags = cmd.flags.filter(f => !f.name.startsWith("[subcommand]"));
    if (globalFlags.length > 0) {
      lines.push("");
      for (const flag of globalFlags) {
        lines.push(formatFlagHelp(flag));
      }
    }
  }

  // Subcommands with their specific flags
  if (cmd.subcommands && cmd.subcommands.length > 0) {
    lines.push("");
    lines.push("  Subcommands:");
    for (const sub of cmd.subcommands) {
      const args = sub.args ? ` ${sub.args}` : "";
      lines.push(`    ${sub.name}${args}`);
      lines.push(`      ${sub.description}`);
      if (sub.flags && sub.flags.length > 0) {
        for (const flag of sub.flags) {
          const aliases = flag.aliases?.length ? ` (${flag.aliases.join(", ")})` : "";
          lines.push(`        ${flag.name}${aliases}`);
          lines.push(`          ${flag.description}`);
        }
      }
    }
  }

  lines.push("");
  lines.push(`    Example: ${cmd.example}`);

  return lines.join("\n");
}

export function showHelp(commands: CommandDef[]): void {
  const lines: string[] = ["Usage: rtm <command> [options]\n", "Commands:"];

  for (const cmd of commands) {
    lines.push(formatCommandHelp(cmd));
    lines.push("");
  }

  lines.push("Global Flags:");
  for (const flag of GLOBAL_FLAGS) {
    lines.push(formatFlagHelp(flag));
  }

  console.log(lines.join("\n"));
}

export function showCommandHelp(command: string, commands: CommandDef[]): void {
  const cmd = commands.find((c) => c.name === command || c.aliases?.includes(command));

  if (!cmd) {
    console.error(`Unknown command: ${command}`);
    showHelp(commands);
    process.exit(1);
  }

  console.log(`Command: ${cmd.name}\n`);
  console.log(`Description: ${cmd.description}\n`);
  console.log(`Usage: ${cmd.example}\n`);

  // Global flags (flags not specific to any subcommand)
  if (cmd.flags.length > 0) {
    console.log("Global flags:");
    for (const flag of cmd.flags) {
      console.log(formatFlagHelp(flag));
    }
    console.log("");
  }

  if (cmd.subcommands && cmd.subcommands.length > 0) {
    console.log("Subcommands:");
    for (const sub of cmd.subcommands) {
      const args = sub.args ? ` ${sub.args}` : "";
      console.log(`  ${sub.name}${args}`);
      console.log(`    ${sub.description}`);
      if (sub.flags && sub.flags.length > 0) {
        for (const flag of sub.flags) {
          const aliases = flag.aliases?.length ? ` (${flag.aliases.join(", ")})` : "";
          console.log(`    ${flag.name}${aliases}`);
          console.log(`      ${flag.description}`);
        }
      }
      console.log("");
    }
  }
}
