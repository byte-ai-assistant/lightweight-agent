import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CRON_FILE } from "../../paths.js";
import { evaluatePreflightGate } from "./preflight.js";
import { pushEvent } from "../events.js";

interface CronJob {
  id: string;
  schedule: string;
  description: string;
  action: string; // A prompt to send to the agent when triggered
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
}

// In-memory active cron tasks
const activeTasks = new Map<string, cron.ScheduledTask>();

// Track which jobs are currently executing to prevent concurrent runs
const runningJobs = new Set<string>();

// Callback that gets set by the server to handle cron triggers
let onCronTrigger: ((job: CronJob) => Promise<void>) | null = null;

export function setCronTriggerHandler(handler: (job: CronJob) => Promise<void>) {
  onCronTrigger = handler;
}

function ensureDataDir() {
  const dir = path.dirname(CRON_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJobs(): CronJob[] {
  ensureDataDir();
  if (!fs.existsSync(CRON_FILE)) return [];
  return JSON.parse(fs.readFileSync(CRON_FILE, "utf-8"));
}

function saveJobs(jobs: CronJob[]) {
  ensureDataDir();
  fs.writeFileSync(CRON_FILE, JSON.stringify(jobs, null, 2));
}

function scheduleCronJob(job: CronJob) {
  if (activeTasks.has(job.id)) {
    activeTasks.get(job.id)!.stop();
  }

  const task = cron.schedule(job.schedule, async () => {
    job.lastRun = new Date().toISOString();
    const jobs = loadJobs();
    const idx = jobs.findIndex((j) => j.id === job.id);
    if (idx !== -1) {
      jobs[idx].lastRun = job.lastRun;
      saveJobs(jobs);
    }

    if (onCronTrigger) {
      if (runningJobs.has(job.id)) {
        process.stderr.write(`[cron] Skipped [${job.id}] ${job.description}: previous run still in progress\n`);
        pushEvent(
          "cron_skip",
          { id: job.id, description: job.description, reason: "previous run still in progress" },
          `cron:${job.id}`,
        );
        return;
      }
      const gate = await evaluatePreflightGate(job.id);
      if (!gate.shouldRun) {
        process.stderr.write(`[cron] Skipped [${job.id}] ${job.description}: ${gate.reason}\n`);
        pushEvent(
          "cron_skip",
          { id: job.id, description: job.description, reason: gate.reason },
          `cron:${job.id}`,
        );
        return;
      }
      runningJobs.add(job.id);
      pushEvent(
        "cron_fire",
        { id: job.id, description: job.description, schedule: job.schedule },
        `cron:${job.id}`,
      );
      try {
        await onCronTrigger(job);
      } finally {
        runningJobs.delete(job.id);
      }
    }
  });

  activeTasks.set(job.id, task);
}

export function getActiveCronCount(): number {
  return activeTasks.size;
}

export function getCronJobs(): CronJob[] {
  return loadJobs();
}

export function getRunningJobIds(): string[] {
  return Array.from(runningJobs);
}

// Restore saved cron jobs on startup
export function restoreCronJobs() {
  const jobs = loadJobs();
  for (const job of jobs) {
    if (job.enabled) {
      scheduleCronJob(job);
    }
  }
  console.log(`Restored ${jobs.filter((j) => j.enabled).length} cron jobs`);
}

export const createCronJob = tool(
  "create_cron_job",
  "Create a new cron job that triggers the agent on a schedule. The action is a prompt that will be sent to the agent when the cron fires.",
  {
    schedule: z.string().describe("Cron expression (e.g. '0 9 * * *' for daily at 9am, '*/30 * * * *' for every 30 min)"),
    description: z.string().describe("Human-readable description of what this job does"),
    action: z.string().describe("The prompt/instruction to execute when triggered"),
  },
  async (args) => {
    if (!cron.validate(args.schedule)) {
      return { content: [{ type: "text" as const, text: `Invalid cron expression: '${args.schedule}'` }] };
    }

    const job: CronJob = {
      id: crypto.randomUUID().slice(0, 8),
      schedule: args.schedule,
      description: args.description,
      action: args.action,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    const jobs = loadJobs();
    jobs.push(job);
    saveJobs(jobs);
    scheduleCronJob(job);

    return {
      content: [{
        type: "text" as const,
        text: `Cron job created:\n  ID: ${job.id}\n  Schedule: ${job.schedule}\n  Description: ${job.description}\n  Action: ${job.action}`,
      }],
    };
  }
);

export const listCronJobs = tool(
  "list_cron_jobs",
  "List all configured cron jobs.",
  {},
  async () => {
    const jobs = loadJobs();
    if (jobs.length === 0) {
      return { content: [{ type: "text" as const, text: "No cron jobs configured." }] };
    }

    const list = jobs
      .map((j) =>
        `[${j.id}] ${j.enabled ? "ACTIVE" : "PAUSED"} | ${j.schedule} | ${j.description}${j.lastRun ? ` | Last run: ${j.lastRun}` : ""}`
      )
      .join("\n");

    return { content: [{ type: "text" as const, text: list }] };
  }
);

export const deleteCronJob = tool(
  "delete_cron_job",
  "Delete a cron job by its ID.",
  { id: z.string().describe("The cron job ID to delete") },
  async (args) => {
    const jobs = loadJobs();
    const idx = jobs.findIndex((j) => j.id === args.id);

    if (idx === -1) {
      return { content: [{ type: "text" as const, text: `Cron job '${args.id}' not found.` }] };
    }

    if (activeTasks.has(args.id)) {
      activeTasks.get(args.id)!.stop();
      activeTasks.delete(args.id);
    }

    const removed = jobs.splice(idx, 1)[0];
    saveJobs(jobs);

    return { content: [{ type: "text" as const, text: `Deleted cron job '${removed.description}' (${args.id}).` }] };
  }
);

export const toggleCronJob = tool(
  "toggle_cron_job",
  "Enable or disable a cron job.",
  {
    id: z.string().describe("The cron job ID"),
    enabled: z.boolean().describe("true to enable, false to disable"),
  },
  async (args) => {
    const jobs = loadJobs();
    const job = jobs.find((j) => j.id === args.id);

    if (!job) {
      return { content: [{ type: "text" as const, text: `Cron job '${args.id}' not found.` }] };
    }

    job.enabled = args.enabled;
    saveJobs(jobs);

    if (args.enabled) {
      scheduleCronJob(job);
    } else if (activeTasks.has(args.id)) {
      activeTasks.get(args.id)!.stop();
      activeTasks.delete(args.id);
    }

    return {
      content: [{
        type: "text" as const,
        text: `Cron job '${job.description}' is now ${args.enabled ? "ENABLED" : "DISABLED"}.`,
      }],
    };
  }
);
