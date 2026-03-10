/**
 * Tags Command
 *
 * Handles tag management for RTM via subcommands.
 */

import { RTMClient } from "../rtm";
import type { RTMTaskList, RTMTaskSeries, OutputFormat } from "../types";

/**
 * Command options for the tags command
 */
export interface TagsOptions {
  format?: OutputFormat;
}

/**
 * Tag information extracted from tasks
 */
interface TagInfo {
  name: string;
  count: number;
}

/**
 * Get all tags by extracting from tasks
 * RTM doesn't have a dedicated tags API, so we derive from tasks
 */
export async function getAllTags(client: RTMClient): Promise<TagInfo[]> {
  // Get all tasks across all lists
  const response = await client.getTasks({});

  const tagCounts = new Map<string, number>();

  const listData = response.rsp.tasks?.list;
  if (!listData) {
    return [];
  }

  const lists = Array.isArray(listData) ? listData : [listData];

  for (const list of lists) {
    if (!list.taskseries) continue;
    const seriesArray = Array.isArray(list.taskseries) ? list.taskseries : [list.taskseries];

    for (const series of seriesArray) {
      // Extract tags from task series
      const tags = parseTags(series);
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }

  // Convert to array and sort by name
  const tags: TagInfo[] = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return tags;
}

/**
 * Parse tags from a task series (handles various API response formats)
 */
function parseTags(series: RTMTaskSeries): string[] {
  if (!series.tags) return [];

  if (Array.isArray(series.tags)) {
    return series.tags;
  } else if (typeof series.tags === "string") {
    return [series.tags];
  } else if (typeof series.tags === "object" && "tag" in series.tags) {
    const tagData = (series.tags as { tag: string[] | string }).tag;
    return Array.isArray(tagData) ? tagData : [tagData];
  }

  return [];
}

/**
 * Format tags as markdown bulleted list
 */
export function formatTagsAsMarkdown(tags: TagInfo[]): string {
  if (tags.length === 0) {
    return "**Tags:**\n\nNo tags found.";
  }

  let markdown = "**Tags:**\n\n";

  for (const tag of tags) {
    markdown += `- ${tag.name} (${tag.count} task${tag.count === 1 ? "" : "s"})\n`;
  }

  return markdown;
}

/**
 * Rename a tag across all tasks
 * This requires finding all tasks with the tag and renaming it
 */
export async function renameTag(
  client: RTMClient,
  oldName: string,
  newName: string,
): Promise<{ succeeded: number; failed: string[] }> {
  const timeline = await client.createTimeline();

  // Get all tasks
  const response = await client.getTasks({});
  const listData = response.rsp.tasks?.list;

  if (!listData) {
    return { succeeded: 0, failed: [] };
  }

  const lists = Array.isArray(listData) ? listData : [listData];
  let succeeded = 0;
  const failed: string[] = [];

  for (const list of lists) {
    if (!list.taskseries) continue;
    const seriesArray = Array.isArray(list.taskseries) ? list.taskseries : [list.taskseries];

    for (const series of seriesArray) {
      const tags = parseTags(series);

      if (tags.includes(oldName)) {
        try {
          // Get task IDs - need the first task in the series
          const taskArray = Array.isArray(series.task) ? series.task : [series.task];
          const taskId = taskArray[0]?.id;

          if (!taskId) continue;

          // Remove old tag
          await client.removeTags(list.id, series.id, taskId, oldName, timeline);
          
          // Only add new tag if task doesn't already have it (prevents duplicates when joining)
          if (!tags.includes(newName)) {
            await client.addTags(list.id, series.id, taskId, newName, timeline);
          }
          succeeded++;
        } catch (err) {
          failed.push(series.id);
        }
      }
    }
  }

  return { succeeded, failed };
}

/**
 * Delete a tag by removing it from all tasks
 */
export async function deleteTag(
  client: RTMClient,
  tagName: string,
): Promise<{ succeeded: number; failed: string[] }> {
  const timeline = await client.createTimeline();

  // Get all tasks
  const response = await client.getTasks({});
  const listData = response.rsp.tasks?.list;

  if (!listData) {
    return { succeeded: 0, failed: [] };
  }

  const lists = Array.isArray(listData) ? listData : [listData];
  let succeeded = 0;
  const failed: string[] = [];

  for (const list of lists) {
    if (!list.taskseries) continue;
    const seriesArray = Array.isArray(list.taskseries) ? list.taskseries : [list.taskseries];

    for (const series of seriesArray) {
      const tags = parseTags(series);

      if (tags.includes(tagName)) {
        try {
          // Get task IDs
          const taskArray = Array.isArray(series.task) ? series.task : [series.task];
          const taskId = taskArray[0]?.id;

          if (!taskId) continue;

          await client.removeTags(list.id, series.id, taskId, tagName, timeline);
          succeeded++;
        } catch (err) {
          failed.push(series.id);
        }
      }
    }
  }

  return { succeeded, failed };
}

function showTagsHelp(): void {
  console.log(`Usage: rtm tags <subcommand> [args] [flags]

Subcommands:
  (none)              List all tags with task counts
  rename <old> <new>  Rename a tag across all tasks
  delete <name>       Remove a tag from all tasks

Flags:
  --json              Output as JSON
  --help, -h          Show this help message

Examples:
  rtm tags
  rtm tags rename work work-tasks
  rtm tags delete shopping
`);
}

/**
 * Execute the tags command with subcommands
 */
export async function execute(
  client: RTMClient,
  args: string[],
  options: TagsOptions = {},
): Promise<void> {
  const subcommand = args[0];

  // Show help if requested
  if (subcommand === "--help" || subcommand === "-h") {
    showTagsHelp();
    return;
  }

  // Default: list all tags
  if (!subcommand) {
    const tags = await getAllTags(client);

    if (options.format === "json") {
      console.log(JSON.stringify(tags, null, 2));
    } else {
      console.log(formatTagsAsMarkdown(tags));
    }
    return;
  }

  switch (subcommand) {
    case "rename": {
      const oldName = args[1];
      const newName = args[2];
      if (!oldName || !newName) {
        console.error("Error: Old tag name and new tag name required");
        console.error("Usage: rtm tags rename <old-name> <new-name>");
        process.exit(1);
      }

      const result = await renameTag(client, oldName, newName);

      if (options.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Renamed tag "${oldName}" to "${newName}" on ${result.succeeded} task(s)`);
        if (result.failed.length > 0) {
          console.error(`  Failed on ${result.failed.length} task(s)`);
        }
      }
      break;
    }

    case "delete": {
      const tagName = args[1];
      if (!tagName) {
        console.error("Error: Tag name required");
        console.error("Usage: rtm tags delete <name>");
        process.exit(1);
      }

      const result = await deleteTag(client, tagName);

      if (options.format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Removed tag "${tagName}" from ${result.succeeded} task(s)`);
        if (result.failed.length > 0) {
          console.error(`  Failed on ${result.failed.length} task(s)`);
        }
      }
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      showTagsHelp();
      process.exit(1);
  }
}
