import { spawn, execFile, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ClaudeEvent, ClaudeStatus, ProviderStatus, RunMessage, RunOptions } from "../shared/types";
import { geminiArgs, geminiStatus, resolveGemini, translateGemini } from "./gemini";
import { apiProviderStatuses, cancelApiRun, startApiRun } from "./api-providers";

const execFileP = promisify(execFile);

interface Resolved {
  file: string;
  shell: boolean;
}

/** Locate the official claude executable (prefers the real .exe behind the npm shim). */
async function resolveClaude(): Promise<Resolved | null> {
  const finder = process.platform === "win32" ? "where.exe" : "which";
  let lines: string[] = [];
  try {
    const { stdout } = await execFileP(finder, ["claude"]);
    lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return null;
  }
  for (const l of lines) {
    if (l.toLowerCase().endsWith(".exe") && existsSync(l)) return { file: l, shell: false };
  }
  for (const l of lines) {
    if (l.toLowerCase().endsWith(".cmd")) {
      const exe = path.join(path.dirname(l), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
      if (existsSync(exe)) return { file: exe, shell: false };
      return { file: l, shell: true };
    }
  }
  const first = lines.find((l) => !l.toLowerCase().endsWith(".ps1"));
  return first ? { file: first, shell: false } : null;
}

export async function getStatus(): Promise<ClaudeStatus> {
  const r = await resolveClaude();
  if (!r) return { installed: false, loggedIn: false, error: "Claude Code CLI not found on PATH" };
  const status: ClaudeStatus = { installed: true, path: r.file, loggedIn: false };
  try {
    const v = await execFileP(r.file, ["--version"], { shell: r.shell, timeout: 15000 });
    status.version = v.stdout.trim();
    const a = await execFileP(r.file, ["auth", "status"], { shell: r.shell, timeout: 15000 });
    const j = JSON.parse(a.stdout) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
    status.loggedIn = !!j.loggedIn;
    status.authMethod = j.authMethod;
    status.subscriptionType = j.subscriptionType;
  } catch (e) {
    status.error = e instanceof Error ? e.message : String(e);
  }
  return status;
}

const runs = new Map<string, { child: ChildProcess; cancelled: boolean }>();

export async function startRun(opts: RunOptions, emit: (m: RunMessage) => void): Promise<{ ok: boolean; error?: string }> {
  if (runs.has(opts.runId)) return { ok: false, error: "Run already active" };
  if (opts.provider?.startsWith("api:")) return startApiRun(opts, emit);
  if (opts.provider === "gemini") {
    const g = await resolveGemini();
    if (!g) return { ok: false, error: "Gemini CLI not found" };
    return launch(opts, emit, g.file, [...g.prefix, ...geminiArgs(opts)], false, g.env, translateGemini);
  }
  const r = await resolveClaude();
  if (!r) return { ok: false, error: "Claude Code CLI not found" };

  const args = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-mode", opts.permissionMode ?? "acceptEdits"];
  if (opts.mode === "chat") {
    args.push("--tools", "", "--strict-mcp-config", "--disable-slash-commands");
  } else {
    // Isolation: Firecave uses only its own plugins, not Claude Code's connectors, plugins or user settings.
    if (opts.isolate !== false) args.push("--strict-mcp-config", "--setting-sources", "project,local");
    if (opts.mcpConfig) args.push("--mcp-config", opts.mcpConfig);
    for (const dir of opts.pluginDirs ?? []) args.push("--plugin-dir", dir);
  }
  if (opts.effort) args.push("--effort", opts.effort);
  if (opts.allowedTools?.length) args.push("--allowedTools", ...opts.allowedTools);
  if (opts.model) args.push("--model", opts.model);
  if (opts.sessionId) args.push("--resume", opts.sessionId);

  return launch(opts, emit, r.file, args, r.shell, process.env, (e) => [e as ClaudeEvent]);
}

/** Spawn a CLI, feed the prompt on stdin and stream its JSON lines (translated to Claude-shaped events) to the UI. */
function launch(
  opts: RunOptions,
  emit: (m: RunMessage) => void,
  file: string,
  args: string[],
  shell: boolean,
  env: NodeJS.ProcessEnv,
  translate: (ev: Record<string, unknown>) => ClaudeEvent[],
): { ok: boolean; error?: string } {
  const child = spawn(file, args, { cwd: opts.cwd || undefined, shell, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const entry = { child, cancelled: false };
  runs.set(opts.runId, entry);

  // Prompt goes via stdin: no shell quoting issues, no command-line length limits.
  child.stdin.write(opts.prompt);
  child.stdin.end();

  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        for (const event of translate(JSON.parse(line) as Record<string, unknown>)) {
          if (event.type === "local_stderr") emit({ runId: opts.runId, kind: "stderr", text: String(event.text) });
          else emit({ runId: opts.runId, kind: "event", event });
        }
      } catch {
        emit({ runId: opts.runId, kind: "stderr", text: line });
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (t: string) => emit({ runId: opts.runId, kind: "stderr", text: t }));
  child.on("error", (e) => emit({ runId: opts.runId, kind: "stderr", text: e.message }));
  child.on("close", (code) => {
    runs.delete(opts.runId);
    emit({ runId: opts.runId, kind: "exit", code, cancelled: entry.cancelled });
  });
  return { ok: true };
}

export function cancelRun(runId: string): void {
  if (cancelApiRun(runId)) return;
  const e = runs.get(runId);
  if (!e) return;
  e.cancelled = true;
  if (process.platform === "win32" && e.child.pid) {
    // Kill the whole process tree (the CLI spawns children).
    spawn("taskkill", ["/pid", String(e.child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    e.child.kill("SIGTERM");
  }
}

export function cancelAll(): void {
  for (const id of [...runs.keys()]) cancelRun(id);
}

export async function providersStatus(): Promise<ProviderStatus[]> {
  const [cl, ge] = await Promise.all([getStatus(), geminiStatus()]);
  return [
    { id: "claude", name: "Claude Code", installed: cl.installed, loggedIn: cl.loggedIn, version: cl.version, path: cl.path, hint: cl.loggedIn ? undefined : "Run `claude auth login` in a terminal" },
    ge,
    ...apiProviderStatuses(),
  ];
}
