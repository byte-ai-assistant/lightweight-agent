import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const GWS = "/opt/homebrew/bin/gws";

async function gws(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(GWS, args, {
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return stdout.trim();
}

// ─── Gmail ───────────────────────────────────────────────────────────────────

export const listEmails = tool(
  "gmail_list",
  "List recent emails from Gmail. Returns messages matching the query.",
  {
    query: z.string().optional().describe("Gmail search query (e.g. 'is:unread', 'from:boss@co.com'). Default: 'is:inbox'"),
    maxResults: z.number().optional().describe("Max emails to return (default 10)"),
  },
  async (args) => {
    try {
      const q = args.query ?? "is:inbox";
      const params = JSON.stringify({ userId: "me", q, maxResults: args.maxResults ?? 10 });
      const output = await gws("gmail", "users", "messages", "list", "--params", params);
      return { content: [{ type: "text" as const, text: output || "No emails found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const readEmail = tool(
  "gmail_read",
  "Read the full content of a specific email by its message ID.",
  { messageId: z.string().describe("The Gmail message ID") },
  async (args) => {
    try {
      const params = JSON.stringify({ userId: "me", id: args.messageId, format: "full" });
      const output = await gws("gmail", "users", "messages", "get", "--params", params);
      return { content: [{ type: "text" as const, text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const sendEmail = tool(
  "gmail_send",
  "Send an email via Gmail. Supports plain text and HTML bodies with CC/BCC. Always use this tool to send emails — never use sendmail or other methods.",
  {
    to: z.string().describe("Recipient email address(es), comma-separated"),
    subject: z.string().describe("Email subject"),
    body: z.string().optional().describe("Email body (plain text). Required unless bodyHtml is set."),
    bodyHtml: z.string().optional().describe("Email body (HTML). Use this for formatted/styled emails."),
    cc: z.string().optional().describe("CC recipients, comma-separated"),
    bcc: z.string().optional().describe("BCC recipients, comma-separated"),
  },
  async (args) => {
    try {
      if (!args.body && !args.bodyHtml) {
        return { content: [{ type: "text" as const, text: "Error: either body or bodyHtml is required." }] };
      }

      // For plain text without CC/BCC, use the +send helper
      if (args.body && !args.bodyHtml && !args.cc && !args.bcc) {
        const output = await gws("gmail", "+send", "--to", args.to, "--subject", args.subject, "--body", args.body);
        return { content: [{ type: "text" as const, text: output || "Email sent successfully." }] };
      }

      // For HTML or CC/BCC, build RFC 2822 message and use raw API
      const headers = [
        `To: ${args.to}`,
        `Subject: ${args.subject}`,
      ];
      if (args.cc) headers.push(`Cc: ${args.cc}`);
      if (args.bcc) headers.push(`Bcc: ${args.bcc}`);

      if (args.bodyHtml) {
        headers.push("Content-Type: text/html; charset=utf-8");
        headers.push("", args.bodyHtml);
      } else {
        headers.push("Content-Type: text/plain; charset=utf-8");
        headers.push("", args.body!);
      }

      const rawMessage = Buffer.from(headers.join("\r\n")).toString("base64url");
      const body = JSON.stringify({ raw: rawMessage });
      const params = JSON.stringify({ userId: "me" });
      const output = await gws("gmail", "users", "messages", "send", "--params", params, "--json", body);
      return { content: [{ type: "text" as const, text: output || "Email sent successfully." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const searchEmails = tool(
  "gmail_search",
  "Search emails with a Gmail query string.",
  {
    query: z.string().describe("Gmail search query (e.g. 'from:alice subject:meeting after:2024/01/01')"),
    maxResults: z.number().optional().describe("Max results (default 10)"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({ userId: "me", q: args.query, maxResults: args.maxResults ?? 10 });
      const output = await gws("gmail", "users", "messages", "list", "--params", params);
      return { content: [{ type: "text" as const, text: output || "No emails match that query." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Calendar ────────────────────────────────────────────────────────────────

export const calendarList = tool(
  "calendar_list_calendars",
  "List all Google Calendars the user has access to.",
  {},
  async () => {
    try {
      const output = await gws("calendar", "calendarList", "list");
      return { content: [{ type: "text" as const, text: output || "No calendars found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const calendarEvents = tool(
  "calendar_list_events",
  "List upcoming events from a Google Calendar. Supports date filtering and agenda view.",
  {
    calendarId: z.string().optional().describe("Calendar ID (default: primary)"),
    from: z.string().optional().describe("Start time (RFC3339, e.g. 2024-03-15T00:00:00Z)"),
    to: z.string().optional().describe("End time (RFC3339)"),
    maxResults: z.number().optional().describe("Max results (default 10)"),
    today: z.boolean().optional().describe("Show today's events only (uses +agenda helper)"),
    week: z.boolean().optional().describe("Show this week's events (uses +agenda helper)"),
    days: z.number().optional().describe("Show next N days of events (uses +agenda helper)"),
    query: z.string().optional().describe("Free text search query"),
  },
  async (args) => {
    try {
      // Use +agenda helper for today/week/days shortcuts
      if (args.today || args.week || args.days) {
        const cmdArgs = ["calendar", "+agenda"];
        if (args.today) cmdArgs.push("--today");
        if (args.week) cmdArgs.push("--week");
        if (args.days) cmdArgs.push("--days", String(args.days));
        if (args.calendarId) cmdArgs.push("--calendar", args.calendarId);
        const output = await gws(...cmdArgs);
        return { content: [{ type: "text" as const, text: output || "No events found." }] };
      }

      // Use raw API for full control
      const params: Record<string, any> = {
        calendarId: args.calendarId ?? "primary",
        maxResults: args.maxResults ?? 10,
        singleEvents: true,
        orderBy: "startTime",
      };
      if (args.from) params.timeMin = args.from;
      if (args.to) params.timeMax = args.to;
      if (args.query) params.q = args.query;
      const output = await gws("calendar", "events", "list", "--params", JSON.stringify(params));
      return { content: [{ type: "text" as const, text: output || "No events found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const calendarGetEvent = tool(
  "calendar_get_event",
  "Get details of a specific calendar event.",
  {
    calendarId: z.string().describe("Calendar ID"),
    eventId: z.string().describe("Event ID"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({ calendarId: args.calendarId, eventId: args.eventId });
      const output = await gws("calendar", "events", "get", "--params", params);
      return { content: [{ type: "text" as const, text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const calendarCreateEvent = tool(
  "calendar_create_event",
  "Create a new event on a Google Calendar.",
  {
    calendarId: z.string().describe("Calendar ID (use 'primary' for default)"),
    summary: z.string().describe("Event title"),
    from: z.string().describe("Start time (RFC3339, e.g. 2024-03-15T10:00:00-05:00)"),
    to: z.string().describe("End time (RFC3339)"),
    description: z.string().optional().describe("Event description"),
    location: z.string().optional().describe("Event location"),
    attendees: z.string().optional().describe("Comma-separated attendee emails"),
    allDay: z.boolean().optional().describe("All-day event (use date-only in from/to, e.g. 2024-03-15)"),
    withMeet: z.boolean().optional().describe("Create a Google Meet link"),
  },
  async (args) => {
    try {
      // Use +insert helper for simple events
      const cmdArgs = [
        "calendar", "+insert",
        "--summary", args.summary,
        "--start", args.from,
        "--end", args.to,
      ];
      if (args.calendarId !== "primary") cmdArgs.push("--calendar", args.calendarId);
      if (args.description) cmdArgs.push("--description", args.description);
      if (args.location) cmdArgs.push("--location", args.location);
      if (args.attendees) {
        for (const email of args.attendees.split(",").map(e => e.trim())) {
          cmdArgs.push("--attendee", email);
        }
      }

      // For Meet links, use raw API since +insert doesn't support it
      if (args.withMeet) {
        const body: Record<string, any> = {
          summary: args.summary,
          start: args.allDay ? { date: args.from } : { dateTime: args.from },
          end: args.allDay ? { date: args.to } : { dateTime: args.to },
          conferenceData: {
            createRequest: { requestId: `agent-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
          },
        };
        if (args.description) body.description = args.description;
        if (args.location) body.location = args.location;
        if (args.attendees) body.attendees = args.attendees.split(",").map(e => ({ email: e.trim() }));
        const params = JSON.stringify({ calendarId: args.calendarId, conferenceDataVersion: 1 });
        const output = await gws("calendar", "events", "insert", "--params", params, "--json", JSON.stringify(body));
        return { content: [{ type: "text" as const, text: output || "Event created." }] };
      }

      const output = await gws(...cmdArgs);
      return { content: [{ type: "text" as const, text: output || "Event created." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const calendarDeleteEvent = tool(
  "calendar_delete_event",
  "Delete a calendar event.",
  {
    calendarId: z.string().describe("Calendar ID"),
    eventId: z.string().describe("Event ID"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({ calendarId: args.calendarId, eventId: args.eventId });
      const output = await gws("calendar", "events", "delete", "--params", params);
      return { content: [{ type: "text" as const, text: output || "Event deleted." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const calendarSearch = tool(
  "calendar_search",
  "Search calendar events by text query.",
  {
    query: z.string().describe("Search query"),
    maxResults: z.number().optional().describe("Max results (default 10)"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({
        calendarId: "primary",
        q: args.query,
        maxResults: args.maxResults ?? 10,
        singleEvents: true,
        orderBy: "startTime",
      });
      const output = await gws("calendar", "events", "list", "--params", params);
      return { content: [{ type: "text" as const, text: output || "No events found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Google Drive ────────────────────────────────────────────────────────────

export const driveList = tool(
  "drive_list",
  "List files in a Google Drive folder.",
  {
    folderId: z.string().optional().describe("Folder ID (default: root)"),
    maxResults: z.number().optional().describe("Max results (default 20)"),
  },
  async (args) => {
    try {
      const params: Record<string, any> = { pageSize: args.maxResults ?? 20 };
      if (args.folderId) params.q = `'${args.folderId}' in parents`;
      const output = await gws("drive", "files", "list", "--params", JSON.stringify(params));
      return { content: [{ type: "text" as const, text: output || "No files found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const driveSearch = tool(
  "drive_search",
  "Search for files across Google Drive by text query.",
  {
    query: z.string().describe("Search query (full-text search across Drive)"),
    maxResults: z.number().optional().describe("Max results (default 10)"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({
        q: `fullText contains '${args.query.replace(/'/g, "\\'")}'`,
        pageSize: args.maxResults ?? 10,
      });
      const output = await gws("drive", "files", "list", "--params", params);
      return { content: [{ type: "text" as const, text: output || "No files found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const driveGetFile = tool(
  "drive_get_file",
  "Get metadata about a specific Google Drive file.",
  { fileId: z.string().describe("The Drive file ID") },
  async (args) => {
    try {
      const params = JSON.stringify({ fileId: args.fileId, fields: "*" });
      const output = await gws("drive", "files", "get", "--params", params);
      return { content: [{ type: "text" as const, text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const driveDownload = tool(
  "drive_download",
  "Download a file from Google Drive to the local filesystem.",
  {
    fileId: z.string().describe("The Drive file ID"),
    outputPath: z.string().optional().describe("Local output file path"),
    format: z.string().optional().describe("Export MIME type for Google Docs files (e.g. application/pdf, text/csv)"),
  },
  async (args) => {
    try {
      if (args.format) {
        // Export Google Workspace files
        const params = JSON.stringify({ fileId: args.fileId, mimeType: args.format });
        const cmdArgs = ["drive", "files", "export", "--params", params];
        if (args.outputPath) cmdArgs.push("--output", args.outputPath);
        const output = await gws(...cmdArgs);
        return { content: [{ type: "text" as const, text: output || "File exported." }] };
      }
      // Download binary files
      const params = JSON.stringify({ fileId: args.fileId, alt: "media" });
      const cmdArgs = ["drive", "files", "get", "--params", params];
      if (args.outputPath) cmdArgs.push("--output", args.outputPath);
      const output = await gws(...cmdArgs);
      return { content: [{ type: "text" as const, text: output || "File downloaded." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const driveUpload = tool(
  "drive_upload",
  "Upload a local file to Google Drive.",
  {
    localPath: z.string().describe("Local file path to upload"),
    parentId: z.string().optional().describe("Parent folder ID (default: root)"),
  },
  async (args) => {
    try {
      const cmdArgs = ["drive", "+upload", args.localPath];
      if (args.parentId) cmdArgs.push("--parent", args.parentId);
      const output = await gws(...cmdArgs);
      return { content: [{ type: "text" as const, text: output || "File uploaded." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const driveMkdir = tool(
  "drive_create_folder",
  "Create a new folder in Google Drive.",
  {
    name: z.string().describe("Folder name"),
    parentId: z.string().optional().describe("Parent folder ID (default: root)"),
  },
  async (args) => {
    try {
      const body: Record<string, any> = {
        name: args.name,
        mimeType: "application/vnd.google-apps.folder",
      };
      if (args.parentId) body.parents = [args.parentId];
      const output = await gws("drive", "files", "create", "--json", JSON.stringify(body));
      return { content: [{ type: "text" as const, text: output || "Folder created." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const driveDelete = tool(
  "drive_delete",
  "Move a Google Drive file to trash.",
  { fileId: z.string().describe("The Drive file ID") },
  async (args) => {
    try {
      const params = JSON.stringify({ fileId: args.fileId });
      const body = JSON.stringify({ trashed: true });
      const output = await gws("drive", "files", "update", "--params", params, "--json", body);
      return { content: [{ type: "text" as const, text: output || "File moved to trash." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const driveShare = tool(
  "drive_share",
  "Share a Google Drive file with someone.",
  {
    fileId: z.string().describe("The Drive file ID"),
    email: z.string().optional().describe("Email to share with"),
    role: z.string().optional().describe("Permission role: reader, writer, commenter, organizer"),
    type: z.string().optional().describe("Permission type: user, group, domain, anyone"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({ fileId: args.fileId });
      const body: Record<string, any> = {
        role: args.role ?? "reader",
        type: args.type ?? "user",
      };
      if (args.email) body.emailAddress = args.email;
      const output = await gws("drive", "permissions", "create", "--params", params, "--json", JSON.stringify(body));
      return { content: [{ type: "text" as const, text: output || "File shared." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Google Docs ─────────────────────────────────────────────────────────────

export const docsRead = tool(
  "docs_read",
  "Read the content of a Google Doc (returns full document JSON).",
  { docId: z.string().describe("The Google Doc ID") },
  async (args) => {
    try {
      const params = JSON.stringify({ documentId: args.docId });
      const output = await gws("docs", "documents", "get", "--params", params);
      return { content: [{ type: "text" as const, text: output || "(Empty document)" }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const docsCreate = tool(
  "docs_create",
  "Create a new Google Doc.",
  {
    title: z.string().describe("Document title"),
    content: z.string().optional().describe("Initial content to write"),
    folderId: z.string().optional().describe("Parent folder ID in Drive"),
  },
  async (args) => {
    try {
      const body = JSON.stringify({ title: args.title });
      const createOutput = await gws("docs", "documents", "create", "--json", body);

      const parsed = JSON.parse(createOutput);
      const docId = parsed.documentId;

      // Write initial content if provided
      if (args.content && docId) {
        await gws("docs", "+write", "--document", docId, "--text", args.content);
      }

      // Move to folder if specified
      if (args.folderId && docId) {
        const params = JSON.stringify({ fileId: docId, addParents: args.folderId, removeParents: "root" });
        await gws("drive", "files", "update", "--params", params, "--json", "{}");
      }

      return { content: [{ type: "text" as const, text: createOutput || "Document created." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const docsWrite = tool(
  "docs_write",
  "Append text content to a Google Doc.",
  {
    docId: z.string().describe("The Google Doc ID"),
    content: z.string().describe("Content to append"),
  },
  async (args) => {
    try {
      const output = await gws("docs", "+write", "--document", args.docId, "--text", args.content);
      return { content: [{ type: "text" as const, text: output || "Document updated." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const docsInfo = tool(
  "docs_info",
  "Get metadata about a Google Doc.",
  { docId: z.string().describe("The Google Doc ID") },
  async (args) => {
    try {
      const params = JSON.stringify({ documentId: args.docId });
      const output = await gws("docs", "documents", "get", "--params", params);
      return { content: [{ type: "text" as const, text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const docsExport = tool(
  "docs_export",
  "Export a Google Doc to a local file (pdf, docx, txt).",
  {
    docId: z.string().describe("The Google Doc ID"),
    format: z.enum(["pdf", "docx", "txt"]).describe("Export format"),
    outputPath: z.string().optional().describe("Local output file path"),
  },
  async (args) => {
    try {
      const mimeTypes: Record<string, string> = {
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        txt: "text/plain",
      };
      const params = JSON.stringify({ fileId: args.docId, mimeType: mimeTypes[args.format] });
      const cmdArgs = ["drive", "files", "export", "--params", params];
      if (args.outputPath) cmdArgs.push("--output", args.outputPath);
      const output = await gws(...cmdArgs);
      return { content: [{ type: "text" as const, text: output || "Document exported." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Google Sheets ───────────────────────────────────────────────────────────

export const sheetsRead = tool(
  "sheets_read",
  "Read values from a range in a Google Sheet.",
  {
    spreadsheetId: z.string().describe("The Spreadsheet ID"),
    range: z.string().describe("Range in A1 notation (e.g. 'Sheet1!A1:D10')"),
  },
  async (args) => {
    try {
      const output = await gws("sheets", "+read", "--spreadsheet", args.spreadsheetId, "--range", args.range);
      return { content: [{ type: "text" as const, text: output || "(Empty range)" }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const sheetsUpdate = tool(
  "sheets_update",
  "Update values in a range of a Google Sheet.",
  {
    spreadsheetId: z.string().describe("The Spreadsheet ID"),
    range: z.string().describe("Range in A1 notation (e.g. 'Sheet1!A1')"),
    values: z.array(z.array(z.string())).describe("2D array of values (rows of columns)"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({
        spreadsheetId: args.spreadsheetId,
        range: args.range,
        valueInputOption: "USER_ENTERED",
      });
      const body = JSON.stringify({ values: args.values });
      const output = await gws("sheets", "spreadsheets", "values", "update", "--params", params, "--json", body);
      return { content: [{ type: "text" as const, text: output || "Sheet updated." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const sheetsAppend = tool(
  "sheets_append",
  "Append rows to a Google Sheet.",
  {
    spreadsheetId: z.string().describe("The Spreadsheet ID"),
    values: z.array(z.array(z.string())).describe("2D array of values to append (rows of columns)"),
  },
  async (args) => {
    try {
      const output = await gws("sheets", "+append", "--spreadsheet", args.spreadsheetId, "--json-values", JSON.stringify(args.values));
      return { content: [{ type: "text" as const, text: output || "Rows appended." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const sheetsMetadata = tool(
  "sheets_metadata",
  "Get metadata about a Google Sheet (sheet names, row counts, etc.).",
  { spreadsheetId: z.string().describe("The Spreadsheet ID") },
  async (args) => {
    try {
      const params = JSON.stringify({ spreadsheetId: args.spreadsheetId });
      const output = await gws("sheets", "spreadsheets", "get", "--params", params);
      return { content: [{ type: "text" as const, text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const sheetsCreate = tool(
  "sheets_create",
  "Create a new Google Sheet.",
  { title: z.string().describe("Spreadsheet title") },
  async (args) => {
    try {
      const body = JSON.stringify({ properties: { title: args.title } });
      const output = await gws("sheets", "spreadsheets", "create", "--json", body);
      return { content: [{ type: "text" as const, text: output || "Sheet created." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Google Tasks ────────────────────────────────────────────────────────────

export const googleTasksListLists = tool(
  "gtasks_list_lists",
  "List all Google Task lists.",
  {},
  async () => {
    try {
      const output = await gws("tasks", "tasklists", "list");
      return { content: [{ type: "text" as const, text: output || "No task lists found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const googleTasksList = tool(
  "gtasks_list",
  "List tasks in a Google Tasks list.",
  {
    tasklistId: z.string().describe("Task list ID (use gtasks_list_lists to find it)"),
    maxResults: z.number().optional().describe("Max results"),
  },
  async (args) => {
    try {
      const params: Record<string, any> = { tasklist: args.tasklistId };
      if (args.maxResults) params.maxResults = args.maxResults;
      const output = await gws("tasks", "tasks", "list", "--params", JSON.stringify(params));
      return { content: [{ type: "text" as const, text: output || "No tasks found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const googleTasksAdd = tool(
  "gtasks_add",
  "Add a new task to a Google Tasks list.",
  {
    tasklistId: z.string().describe("Task list ID"),
    title: z.string().describe("Task title"),
    notes: z.string().optional().describe("Task notes/description"),
    due: z.string().optional().describe("Due date (RFC3339 or date)"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({ tasklist: args.tasklistId });
      const body: Record<string, any> = { title: args.title };
      if (args.notes) body.notes = args.notes;
      if (args.due) body.due = args.due;
      const output = await gws("tasks", "tasks", "insert", "--params", params, "--json", JSON.stringify(body));
      return { content: [{ type: "text" as const, text: output || "Task added." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const googleTasksDone = tool(
  "gtasks_done",
  "Mark a Google Task as completed.",
  {
    tasklistId: z.string().describe("Task list ID"),
    taskId: z.string().describe("Task ID"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({ tasklist: args.tasklistId, task: args.taskId });
      const body = JSON.stringify({ status: "completed" });
      const output = await gws("tasks", "tasks", "patch", "--params", params, "--json", body);
      return { content: [{ type: "text" as const, text: output || "Task marked as done." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const googleTasksDelete = tool(
  "gtasks_delete",
  "Delete a Google Task.",
  {
    tasklistId: z.string().describe("Task list ID"),
    taskId: z.string().describe("Task ID"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({ tasklist: args.tasklistId, task: args.taskId });
      const output = await gws("tasks", "tasks", "delete", "--params", params);
      return { content: [{ type: "text" as const, text: output || "Task deleted." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

// ─── Google Contacts ─────────────────────────────────────────────────────────

export const contactsSearch = tool(
  "contacts_search",
  "Search Google Contacts by name, email, or phone.",
  {
    query: z.string().describe("Search query (name, email, or phone)"),
    maxResults: z.number().optional().describe("Max results (default 10)"),
  },
  async (args) => {
    try {
      const params = JSON.stringify({
        query: args.query,
        readMask: "names,emailAddresses,phoneNumbers,organizations",
        pageSize: args.maxResults ?? 10,
      });
      const output = await gws("people", "people", "searchContacts", "--params", params);
      return { content: [{ type: "text" as const, text: output || "No contacts found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const contactsList = tool(
  "contacts_list",
  "List Google Contacts.",
  { maxResults: z.number().optional().describe("Max results (default 20)") },
  async (args) => {
    try {
      const params = JSON.stringify({
        resourceName: "people/me",
        personFields: "names,emailAddresses,phoneNumbers,organizations",
        pageSize: args.maxResults ?? 20,
      });
      const output = await gws("people", "people", "connections", "list", "--params", params);
      return { content: [{ type: "text" as const, text: output || "No contacts found." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const contactsGet = tool(
  "contacts_get",
  "Get details of a specific Google Contact.",
  { resourceName: z.string().describe("Contact resource name (e.g. 'people/c1234567890')") },
  async (args) => {
    try {
      const params = JSON.stringify({
        resourceName: args.resourceName,
        personFields: "names,emailAddresses,phoneNumbers,organizations,addresses,biographies",
      });
      const output = await gws("people", "people", "get", "--params", params);
      return { content: [{ type: "text" as const, text: output }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);

export const contactsCreate = tool(
  "contacts_create",
  "Create a new Google Contact.",
  {
    givenName: z.string().describe("First name"),
    familyName: z.string().optional().describe("Last name"),
    email: z.string().optional().describe("Email address"),
    phone: z.string().optional().describe("Phone number"),
  },
  async (args) => {
    try {
      const body: Record<string, any> = {
        names: [{ givenName: args.givenName, familyName: args.familyName }],
      };
      if (args.email) body.emailAddresses = [{ value: args.email }];
      if (args.phone) body.phoneNumbers = [{ value: args.phone }];
      const output = await gws("people", "people", "createContact", "--json", JSON.stringify(body));
      return { content: [{ type: "text" as const, text: output || "Contact created." }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }] };
    }
  }
);
