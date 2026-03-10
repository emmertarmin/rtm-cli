/**
 * Tasks Command - Task management for RTM
 *
 * Handles listing, adding, completing, and modifying tasks.
 */

import { RTMClient } from "../rtm";
import type {
  RTMTaskSeries,
  RTMTask,
  RTMTaskList,
  RTMList,
  RTMNote,
  OutputFormat,
  TaskFilterOptions,
} from "../types";

/**
 * Flattened task representation for display
 */
interface TaskDisplay {
  seriesId: string;
  taskId: string;
  listId: string;
  name: string;
  due?: string;
  completed?: string;
  priority: "1" | "2" | "3" | "N";
  tags: string[];
  postponed: number;
  estimate?: string;
}

/**
 * Command options for the tasks command
 */
export interface TasksOptions extends TaskFilterOptions {
  format?: OutputFormat;
}

/**
 * Parse tasks from the nested API response into flat display format
 */
function parseTasks(response: {
  rsp: { tasks?: { list?: RTMTaskList[] | RTMTaskList } };
}): TaskDisplay[] {
  const tasks: TaskDisplay[] = [];

  const listData = response.rsp.tasks?.list;
  if (!listData) return tasks;

  const lists = Array.isArray(listData) ? listData : [listData];

  for (const list of lists) {
    if (!list.taskseries) continue;
    const seriesArray = Array.isArray(list.taskseries) ? list.taskseries : [list.taskseries];

    for (const series of seriesArray) {
      if (!series.task) continue;
      const taskArray = Array.isArray(series.task) ? series.task : [series.task];

      // Parse tags - API returns { tag: [...] } or string or array
      let tags: string[] = [];
      if (series.tags) {
        if (Array.isArray(series.tags)) {
          tags = series.tags;
        } else if (typeof series.tags === "string") {
          tags = [series.tags];
        } else if (typeof series.tags === "object" && "tag" in series.tags) {
          const tagData = (series.tags as { tag: string[] | string }).tag;
          tags = Array.isArray(tagData) ? tagData : [tagData];
        }
      }

      for (const task of taskArray) {
        tasks.push({
          seriesId: series.id,
          taskId: task.id,
          listId: list.id,
          name: series.name,
          due: task.due,
          completed: task.completed,
          priority: (task.priority as "1" | "2" | "3" | "N") || "N",
          tags,
          postponed: parseInt(task.postponed || "0", 10),
          estimate: task.estimate,
        });
      }
    }
  }

  return tasks;
}

/**
 * Build RTM filter string from options
 */
function buildFilter(options: TasksOptions): string | undefined {
  const filters: string[] = [];

  // Status filter
  if (options.status === "pending" || !options.status) {
    filters.push("status:incomplete");
  } else if (options.status === "completed") {
    filters.push("status:completed");
  }
  // "all" adds no status filter

  // Due date filter
  if (options.due && options.due !== "all") {
    const dueMap: Record<string, string> = {
      today: "due:today",
      tomorrow: "due:tomorrow",
      week: "due:this week",
      overdue: "dueBefore:today",
      none: "due:never",
    };
    const due = options.due;
    if (due && dueMap[due]) {
      filters.push(dueMap[due]);
    }
  }

  // Priority filter
  if (options.priority && options.priority !== "any") {
    filters.push(`priority:${options.priority}`);
  }

  // Tag filters
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      filters.push(`tag:"${tag}"`);
    }
  }

  // Raw filter overrides everything
  if (options.filter) {
    return options.filter;
  }

  return filters.length > 0 ? filters.join(" AND ") : undefined;
}

/**
 * Sort tasks by the specified field
 */
function sortTasks(tasks: TaskDisplay[], sortBy: string): TaskDisplay[] {
  const sorted = [...tasks];

  switch (sortBy) {
    case "due":
      sorted.sort((a, b) => {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      });
      break;
    case "priority":
      const priorityOrder = { "1": 0, "2": 1, "3": 2, N: 3 };
      sorted.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
      break;
    case "added":
      // We don't have added date in flattened structure, skip
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }

  return sorted;
}

/**
 * List tasks with filtering and sorting
 */
export async function listTasks(
  client: RTMClient,
  options: TasksOptions = {},
): Promise<TaskDisplay[]> {
  const filter = buildFilter(options);
  const response = await client.getTasks({
    listId: options.listId,
    filter,
  });

  let tasks = parseTasks(response);
  tasks = sortTasks(tasks, options.sort || "due");

  if (options.limit) {
    tasks = tasks.slice(0, options.limit);
  }

  return tasks;
}

/**
 * Format priority for display
 */
function formatPriority(p: string): string {
  const map: Record<string, string> = { "1": "!1", "2": "!2", "3": "!3", N: " " };
  return map[p] || p;
}

/**
 * Format due date for display
 */
function formatDue(due?: string): string {
  if (!due) return "No due date";
  const date = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === today.getTime()) return "Today";
  if (dateOnly.getTime() === tomorrow.getTime()) return "Tomorrow";

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format tasks as markdown
 */
export function formatTasksAsMarkdown(tasks: TaskDisplay[]): string {
  if (tasks.length === 0) {
    return "**Tasks:**\n\nNo tasks found.";
  }

  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  let markdown = `**Tasks (${pending.length} pending${
    completed.length > 0 ? `, ${completed.length} completed` : ""
  }):**\n\n`;

  for (const task of tasks) {
    const checkbox = task.completed ? "[x]" : "[ ]";
    const priority = formatPriority(task.priority);
    const due = formatDue(task.due);
    const tags = task.tags.length > 0 ? ` #${task.tags.join(" #")}` : "";
    const postponed = task.postponed > 0 ? ` ↻${task.postponed}` : "";

    markdown += `- ${checkbox} ${task.seriesId} ${task.name} | ${due}${
      priority.trim() ? ` | ${priority}` : ""
    }${tags}${postponed}\n`;
  }

  return markdown;
}

/**
 * Find task by ID (partial match on seriesId)
 */
async function findTask(client: RTMClient, seriesId: string): Promise<TaskDisplay | null> {
  // Fetch all tasks and find by partial ID match
  const allTasks = await listTasks(client, { status: "all", limit: 1000 });
  return allTasks.find((t) => t.seriesId === seriesId || t.seriesId.endsWith(seriesId)) || null;
}

/**
 * Add a new task
 */
export async function addTask(
  client: RTMClient,
  name: string,
  options: {
    listId?: string;
    due?: string;
    priority?: "1" | "2" | "3" | "N";
    tags?: string;
    estimate?: string;
    parse?: boolean;
  },
): Promise<TaskDisplay> {
  const timeline = await client.createTimeline();

  // Build task name with smart add syntax if not using parse mode
  let taskName = name;
  let shouldParse = options.parse;

  if (!options.parse) {
    // If user provided flags, build smart add string and enable parsing
    if (options.due || options.priority || options.tags || options.estimate) {
      if (options.due) taskName += ` ^${options.due}`;
      if (options.priority) taskName += ` !${options.priority}`;
      if (options.tags) taskName += ` #${options.tags.replace(/,/g, " #")}`;
      if (options.estimate) taskName += ` =${options.estimate}`;
      shouldParse = true;
    }
  }

  const result = await client.addTask(options.listId || "", taskName, {
    parse: shouldParse,
    timeline,
  });

  // Parse the task to return display format
  const taskArray = Array.isArray(result.task) ? result.task : [result.task];

  // Parse tags - API returns { tag: [...] } or string or array
  let tagsArray: string[] = [];
  if (result.tags) {
    if (Array.isArray(result.tags)) {
      tagsArray = result.tags;
    } else if (typeof result.tags === "string") {
      tagsArray = [result.tags];
    } else if (typeof result.tags === "object" && "tag" in result.tags) {
      const tagData = (result.tags as { tag: string[] | string }).tag;
      tagsArray = Array.isArray(tagData) ? tagData : [tagData];
    }
  }

  return {
    seriesId: result.id,
    taskId: taskArray[0]?.id || "",
    listId: options.listId || "",
    name: result.name,
    due: taskArray[0]?.due,
    completed: taskArray[0]?.completed,
    priority: (taskArray[0]?.priority as "1" | "2" | "3" | "N") || "N",
    tags: tagsArray,
    postponed: 0,
    estimate: taskArray[0]?.estimate,
  };
}

/**
 * Complete one or more tasks
 */
export async function completeTasks(
  client: RTMClient,
  ids: string[],
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.completeTask(task.listId, task.seriesId, task.taskId, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Uncomplete one or more tasks
 */
export async function uncompleteTasks(
  client: RTMClient,
  ids: string[],
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.uncompleteTask(task.listId, task.seriesId, task.taskId, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Delete one or more tasks
 */
export async function deleteTasks(
  client: RTMClient,
  ids: string[],
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.deleteTask(task.listId, task.seriesId, task.taskId, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Postpone (snooze) one or more tasks
 */
export async function postponeTasks(
  client: RTMClient,
  ids: string[],
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.postponeTask(task.listId, task.seriesId, task.taskId, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Move tasks to a different list
 */
export async function moveTasks(
  client: RTMClient,
  ids: string[],
  toListId: string,
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.moveTask(task.listId, toListId, task.seriesId, task.taskId, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Set priority on tasks
 */
export async function setPriority(
  client: RTMClient,
  ids: string[],
  priority: "1" | "2" | "3" | "N",
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.setPriority(task.listId, task.seriesId, task.taskId, priority, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Set due date on tasks
 */
export async function setDueDate(
  client: RTMClient,
  ids: string[],
  due: string,
  hasTime: boolean,
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.setDueDate(task.listId, task.seriesId, task.taskId, due, hasTime, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Add tags to tasks
 */
export async function addTags(
  client: RTMClient,
  ids: string[],
  tags: string,
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.addTags(task.listId, task.seriesId, task.taskId, tags, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Remove tags from tasks
 */
export async function removeTags(
  client: RTMClient,
  ids: string[],
  tags: string,
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const timeline = await client.createTimeline();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const task = await findTask(client, id);
      if (!task) {
        failed.push({ id, error: "Task not found" });
        continue;
      }
      await client.removeTags(task.listId, task.seriesId, task.taskId, tags, timeline);
      succeeded.push(task.seriesId);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { succeeded, failed };
}

/**
 * Add note to a task
 */
export async function addNote(
  client: RTMClient,
  id: string,
  title: string,
  text: string,
): Promise<boolean> {
  const timeline = await client.createTimeline();
  const task = await findTask(client, id);
  if (!task) return false;

  await client.addNote(task.listId, task.seriesId, task.taskId, title, text, timeline);
  return true;
}

/**
 * List notes for a task (extracts from task data)
 */
export async function listNotes(
  client: RTMClient,
  taskId: string,
): Promise<{ notes: RTMNote[] | null; taskName?: string }> {
  const task = await findTask(client, taskId);
  if (!task) {
    return { notes: null };
  }

  // Fetch full task data with notes
  const response = await client.getTasks({
    listId: task.listId,
  });

  // Parse to find the task and extract notes
  const listData = response.rsp.tasks?.list;
  if (!listData) return { notes: [], taskName: task.name };

  const lists = Array.isArray(listData) ? listData : [listData];

  for (const list of lists) {
    if (!list.taskseries) continue;
    const seriesArray = Array.isArray(list.taskseries) ? list.taskseries : [list.taskseries];

    for (const series of seriesArray) {
      if (series.id === task.seriesId && series.notes) {
        const notesWrapper = series.notes as unknown as { note: RTMNote[] | RTMNote };
        const notesData = notesWrapper.note;
        if (!notesData) return { notes: [], taskName: task.name };
        const notesArray = Array.isArray(notesData) ? notesData : [notesData];
        // Filter out null entries
        const validNotes = notesArray.filter((n): n is RTMNote => n != null);
        return { notes: validNotes, taskName: task.name };
      }
    }
  }

  return { notes: [], taskName: task.name };
}

/**
 * Delete a note
 */
export async function deleteNote(client: RTMClient, noteId: string): Promise<boolean> {
  const timeline = await client.createTimeline();
  await client.deleteNote(noteId, timeline);
  return true;
}

/**
 * Edit a note
 */
export async function editNote(
  client: RTMClient,
  noteId: string,
  title: string,
  text: string,
): Promise<boolean> {
  const timeline = await client.createTimeline();
  await client.editNote(noteId, title, text, timeline);
  return true;
}

/**
 * Format notes as markdown
 */
export function formatNotesAsMarkdown(notes: RTMNote[], taskName?: string): string {
  // Filter out null notes
  const validNotes = notes.filter((n): n is RTMNote => n != null);

  if (validNotes.length === 0) {
    return taskName
      ? `**Notes for "${taskName}":**\n\nNo notes found.`
      : "**Notes:**\n\nNo notes found.";
  }

  let markdown = taskName ? `**Notes for "${taskName}":**\n\n` : "**Notes:**\n\n";

  for (const note of validNotes) {
    const created = new Date(note.created).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    // Content is in $t, and title might be empty (RTM puts title in content)
    const content = note.$t || "";
    const lines = content.split("\n");
    const title = note.title || (lines.length > 0 ? lines[0] : "Untitled");
    const body = lines.length > 1 ? lines.slice(1).join("\n") : "";

    markdown += `- **${note.id}** | ${title} (${created})\n`;
    if (body) {
      const displayContent = body.length > 200 ? body.slice(0, 200) + "..." : body;
      markdown += `  > ${displayContent.replace(/\n/g, "\n  > ")}\n`;
    }
    markdown += "\n";
  }

  return markdown;
}

function showTasksHelp(): void {
  console.log(`Usage: rtm tasks [subcommand] [args] [flags]

Subcommands:
  (none)              List tasks (default: pending only)
  add <name>          Add new task
  done <id...>        Complete task(s)
  undo <id...>        Uncomplete task(s)
  delete <id...>      Delete task(s)
  post <id...>        Postpone task(s) (+1 day)
  move <list-id> <task-id...>  Move tasks to list
  priority <1|2|3|N> <id...>   Set priority on tasks
  due <date> <id...>  Set due date (ISO or "today", "tomorrow")
  tag <tag> <id...>   Add tag to tasks
  untag <tag> <id...> Remove tag from tasks
  notes <id>          List notes for a task
  note add <id> <title> <text>   Add note to task
  note delete <note-id>          Delete a note
  note edit <note-id> <title> <text>  Edit a note

Listing Flags:
  --list <id>         Filter by list ID
  --status <s>        pending, completed, all (default: pending)
  --due <filter>      today, tomorrow, week, overdue, none, all
  --priority <p>        1 (high), 2, 3, N (none), any
  --tag <tag>         Filter by tag (can repeat)
  --filter <string>   Raw RTM filter string
  --sort <field>      due, priority, name (default: due)
  --limit <n>         Max results
  --json              Output as JSON

Add Flags:
  --list <id>         Target list (defaults to Inbox)
  --due <date>        Due date
  --priority <p>      Priority
  --tags <t1,t2>      Comma-separated tags
  --estimate <time>   Time estimate
  --parse             Enable smart add parsing

Examples:
  rtm tasks
  rtm tasks --due today
  rtm tasks add "Buy milk" --due tomorrow --priority 2 --tags shopping
  rtm tasks add "Meeting ^tomorrow !1 #work"
  rtm tasks done 602989903
  rtm tasks post 602989903
  rtm tasks move 43438794 602989903
  rtm tasks priority 1 602989903 602989904
  rtm tasks notes 602989903
  rtm tasks note add 602989903 "Price check" "Found at MediaMarkt for 129€"
  rtm tasks note delete 123456789
`);
}

/**
 * Parse listing flags from argv (original args including flags with values)
 */
function parseListFlags(argv: string[]): TasksOptions {
  const options: TasksOptions = {};

  // Scan through argv to find flag-value pairs
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    switch (arg) {
      case "--list":
        if (nextArg) options.listId = nextArg;
        break;
      case "--status":
        if (nextArg && ["pending", "completed", "all"].includes(nextArg)) {
          options.status = nextArg as TasksOptions["status"];
        }
        break;
      case "--due":
        if (nextArg && ["today", "tomorrow", "week", "overdue", "none", "all"].includes(nextArg)) {
          options.due = nextArg as TasksOptions["due"];
        }
        break;
      case "--priority":
        if (nextArg && ["1", "2", "3", "N", "any"].includes(nextArg)) {
          options.priority = nextArg as TasksOptions["priority"];
        }
        break;
      case "--tag":
        if (nextArg) {
          options.tags = options.tags || [];
          options.tags.push(nextArg);
        }
        break;
      case "--filter":
        if (nextArg) options.filter = nextArg;
        break;
      case "--sort":
        if (nextArg && ["due", "priority", "name", "added"].includes(nextArg)) {
          options.sort = nextArg as TasksOptions["sort"];
        }
        break;
      case "--limit":
        if (nextArg) options.limit = parseInt(nextArg, 10);
        break;
      case "--json":
        options.format = "json";
        break;
    }
  }

  return options;
}

/**
 * Execute the tasks command
 */
export async function execute(
  client: RTMClient,
  args: string[],
  flags: Set<string>,
  argv: string[] = [],
): Promise<void> {
  const subcommand = args[0];

  // Show help only for explicit help flags
  if (subcommand === "--help" || subcommand === "-h") {
    showTasksHelp();
    return;
  }

  // Handle listing (no subcommand, flags-only, or unknown subcommand)
  const isActionSubcommand =
    subcommand &&
    [
      "add",
      "done",
      "undo",
      "delete",
      "post",
      "move",
      "priority",
      "due",
      "tag",
      "untag",
      "notes",
      "note",
    ].includes(subcommand);

  if (!isActionSubcommand) {
    // Treat subcommand as filter args if it starts with --
    const hasFlagSubcommand = subcommand && subcommand.startsWith("--");
    const filterArgs = hasFlagSubcommand ? args : args.slice(1);
    const listFlags = hasFlagSubcommand
      ? flags
      : new Set(subcommand ? [...flags, subcommand] : [...flags]);
    const options = parseListFlags(argv);

    const tasks = await listTasks(client, options);

    if (options.format === "json") {
      console.log(JSON.stringify(tasks, null, 2));
    } else {
      console.log(formatTasksAsMarkdown(tasks));
    }
    return;
  }

  switch (subcommand) {
    case "add": {
      const name = args[1];
      if (!name) {
        console.error("Error: Task name required");
        console.error("Usage: rtm tasks add <name> [flags]");
        process.exit(1);
      }

      const addOptions: Parameters<typeof addTask>[2] = {
        listId: undefined,
        due: undefined,
        priority: undefined,
        tags: undefined,
        estimate: undefined,
        parse: flags.has("--parse"),
      };

      // Parse flags
      const listIdx = args.indexOf("--list");
      if (listIdx !== -1) {
        const list = args[listIdx + 1];
        if (list) addOptions.listId = list;
      }

      const dueIdx = args.indexOf("--due");
      if (dueIdx !== -1) {
        const due = args[dueIdx + 1];
        if (due) addOptions.due = due;
      }

      const prioIdx = args.indexOf("--priority");
      if (prioIdx !== -1) {
        const p = args[prioIdx + 1];
        if (p && ["1", "2", "3", "N"].includes(p)) {
          addOptions.priority = p as "1" | "2" | "3" | "N";
        }
      }

      const tagsIdx = args.indexOf("--tags");
      if (tagsIdx !== -1) {
        const tags = args[tagsIdx + 1];
        if (tags) addOptions.tags = tags;
      }

      const estIdx = args.indexOf("--estimate");
      if (estIdx !== -1) {
        const est = args[estIdx + 1];
        if (est) addOptions.estimate = est;
      }

      // If no list specified, get inbox
      if (!addOptions.listId) {
        const lists = await client.getLists();
        const listData = lists.rsp.lists?.list;
        const listArray = Array.isArray(listData) ? listData : listData ? [listData] : [];
        const inbox = listArray.find((l: RTMList) => l.name === "Inbox");
        if (inbox) {
          addOptions.listId = inbox.id;
        } else {
          console.error("Error: No --list specified and could not find Inbox");
          process.exit(1);
        }
      }

      const task = await addTask(client, name, addOptions);

      if (flags.has("--json")) {
        console.log(JSON.stringify(task, null, 2));
      } else {
        console.log(`Added task: ${task.seriesId} ${task.name}`);
      }
      break;
    }

    case "done": {
      const ids = args.slice(1);
      if (ids.length === 0) {
        console.error("Error: Task ID(s) required");
        console.error("Usage: rtm tasks done <id> [id...]");
        process.exit(1);
      }

      const result = await completeTasks(client, ids);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Completed ${result.succeeded.length} task(s)`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "undo": {
      const ids = args.slice(1);
      if (ids.length === 0) {
        console.error("Error: Task ID(s) required");
        console.error("Usage: rtm tasks undo <id> [id...]");
        process.exit(1);
      }

      const result = await uncompleteTasks(client, ids);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Uncompleted ${result.succeeded.length} task(s)`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "delete": {
      const ids = args.slice(1);
      if (ids.length === 0) {
        console.error("Error: Task ID(s) required");
        console.error("Usage: rtm tasks delete <id> [id...]");
        process.exit(1);
      }

      const result = await deleteTasks(client, ids);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Deleted ${result.succeeded.length} task(s)`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "post": {
      const ids = args.slice(1);
      if (ids.length === 0) {
        console.error("Error: Task ID(s) required");
        console.error("Usage: rtm tasks post <id> [id...]");
        process.exit(1);
      }

      const result = await postponeTasks(client, ids);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Postponed ${result.succeeded.length} task(s)`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "move": {
      const toListId = args[1];
      const ids = args.slice(2);
      if (!toListId || ids.length === 0) {
        console.error("Error: Target list ID and task ID(s) required");
        console.error("Usage: rtm tasks move <list-id> <task-id> [task-id...]");
        process.exit(1);
      }

      const result = await moveTasks(client, ids, toListId);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Moved ${result.succeeded.length} task(s) to list ${toListId}`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "priority": {
      const priority = args[1] as "1" | "2" | "3" | "N";
      const ids = args.slice(2);
      if (!["1", "2", "3", "N"].includes(priority) || ids.length === 0) {
        console.error("Error: Priority (1, 2, 3, N) and task ID(s) required");
        console.error("Usage: rtm tasks priority <1|2|3|N> <id> [id...]");
        process.exit(1);
      }

      const result = await setPriority(client, ids, priority);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Set priority ${priority} on ${result.succeeded.length} task(s)`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "due": {
      const due = args[1];
      const ids = args.slice(2);
      if (!due || ids.length === 0) {
        console.error("Error: Due date and task ID(s) required");
        console.error("Usage: rtm tasks due <date> <id> [id...]");
        process.exit(1);
      }

      // Handle relative dates
      let dueDate: string;
      if (due === "today") {
        dueDate = new Date().toISOString().split("T")[0]!;
      } else if (due === "tomorrow") {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        dueDate = t.toISOString().split("T")[0]!;
      } else {
        dueDate = due!;
      }

      const hasTime = flags.has("--time");
      const result = await setDueDate(client, ids, dueDate, hasTime);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Set due date ${dueDate} on ${result.succeeded.length} task(s)`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "tag": {
      const tag = args[1];
      const ids = args.slice(2);
      if (!tag || ids.length === 0) {
        console.error("Error: Tag and task ID(s) required");
        console.error("Usage: rtm tasks tag <tag> <id> [id...]");
        process.exit(1);
      }

      const result = await addTags(client, ids, tag);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Added tag "${tag}" to ${result.succeeded.length} task(s)`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "untag": {
      const tag = args[1];
      const ids = args.slice(2);
      if (!tag || ids.length === 0) {
        console.error("Error: Tag and task ID(s) required");
        console.error("Usage: rtm tasks untag <tag> <id> [id...]");
        process.exit(1);
      }

      const result = await removeTags(client, ids, tag);

      if (flags.has("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Removed tag "${tag}" from ${result.succeeded.length} task(s)`);
        if (result.failed.length > 0) {
          for (const f of result.failed) {
            console.error(`  Failed ${f.id}: ${f.error}`);
          }
        }
      }
      break;
    }

    case "notes": {
      const id = args[1];
      if (!id) {
        console.error("Error: Task ID required");
        console.error("Usage: rtm tasks notes <id>");
        process.exit(1);
      }

      const result = await listNotes(client, id);

      if (result.notes === null) {
        console.error(`Task ${id} not found`);
        process.exit(1);
      }

      if (flags.has("--json")) {
        console.log(JSON.stringify({ task: result.taskName, notes: result.notes }, null, 2));
      } else {
        console.log(formatNotesAsMarkdown(result.notes, result.taskName));
      }
      break;
    }

    case "note": {
      const noteSubcommand = args[1];

      if (!noteSubcommand || noteSubcommand === "--help" || noteSubcommand === "-h") {
        console.log(`Usage: rtm tasks note <subcommand> [args]

Subcommands:
  add <task-id> <title> <text>  Add note to a task
  delete <note-id>              Delete a note
  edit <note-id> <title> <text> Edit a note
`);
        break;
      }

      if (noteSubcommand === "add") {
        const id = args[2];
        const title = args[3];
        const text = args[4];
        if (!id || !title || !text) {
          console.error("Error: Task ID, note title, and note text required");
          console.error("Usage: rtm tasks note add <id> <title> <text>");
          process.exit(1);
        }

        const success = await addNote(client, id, title, text);

        if (flags.has("--json")) {
          console.log(JSON.stringify({ success }));
        } else {
          if (success) {
            console.log(`Added note "${title}" to task ${id}`);
          } else {
            console.error(`Failed to add note to task ${id}`);
          }
        }
      } else if (noteSubcommand === "delete") {
        const noteId = args[2];
        if (!noteId) {
          console.error("Error: Note ID required");
          console.error("Usage: rtm tasks note delete <note-id>");
          process.exit(1);
        }

        const success = await deleteNote(client, noteId);

        if (flags.has("--json")) {
          console.log(JSON.stringify({ success, noteId }));
        } else {
          if (success) {
            console.log(`Deleted note ${noteId}`);
          } else {
            console.error(`Failed to delete note ${noteId}`);
          }
        }
      } else if (noteSubcommand === "edit") {
        const noteId = args[2];
        const title = args[3];
        const text = args[4];
        if (!noteId || !title || !text) {
          console.error("Error: Note ID, title, and text required");
          console.error("Usage: rtm tasks note edit <note-id> <title> <text>");
          process.exit(1);
        }

        const success = await editNote(client, noteId, title, text);

        if (flags.has("--json")) {
          console.log(JSON.stringify({ success, noteId }));
        } else {
          if (success) {
            console.log(`Edited note ${noteId}`);
          } else {
            console.error(`Failed to edit note ${noteId}`);
          }
        }
      } else {
        console.error(`Unknown note subcommand: ${noteSubcommand}`);
        console.error("Usage: rtm tasks note {add|delete|edit}");
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      showTasksHelp();
      process.exit(1);
  }
}
