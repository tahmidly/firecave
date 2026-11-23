import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ClaudeEvent, ProviderStatus, RunOptions } from "../shared/types";

const execFileP = promisify(execFile);

/** How to launch the official Gemini CLI: its JS entry run by Electron's own Node (no shell, no .cmd shim). */
export interface GeminiLaunch {
  file: string;
  prefix: string[];
  env: NodeJS.ProcessEnv;
}

export async function resolveGemini(): Promise<GeminiLaunch | null> {
  let lines: string[] = [];
  try {
    const { stdout } = await execFileP(process.platform === "win32" ? "where.exe" : "which", ["gemini"]);
    lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return null;
  }
  for (const l of lines) {
    const entry = path.join(path.dirname(l), "node_modules", "@google", "gemini-cli", "bundle", "gemini.js");
    if (existsSync(entry)) return { file: process.execPath, prefix: [entry], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } };
  }
  const exe = lines.find((l) => /\.exe$/i.test(l) || process.platform !== "win32");
  return exe ? { file: exe, prefix: [], env: process.env } : null;
}

export async function geminiStatus(): Promise<ProviderStatus> {
  const g = await resolveGemini();
  if (!g) return { id: "gemini", name: "Gemini CLI", installed: false, loggedIn: false };
  const status: ProviderStatus = { id: "gemini", name: "Gemini CLI", installed: true, loggedIn: false, path: g.prefix[0] ?? g.file };
  try {
    const v = await execFileP(g.file, [...g.prefix, "--version"], { env: g.env, timeout: 20000 });
    status.version = v.stdout.trim();
  } catch {
    /* version is optional */
  }
  // Only checks that a sign-in exists (file present / env var set). Firecave never reads or copies the credentials.
  const dir = path.join(os.homedir(), ".gemini");
  status.loggedIn =
    existsSync(path.join(dir, "oauth_creds.json")) || !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_API_KEY || !!process.env.GOOGLE_GENAI_USE_VERTEXAI;
  if (!status.loggedIn) status.hint = "Run `gemini` once in a terminal and sign in";
  return status;
}

export function geminiArgs(opts: RunOptions): string[] {
  const approval = opts.mode === "chat" || opts.permissionMode === "plan" ? "plan" : opts.permissionMode === "default" ? "default" : "auto_edit";
  const args = ["-p", "", "-o", "stream-json", "--approval-mode", approval, "--skip-trust"];
  if (opts.model) args.push("-m", opts.model);
  // New sessions get our id up front so they can be resumed by id later.
  if (opts.sessionId) args.push("--resume", opts.sessionId);
  else if (opts.newSessionId) args.push("--session-id", opts.newSessionId);
  return args;
}

/** Map Gemini CLI tool names to the names the UI already knows. */
const TOOL_NAMES: Record<string, string> = {
  read_file: "Read",
  read_many_files: "Read",
  write_file: "Write",
  replace: "Edit",
  run_shell_command: "Bash",
  glob: "Glob",
  search_file_content: "Grep",
  grep: "Grep",
  list_directory: "LS",
  web_fetch: "WebFetch",
  google_web_search: "WebSearch",
};

/**
 * Translate one Gemini stream-json event into the Claude Code event shapes the renderer already understands,
 * so the chat UI, tool rows, usage readout and sync all work unchanged.
 */
export function translateGemini(ev: Record<string, unknown>): ClaudeEvent[] {
  switch (ev.type) {
    case "init":
      return [{ type: "system", subtype: "init", session_id: ev.session_id, model: ev.model }];
    case "message":
      if (ev.role !== "assistant" || typeof ev.content !== "string") return [];
      return [{ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: ev.content } } }];
    case "tool_use": {
      const raw = String(ev.tool_name ?? "tool");
      const p = (ev.parameters ?? {}) as Record<string, unknown>;
      // Normalise the common argument names so tool rows show the file or command.
      const input = { ...p, file_path: p.file_path ?? p.absolute_path ?? p.path, command: p.command, pattern: p.pattern };
      return [{ type: "assistant", message: { content: [{ type: "tool_use", id: String(ev.tool_id), name: TOOL_NAMES[raw] ?? raw, input }] } }];
    }
    case "tool_result": {
      const err = ev.error as { message?: string } | undefined;
      return [
        {
          type: "user",
          message: { content: [{ type: "tool_result", tool_use_id: String(ev.tool_id), content: String(ev.output ?? err?.message ?? ""), is_error: ev.status === "error" }] },
        },
      ];
    }
    case "result": {
      const st = (ev.stats ?? {}) as { total_tokens?: number; input_tokens?: number; output_tokens?: number; cached?: number; models?: Record<string, unknown> };
      const err = ev.error as { message?: string } | undefined;
      const model = st.models ? Object.keys(st.models)[0] : undefined;
      return [
        {
          type: "result",
          is_error: ev.status === "error",
          result: err?.message,
          total_cost_usd: 0,
          usage: { input_tokens: Math.max(0, (st.input_tokens ?? 0) - (st.cached ?? 0)), output_tokens: st.output_tokens ?? 0, cache_read_input_tokens: st.cached ?? 0 },
          modelUsage: model ? { [model]: {} } : undefined,
        },
      ];
    }
    case "error":
      return [{ type: "local_stderr", text: String(ev.message ?? "Gemini error") }];
    default:
      return [];
  }
}
