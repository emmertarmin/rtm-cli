/**
 * RTM API Response Types
 *
 * Based on the Remember The Milk API documentation:
 * https://www.rememberthemilk.com/services/api/
 */

/**
 * RTM List object as returned by rtm.lists.getList
 */
export interface RTMList {
  id: string;
  name: string;
  deleted: "0" | "1";
  archived: "0" | "1";
  locked: "0" | "1";
  smart: "0" | "1";
  position?: string;
  sort_order?: string;
  filter?: string;
}

/**
 * RTM API Error response
 */
export interface RTMError {
  code: string;
  msg: string;
}

/**
 * RTM TaskSeries - task definition container
 */
export interface RTMTaskSeries {
  id: string;
  name: string;
  list_id: string;
  tags?: string[] | string;
  notes?: RTMNote[] | RTMNote;
  url?: string;
  task: RTMTask[] | RTMTask;
}

/**
 * RTM Task - individual task instance
 */
export interface RTMTask {
  id: string;
  due?: string;
  has_due_time?: "0" | "1";
  completed?: string;
  deleted?: "0" | "1";
  added?: string;
  priority?: "1" | "2" | "3" | "N";
  postponed?: string;
  estimate?: string;
}

/**
 * RTM Note attached to tasks
 */
export interface RTMNote {
  id: string;
  created: string;
  modified: string;
  title: string;
  $t: string; // Content
}

/**
 * RTM Task List wrapper (matches API structure)
 */
export interface RTMTaskList {
  id: string;
  taskseries?: RTMTaskSeries[] | RTMTaskSeries;
}

/**
 * RTM tasks.getList response
 */
export interface RTMTasksResponse extends RTMBaseResponse {
  rsp: {
    stat: "ok" | "fail";
    tasks?: {
      list?: RTMTaskList[] | RTMTaskList;
    };
    err?: RTMError;
  };
}

/**
 * Filter options for listing tasks
 */
export interface TaskFilterOptions {
  listId?: string;
  status?: "pending" | "completed" | "all";
  due?: "today" | "tomorrow" | "week" | "overdue" | "none" | "all";
  priority?: "1" | "2" | "3" | "N" | "any";
  tags?: string[];
  filter?: string; // Raw RTM filter string
  limit?: number;
  sort?: "due" | "priority" | "added" | "name";
}

/**
 * RTM User (for auth token check)
 */
export interface RTMUser {
  id: string;
  username: string;
  fullname: string;
}

/**
 * Base RTM API Response wrapper
 */
export interface RTMBaseResponse {
  rsp: {
    stat: "ok" | "fail";
    err?: RTMError;
    [key: string]: unknown;
  };
}

/**
 * RTM lists.getList response
 */
export interface RTMListsResponse extends RTMBaseResponse {
  rsp: {
    stat: "ok" | "fail";
    lists?: {
      list: RTMList[] | RTMList;
    };
    err?: RTMError;
  };
}

/**
 * RTM auth.checkToken response
 */
export interface RTMAuthCheckResponse extends RTMBaseResponse {
  rsp: {
    stat: "ok" | "fail";
    auth?: {
      token: string;
      perms: "read" | "write" | "delete";
      user: RTMUser;
    };
    err?: RTMError;
  };
}

/**
 * Output format options
 */
export type OutputFormat = "json" | "markdown";

/**
 * Filter options for listing tasks
 */
export interface TaskFilterOptions {
  listId?: string;
  status?: "pending" | "completed" | "all";
  due?: "today" | "tomorrow" | "week" | "overdue" | "none" | "all";
  priority?: "1" | "2" | "3" | "N" | "any";
  tags?: string[];
  filter?: string; // Raw RTM filter string
  limit?: number;
  sort?: "due" | "priority" | "added" | "name";
}
