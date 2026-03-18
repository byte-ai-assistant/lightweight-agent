import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import fs from "fs";
import path from "path";

const PROJECTS_FILE = path.resolve("data/projects.json");

interface Task {
  id: number;
  title: string;
  status: "pending" | "in-progress" | "completed" | "blocked";
  priority: "low" | "medium" | "high" | "critical";
  assigned: string;
  notes?: string;
}

interface Part {
  name: string;
  type: string; // e.g. "repo", "marketing", "docs", "knowledge-base", "design"
  location: string; // filesystem path or URL
  notes?: string;
}

interface Project {
  id: string;
  name: string;
  location?: string;
  parts: Part[];
  status: "active" | "complete" | "paused";
  tasks: Task[];
  created: string;
  lastUpdated: string;
  notes?: string;
}

export interface Board {
  projects: Project[];
  archived: Project[];
  lastUpdated: string;
}

function ensureDataDir() {
  const dir = path.dirname(PROJECTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadBoard(): Board {
  ensureDataDir();
  if (!fs.existsSync(PROJECTS_FILE)) {
    return { projects: [], archived: [], lastUpdated: new Date().toISOString() };
  }
  return JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf-8"));
}

function saveBoard(board: Board) {
  ensureDataDir();
  board.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(board, null, 2));
}

function nextTaskId(project: Project): number {
  if (project.tasks.length === 0) return 1;
  return Math.max(...project.tasks.map((t) => t.id)) + 1;
}

// --- Tools ---

export const listProjects = tool(
  "list_projects",
  "List all active projects with summary (name, status, location, task counts).",
  {},
  async () => {
    const board = loadBoard();
    if (board.projects.length === 0) {
      return { content: [{ type: "text" as const, text: "No active projects." }] };
    }

    const lines = board.projects.map((p) => {
      const counts = {
        pending: p.tasks.filter((t) => t.status === "pending").length,
        "in-progress": p.tasks.filter((t) => t.status === "in-progress").length,
        completed: p.tasks.filter((t) => t.status === "completed").length,
        blocked: p.tasks.filter((t) => t.status === "blocked").length,
      };
      const taskSummary = `${counts.pending}p/${counts["in-progress"]}ip/${counts.completed}c/${counts.blocked}b`;
      return `[${p.id}] ${p.name} (${p.status}) ${p.location ? `@ ${p.location} ` : ""}| ${p.tasks.length} tasks: ${taskSummary}`;
    });

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }
);

export const getProject = tool(
  "get_project",
  "Get full project detail with all tasks.",
  { id: z.string().describe("Project ID (slug)") },
  async (args) => {
    const board = loadBoard();
    const project = board.projects.find((p) => p.id === args.id)
      || board.archived.find((p) => p.id === args.id);

    if (!project) {
      return { content: [{ type: "text" as const, text: `Project '${args.id}' not found.` }] };
    }

    const taskList = project.tasks.length === 0
      ? "  (no tasks)"
      : project.tasks
          .map((t) => `  [${t.id}] ${t.title} | ${t.status} | ${t.priority} | ${t.assigned}${t.notes ? ` | ${t.notes}` : ""}`)
          .join("\n");

    const partsList = (project.parts || []).length === 0
      ? "  (none)"
      : (project.parts || [])
          .map((pt) => `  - ${pt.name} (${pt.type}) @ ${pt.location}${pt.notes ? ` | ${pt.notes}` : ""}`)
          .join("\n");

    const text = `Project: ${project.name} (${project.id})
Status: ${project.status}
Location: ${project.location || "(not set)"}
Parts:
${partsList}
Created: ${project.created}
Updated: ${project.lastUpdated}
Notes: ${project.notes || "(none)"}
Tasks (${project.tasks.length}):
${taskList}`;

    return { content: [{ type: "text" as const, text }] };
  }
);

export const createProject = tool(
  "create_project",
  "Create a new project on the board.",
  {
    id: z.string().describe("Unique slug ID (e.g. 'my-project')"),
    name: z.string().describe("Human-readable project name"),
    location: z.string().optional().describe("Directory path for the project"),
    status: z.enum(["active", "complete", "paused"]).optional().describe("Project status (default: active)"),
    notes: z.string().optional().describe("Optional project-level notes"),
  },
  async (args) => {
    const board = loadBoard();

    if (board.projects.some((p) => p.id === args.id) || board.archived.some((p) => p.id === args.id)) {
      return { content: [{ type: "text" as const, text: `Project '${args.id}' already exists.` }] };
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: args.id,
      name: args.name,
      location: args.location,
      parts: [],
      status: args.status || "active",
      tasks: [],
      created: now,
      lastUpdated: now,
      notes: args.notes,
    };

    board.projects.push(project);
    saveBoard(board);

    // Scaffold project directory and CLAUDE.md if location is set
    let extra = "";
    if (args.location) {
      const loc = args.location.replace(/^~/, process.env.HOME || "~");
      try {
        fs.mkdirSync(loc, { recursive: true });
        const claudeMdPath = path.join(loc, "CLAUDE.md");
        if (!fs.existsSync(claudeMdPath)) {
          fs.writeFileSync(claudeMdPath, `# ${args.name}\n\n${args.notes ? args.notes + "\n" : ""}## Tech Stack\n\n## Conventions\n\n## Architecture\n`);
          extra = ` CLAUDE.md created at ${claudeMdPath}.`;
        }
      } catch {
        // Non-fatal: project board entry is still created
      }
    }

    return { content: [{ type: "text" as const, text: `Project '${args.name}' (${args.id}) created.${extra}` }] };
  }
);

export const updateProject = tool(
  "update_project",
  "Update project fields. Set status='archived' to move to archived list.",
  {
    id: z.string().describe("Project ID"),
    name: z.string().optional().describe("New name"),
    location: z.string().optional().describe("New location path"),
    status: z.enum(["active", "complete", "paused", "archived"]).optional().describe("New status"),
    notes: z.string().optional().describe("New notes"),
  },
  async (args) => {
    const board = loadBoard();
    const idx = board.projects.findIndex((p) => p.id === args.id);

    if (idx === -1) {
      return { content: [{ type: "text" as const, text: `Project '${args.id}' not found in active projects.` }] };
    }

    const project = board.projects[idx];
    if (args.name !== undefined) project.name = args.name;
    if (args.location !== undefined) project.location = args.location;
    if (args.notes !== undefined) project.notes = args.notes;
    project.lastUpdated = new Date().toISOString();

    if (args.status === "archived") {
      board.projects.splice(idx, 1);
      project.status = "complete";
      board.archived.push(project);
      saveBoard(board);
      return { content: [{ type: "text" as const, text: `Project '${project.name}' archived.` }] };
    }

    if (args.status !== undefined) project.status = args.status as Project["status"];
    saveBoard(board);

    return { content: [{ type: "text" as const, text: `Project '${project.name}' updated.` }] };
  }
);

export const addTask = tool(
  "add_task",
  "Add a task to a project.",
  {
    projectId: z.string().describe("Project ID"),
    title: z.string().describe("Task description"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Priority (default: medium)"),
    assigned: z.string().optional().describe("Assignee (default: Agent)"),
    notes: z.string().optional().describe("Optional notes"),
  },
  async (args) => {
    const board = loadBoard();
    const project = board.projects.find((p) => p.id === args.projectId);

    if (!project) {
      return { content: [{ type: "text" as const, text: `Project '${args.projectId}' not found.` }] };
    }

    const task: Task = {
      id: nextTaskId(project),
      title: args.title,
      status: "pending",
      priority: args.priority || "medium",
      assigned: args.assigned || "Agent",
      notes: args.notes,
    };

    project.tasks.push(task);
    project.lastUpdated = new Date().toISOString();
    saveBoard(board);

    return { content: [{ type: "text" as const, text: `Task #${task.id} added to '${project.name}': ${task.title}` }] };
  }
);

export const updateTask = tool(
  "update_task",
  "Update a task's fields within a project.",
  {
    projectId: z.string().describe("Project ID"),
    taskId: z.number().describe("Task ID"),
    title: z.string().optional().describe("New title"),
    status: z.enum(["pending", "in-progress", "completed", "blocked"]).optional().describe("New status"),
    priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("New priority"),
    assigned: z.string().optional().describe("New assignee"),
    notes: z.string().optional().describe("New notes"),
  },
  async (args) => {
    const board = loadBoard();
    const project = board.projects.find((p) => p.id === args.projectId);

    if (!project) {
      return { content: [{ type: "text" as const, text: `Project '${args.projectId}' not found.` }] };
    }

    const task = project.tasks.find((t) => t.id === args.taskId);
    if (!task) {
      return { content: [{ type: "text" as const, text: `Task #${args.taskId} not found in '${project.name}'.` }] };
    }

    if (args.title !== undefined) task.title = args.title;
    if (args.status !== undefined) task.status = args.status;
    if (args.priority !== undefined) task.priority = args.priority;
    if (args.assigned !== undefined) task.assigned = args.assigned;
    if (args.notes !== undefined) task.notes = args.notes;
    project.lastUpdated = new Date().toISOString();
    saveBoard(board);

    return { content: [{ type: "text" as const, text: `Task #${task.id} in '${project.name}' updated.` }] };
  }
);

export const deleteTask = tool(
  "delete_task",
  "Remove a task from a project.",
  {
    projectId: z.string().describe("Project ID"),
    taskId: z.number().describe("Task ID to remove"),
  },
  async (args) => {
    const board = loadBoard();
    const project = board.projects.find((p) => p.id === args.projectId);

    if (!project) {
      return { content: [{ type: "text" as const, text: `Project '${args.projectId}' not found.` }] };
    }

    const idx = project.tasks.findIndex((t) => t.id === args.taskId);
    if (idx === -1) {
      return { content: [{ type: "text" as const, text: `Task #${args.taskId} not found in '${project.name}'.` }] };
    }

    const removed = project.tasks.splice(idx, 1)[0];
    project.lastUpdated = new Date().toISOString();
    saveBoard(board);

    return { content: [{ type: "text" as const, text: `Deleted task #${removed.id} ('${removed.title}') from '${project.name}'.` }] };
  }
);

export const addPart = tool(
  "add_part",
  "Add a part (sub-project, repo, knowledge base, etc.) to a project. Scaffolds directory and CLAUDE.md if the location is a filesystem path.",
  {
    projectId: z.string().describe("Project ID"),
    name: z.string().describe("Part name (e.g. 'backend', 'marketing-site', 'docs')"),
    type: z.string().describe("Part type (e.g. 'repo', 'marketing', 'docs', 'knowledge-base', 'design')"),
    location: z.string().describe("Filesystem path or URL for this part"),
    notes: z.string().optional().describe("Optional notes about this part"),
  },
  async (args) => {
    const board = loadBoard();
    const project = board.projects.find((p) => p.id === args.projectId);

    if (!project) {
      return { content: [{ type: "text" as const, text: `Project '${args.projectId}' not found.` }] };
    }

    if (!project.parts) project.parts = [];

    if (project.parts.some((pt) => pt.name === args.name)) {
      return { content: [{ type: "text" as const, text: `Part '${args.name}' already exists in '${project.name}'.` }] };
    }

    const part: Part = {
      name: args.name,
      type: args.type,
      location: args.location,
      notes: args.notes,
    };

    project.parts.push(part);
    project.lastUpdated = new Date().toISOString();
    saveBoard(board);

    // Scaffold directory and CLAUDE.md for filesystem paths
    let extra = "";
    const loc = args.location.replace(/^~/, process.env.HOME || "~");
    if (!loc.startsWith("http")) {
      try {
        fs.mkdirSync(loc, { recursive: true });
        const claudeMdPath = path.join(loc, "CLAUDE.md");
        if (!fs.existsSync(claudeMdPath)) {
          fs.writeFileSync(claudeMdPath, `# ${project.name} — ${args.name}\n\nPart type: ${args.type}\n${args.notes ? args.notes + "\n" : ""}\n## Overview\n\n## Conventions\n`);
          extra = ` CLAUDE.md created at ${claudeMdPath}.`;
        }
      } catch {
        // Non-fatal
      }
    }

    return { content: [{ type: "text" as const, text: `Part '${args.name}' (${args.type}) added to '${project.name}'.${extra}` }] };
  }
);

export const removePart = tool(
  "remove_part",
  "Remove a part from a project (does not delete files).",
  {
    projectId: z.string().describe("Project ID"),
    name: z.string().describe("Part name to remove"),
  },
  async (args) => {
    const board = loadBoard();
    const project = board.projects.find((p) => p.id === args.projectId);

    if (!project) {
      return { content: [{ type: "text" as const, text: `Project '${args.projectId}' not found.` }] };
    }

    if (!project.parts) project.parts = [];
    const idx = project.parts.findIndex((pt) => pt.name === args.name);
    if (idx === -1) {
      return { content: [{ type: "text" as const, text: `Part '${args.name}' not found in '${project.name}'.` }] };
    }

    project.parts.splice(idx, 1);
    project.lastUpdated = new Date().toISOString();
    saveBoard(board);

    return { content: [{ type: "text" as const, text: `Part '${args.name}' removed from '${project.name}'.` }] };
  }
);
