/**
 * Lists Command
 *
 * Handles CRUD operations for RTM lists via subcommands.
 */

import { RTMClient } from "../rtm";
import type { RTMList, OutputFormat } from "../types";

/**
 * Command options for the lists command
 */
export interface ListsOptions {
  format?: OutputFormat;
  all?: boolean;
}

/**
 * List all RTM lists with optional filtering.
 * By default, filters out deleted and archived lists unless all=true.
 */
export async function listAll(client: RTMClient, options: ListsOptions = {}): Promise<RTMList[]> {
  const response = await client.getLists();

  if (!response.rsp.lists) {
    return [];
  }

  // Handle both single list and array of lists
  let lists: RTMList[];
  const listData = response.rsp.lists.list;
  if (Array.isArray(listData)) {
    lists = listData;
  } else {
    lists = listData ? [listData] : [];
  }

  if (options.all) {
    return lists;
  }

  // Filter out deleted and archived lists
  return lists.filter((list) => list.deleted !== "1" && list.archived !== "1");
}

/**
 * Format lists as markdown bulleted list with status indicators.
 * Format: "- {id} {name} ({status1}) ({status2})..."
 * Status indicators only shown when active: (Locked), (Deleted), (Archived), (Smart)
 */
export function formatListsAsMarkdown(lists: RTMList[]): string {
  if (lists.length === 0) {
    return "**Lists:**\n\nNo lists found.";
  }

  let markdown = "**Lists:**\n\n";

  for (const list of lists) {
    const indicators: string[] = [];

    if (list.locked === "1") indicators.push("Locked");
    if (list.deleted === "1") indicators.push("Deleted");
    if (list.archived === "1") indicators.push("Archived");
    if (list.smart === "1") indicators.push("Smart");

    const indicatorStr = indicators.length > 0 ? ` (${indicators.join(", ")})` : "";

    markdown += `- ${list.id} ${list.name}${indicatorStr}\n`;
  }

  return markdown;
}

/**
 * Add a new list
 */
export async function addList(client: RTMClient, name: string): Promise<RTMList> {
  const response = await client.addList(name);
  return response;
}

/**
 * Rename a list
 */
export async function renameList(
  client: RTMClient,
  listId: string,
  newName: string,
): Promise<void> {
  await client.renameList(listId, newName);
}

/**
 * Delete a list
 */
export async function deleteList(client: RTMClient, listId: string): Promise<void> {
  await client.deleteList(listId);
}

/**
 * Archive a list
 */
export async function archiveList(client: RTMClient, listId: string): Promise<void> {
  await client.archiveList(listId);
}

/**
 * Unarchive a list
 */
export async function unarchiveList(client: RTMClient, listId: string): Promise<void> {
  await client.unarchiveList(listId);
}

function showListsHelp(): void {
  console.log(`Usage: rtm lists <subcommand> [args] [flags]

Subcommands:
  (none)              List all lists
  add <name>          Create a new list
  rename <id> <name>  Rename a list
  delete <id>         Delete a list
  archive <id>        Archive a list
  unarchive <id>      Unarchive a list

Flags:
  --json              Output as JSON
  --all               Include deleted/archived lists
  --help, -h          Show this help message

Examples:
  rtm lists
  rtm lists add "Shopping"
  rtm lists rename 12345 "New Name"
  rtm lists delete 12345
`);
}

/**
 * Execute the lists command with subcommands
 */
export async function execute(
  client: RTMClient,
  args: string[],
  options: ListsOptions = {},
): Promise<void> {
  const subcommand = args[0];

  // Show help if requested
  if (!subcommand) {
    // Default: list all lists
    const lists = await listAll(client, options);

    if (options.format === "json") {
      console.log(JSON.stringify(lists, null, 2));
    } else {
      console.log(formatListsAsMarkdown(lists));
    }
    return;
  }

  switch (subcommand) {
    case "--help":
    case "-h":
      showListsHelp();
      break;

    case "add": {
      const name = args[1];
      if (!name) {
        console.error("Error: List name required");
        console.error("Usage: rtm lists add <name>");
        process.exit(1);
      }
      const list = await addList(client, name);
      if (options.format === "json") {
        console.log(JSON.stringify(list, null, 2));
      } else {
        console.log(`Created list: ${list.id} ${list.name}`);
      }
      break;
    }

    case "rename": {
      const listId = args[1];
      const newName = args[2];
      if (!listId || !newName) {
        console.error("Error: List ID and new name required");
        console.error("Usage: rtm lists rename <id> <name>");
        process.exit(1);
      }
      await renameList(client, listId, newName);
      if (options.format === "json") {
        console.log(JSON.stringify({ success: true, id: listId, name: newName }));
      } else {
        console.log(`Renamed list ${listId} to "${newName}"`);
      }
      break;
    }

    case "delete": {
      const listId = args[1];
      if (!listId) {
        console.error("Error: List ID required");
        console.error("Usage: rtm lists delete <id>");
        process.exit(1);
      }
      await deleteList(client, listId);
      if (options.format === "json") {
        console.log(JSON.stringify({ success: true, id: listId, action: "deleted" }));
      } else {
        console.log(`Deleted list ${listId}`);
      }
      break;
    }

    case "archive": {
      const listId = args[1];
      if (!listId) {
        console.error("Error: List ID required");
        console.error("Usage: rtm lists archive <id>");
        process.exit(1);
      }
      await archiveList(client, listId);
      if (options.format === "json") {
        console.log(JSON.stringify({ success: true, id: listId, action: "archived" }));
      } else {
        console.log(`Archived list ${listId}`);
      }
      break;
    }

    case "unarchive": {
      const listId = args[1];
      if (!listId) {
        console.error("Error: List ID required");
        console.error("Usage: rtm lists unarchive <id>");
        process.exit(1);
      }
      await unarchiveList(client, listId);
      if (options.format === "json") {
        console.log(JSON.stringify({ success: true, id: listId, action: "unarchived" }));
      } else {
        console.log(`Unarchived list ${listId}`);
      }
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      showListsHelp();
      process.exit(1);
  }
}
