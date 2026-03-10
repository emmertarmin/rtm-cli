/**
 * Remember The Milk (RTM) API Client Scaffold
 *
 * Provides low-level API communication capabilities.
 * Handles authentication, signature generation, and raw API calls to the RTM REST API.
 *
 * Based on the RTM API documentation: https://www.rememberthemilk.com/services/api/
 */

import { createHash } from "crypto";
import type {
  RTMBaseResponse,
  RTMListsResponse,
  RTMAuthCheckResponse,
  RTMList,
  RTMTasksResponse,
  RTMTaskSeries,
} from "./types";

import { loadConfig, getAuthFilePath } from "./config";

export class RTMClient {
  private readonly baseUrl = "https://api.rememberthemilk.com/services/rest/";
  private apiKey: string;
  private secret: string;
  private token: string;

  constructor() {
    const config = loadConfig();

    this.apiKey = config?.apiKey || "";
    this.secret = config?.sharedSecret || "";
    this.token = config?.authToken || "";

    if (!this.apiKey || !this.secret) {
      throw new Error(
        `Missing API credentials. Run 'rtm auth init' to configure.\n` +
          `Config file: ${getAuthFilePath()}`,
      );
    }

    if (!this.token) {
      throw new Error(
        `Not authenticated. Run 'rtm auth login' to authenticate.\n` +
          `Config file: ${getAuthFilePath()}`,
      );
    }
  }

  /**
   * Generate API signature for RTM authentication.
   * The signature is an MD5 hash of: secret + sorted_params
   * where params are concatenated as key1value1key2value2 (alphabetically sorted by key)
   */
  private sign(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.map((key) => `${key}${params[key]}`).join("");
    const sigString = `${this.secret}${paramString}`;
    return createHash("md5").update(sigString).digest("hex");
  }

  /**
   * Make a raw API call to the RTM REST endpoint.
   * Returns the parsed response (caller is responsible for type casting).
   */
  async call(method: string, params: Record<string, string> = {}): Promise<RTMBaseResponse> {
    const callParams: Record<string, string> = {
      api_key: this.apiKey,
      format: "json",
      method,
      ...params,
    };

    if (this.token) {
      callParams.auth_token = this.token;
    }

    const signature = this.sign(callParams);
    callParams.api_sig = signature;

    const url = new URL(this.baseUrl);
    Object.entries(callParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as RTMBaseResponse;

    if (data.rsp.stat === "fail" && data.rsp.err) {
      throw new Error(`RTM API Error ${data.rsp.err.code}: ${data.rsp.err.msg}`);
    }

    return data;
  }

  /**
   * Get all lists from the RTM account.
   * Endpoint: rtm.lists.getList
   */
  async getLists(): Promise<RTMListsResponse> {
    const response = await this.call("rtm.lists.getList");
    return response as RTMListsResponse;
  }

  /**
   * Add a new list.
   * Endpoint: rtm.lists.add
   */
  async addList(name: string): Promise<RTMList> {
    const response = await this.call("rtm.lists.add", { name, timeline: "0" });
    return response.rsp.list as RTMList;
  }

  /**
   * Rename a list.
   * Endpoint: rtm.lists.setName
   */
  async renameList(listId: string, newName: string): Promise<RTMList> {
    const response = await this.call("rtm.lists.setName", {
      list_id: listId,
      name: newName,
      timeline: "0",
    });
    return response.rsp.list as RTMList;
  }

  /**
   * Delete a list.
   * Endpoint: rtm.lists.delete
   */
  async deleteList(listId: string): Promise<void> {
    await this.call("rtm.lists.delete", { list_id: listId, timeline: "0" });
  }

  /**
   * Archive a list.
   * Endpoint: rtm.lists.archive
   */
  async archiveList(listId: string): Promise<void> {
    await this.call("rtm.lists.archive", { list_id: listId, timeline: "0" });
  }

  /**
   * Unarchive a list.
   * Endpoint: rtm.lists.unarchive
   */
  async unarchiveList(listId: string): Promise<void> {
    await this.call("rtm.lists.unarchive", { list_id: listId, timeline: "0" });
  }

  /**
   * Get tasks with optional filtering.
   * Endpoint: rtm.tasks.getList
   */
  async getTasks(
    options: {
      listId?: string;
      filter?: string;
    } = {},
  ): Promise<RTMTasksResponse> {
    const params: Record<string, string> = {};
    if (options.listId) {
      params.list_id = options.listId;
    }
    if (options.filter) {
      params.filter = options.filter;
    }
    const response = await this.call("rtm.tasks.getList", params);
    return response as RTMTasksResponse;
  }

  /**
   * Create a timeline for write operations.
   * Endpoint: rtm.timelines.create
   */
  async createTimeline(): Promise<string> {
    const response = await this.call("rtm.timelines.create");
    return (response as unknown as { rsp: { timeline: string } }).rsp.timeline;
  }

  /**
   * Add a new task.
   * Endpoint: rtm.tasks.add
   */
  async addTask(
    listId: string,
    name: string,
    options: {
      parse?: boolean;
      timeline: string;
    } = { timeline: "0" },
  ): Promise<RTMTaskSeries> {
    const params: Record<string, string> = {
      list_id: listId,
      name,
      timeline: options.timeline,
    };
    if (options.parse) {
      params.parse = "1";
    }
    const response = await this.call("rtm.tasks.add", params);
    const result = (
      response as unknown as { rsp: { list: { taskseries: RTMTaskSeries | RTMTaskSeries[] } } }
    ).rsp.list.taskseries;
    const firstResult = Array.isArray(result) ? result[0] : result;
    if (!firstResult) {
      throw new Error("No task returned from addTask");
    }
    return firstResult;
  }

  /**
   * Complete a task.
   * Endpoint: rtm.tasks.complete
   */
  async completeTask(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.complete", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      timeline,
    });
  }

  /**
   * Uncomplete a task.
   * Endpoint: rtm.tasks.uncomplete
   */
  async uncompleteTask(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.uncomplete", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      timeline,
    });
  }

  /**
   * Delete a task.
   * Endpoint: rtm.tasks.delete
   */
  async deleteTask(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.delete", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      timeline,
    });
  }

  /**
   * Set task priority.
   * Endpoint: rtm.tasks.setPriority
   */
  async setPriority(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    priority: "1" | "2" | "3" | "N",
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.setPriority", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      priority,
      timeline,
    });
  }

  /**
   * Set due date.
   * Endpoint: rtm.tasks.setDueDate
   */
  async setDueDate(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    due: string,
    hasDueTime: boolean,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.setDueDate", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      due,
      has_due_time: hasDueTime ? "1" : "0",
      timeline,
    });
  }

  /**
   * Add tags to task.
   * Endpoint: rtm.tasks.addTags
   */
  async addTags(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    tags: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.addTags", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      tags,
      timeline,
    });
  }

  /**
   * Remove tags from task.
   * Endpoint: rtm.tasks.removeTags
   */
  async removeTags(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    tags: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.removeTags", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      tags,
      timeline,
    });
  }

  /**
   * Postpone a task (+1 day).
   * Endpoint: rtm.tasks.postpone
   */
  async postponeTask(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.postpone", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      timeline,
    });
  }

  /**
   * Move task to different list.
   * Endpoint: rtm.tasks.moveTo
   */
  async moveTask(
    fromListId: string,
    toListId: string,
    taskSeriesId: string,
    taskId: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.moveTo", {
      from_list_id: fromListId,
      to_list_id: toListId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      timeline,
    });
  }

  /**
   * Add note to task.
   * Endpoint: rtm.tasks.notes.add
   */
  async addNote(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    title: string,
    text: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.notes.add", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      note_title: title,
      note_text: text,
      timeline,
    });
  }

  /**
   * Delete a note from a task.
   * Endpoint: rtm.tasks.notes.delete
   */
  async deleteNote(noteId: string, timeline: string): Promise<void> {
    await this.call("rtm.tasks.notes.delete", {
      note_id: noteId,
      timeline,
    });
  }

  /**
   * Edit an existing note.
   * Endpoint: rtm.tasks.notes.edit
   */
  async editNote(noteId: string, title: string, text: string, timeline: string): Promise<void> {
    await this.call("rtm.tasks.notes.edit", {
      note_id: noteId,
      note_title: title,
      note_text: text,
      timeline,
    });
  }

  /**
   * Set URL on a task.
   * Endpoint: rtm.tasks.setURL
   */
  async setURL(
    listId: string,
    taskSeriesId: string,
    taskId: string,
    url: string,
    timeline: string,
  ): Promise<void> {
    await this.call("rtm.tasks.setURL", {
      list_id: listId,
      taskseries_id: taskSeriesId,
      task_id: taskId,
      url,
      timeline,
    });
  }
}

// Re-export types for convenience
export * from "./types";
