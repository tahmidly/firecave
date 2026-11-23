"use client";

import { useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { ToolCall } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/Icon";
import { cn } from "@/lib/utils";

/** Build the narrowest allow-rule for one denied tool call, or null if none is safe. */
export function ruleFor(t: ToolCall): string | null {
  let inp: Record<string, unknown> = {};
  try {
    inp = JSON.parse(t.input) as Record<string, unknown>;
  } catch {
    return null;
  }
  // Plugin (MCP) tools are allowed by their exact tool name.
  if (t.name.startsWith("mcp__") && !t.name.includes("*")) return t.name;
  const esc = (s: string) => s.replace(/[()]/g, (c) => "\\" + c);
  if (t.name === "Bash" || t.name === "PowerShell") {
    const cmd = String(inp.command ?? "");
    return cmd && !cmd.includes("*") ? `${t.name}(${esc(cmd)})` : null;
  }
  const p = inp.file_path ?? inp.notebook_path;
  if (typeof p === "string" && p && !p.includes("*")) return `${t.name}(${esc(p.replace(/\\/g, "/"))})`;
  return null;
}

/** opencode-style title and icon for each tool. */
function meta(name: string): { title: string; icon: IconName } {
  switch (name) {
    case "Read":
      return { title: "Read", icon: "glasses" };
    case "Glob":
      return { title: "Glob", icon: "magnifying-glass-menu" };
    case "Grep":
      return { title: "Grep", icon: "magnifying-glass-menu" };
    case "LS":
      return { title: "List", icon: "bullet-list" };
    case "Bash":
    case "PowerShell":
      return { title: "Shell", icon: "terminal" };
    case "Edit":
    case "MultiEdit":
      return { title: "Edit", icon: "code-lines" };
    case "Write":
      return { title: "Write", icon: "code-lines" };
    case "NotebookEdit":
      return { title: "Notebook", icon: "code-lines" };
    case "Task":
    case "Agent":
      return { title: "Agent", icon: "task" };
    case "TodoWrite":
      return { title: "Todos", icon: "checklist" };
    case "WebFetch":
      return { title: "Webfetch", icon: "globe" };
    case "WebSearch":
      return { title: "Web Search", icon: "globe" };
    default:
      if (name.startsWith("mcp__")) return { title: name.split("__").slice(1).join(" · "), icon: "code" };
      return { title: name, icon: "code" };
  }
}

function parse(t: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(t.input) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Subtitle: the file name, command or pattern the tool is working on. */
function subtitle(t: ToolCall): string {
  const inp = parse(t);
  const file = inp.file_path ?? inp.notebook_path ?? inp.path;
  if (typeof file === "string") return file.split(/[\\/]/).slice(-2).join("/");
  const v = inp.command ?? inp.pattern ?? inp.url ?? inp.query ?? inp.description;
  return typeof v === "string" ? v.replace(/\s+/g, " ") : "";
}

/** Small diff view for Edit/Write calls, using opencode's diff colours. */
function Diff({ t }: { t: ToolCall }) {
  const inp = parse(t);
  let removed = "";
  let added = "";
  if (t.name === "Write") added = String(inp.content ?? "");
  else if (t.name === "Edit") {
    removed = String(inp.old_string ?? "");
    added = String(inp.new_string ?? "");
  } else if (t.name === "MultiEdit" && Array.isArray(inp.edits)) {
    const e = inp.edits as { old_string?: string; new_string?: string }[];
    removed = e.map((x) => x.old_string ?? "").join("\n");
    added = e.map((x) => x.new_string ?? "").join("\n");
  } else return null;
  const lines = (s: string) => (s ? s.replace(/\n$/, "").split("\n") : []);
  return (
    <pre className="max-h-72 overflow-auto rounded-[6px] font-mono text-[12px] leading-5">
      {lines(removed).map((l, i) => (
        <div key={"d" + i} className="whitespace-pre-wrap px-2" style={{ background: "var(--diff-del-bg)", color: "var(--diff-del-fg)" }}>
          - {l}
        </div>
      ))}
      {lines(added).map((l, i) => (
        <div key={"a" + i} className="whitespace-pre-wrap px-2" style={{ background: "var(--diff-add-bg)", color: "var(--diff-add-fg)" }}>
          + {l}
        </div>
      ))}
    </pre>
  );
}

interface Props {
  tool: ToolCall;
  running: boolean;
  canAct: boolean;
  onAllow: (t: ToolCall) => void;
  onReject: (t: ToolCall) => void;
}

export function ToolCard({ tool: t, running, canAct, onAllow, onReject }: Props) {
  const [open, setOpen] = useState(false);
  const { title, icon } = meta(t.name);
  const pending = t.denied?.state === "pending";
  const inFlight = running && t.result === undefined && !t.denied;
  const rule = t.denied?.overridable !== false ? ruleFor(t) : null;
  const isEdit = ["Edit", "MultiEdit", "Write"].includes(t.name);

  return (
    <div className={cn("text-[13px]", pending && "rounded-[10px] bg-layer-1 p-1 shadow-raised")}>
      <button onClick={() => setOpen((o) => !o)} className="group flex h-7 w-full items-center gap-2 rounded-[6px] px-1 text-left hover:bg-accent">
        {inFlight ? (
          <span className="size-4 animate-spin rounded-full border-[1.5px] border-faint border-t-transparent" />
        ) : (
          <Icon name={icon} className={cn(t.isError && !pending ? "text-destructive" : "text-faint")} />
        )}
        <span className={cn("shrink-0 font-medium", inFlight && "animate-pulse")}>{title}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{subtitle(t)}</span>
        {pending && <AlertTriangle className="size-3.5 shrink-0 text-warning" />}
        <Icon name="chevron-down" className={cn("text-faint opacity-0 transition group-hover:opacity-100", open && "rotate-180 opacity-100")} />
      </button>

      {open && (
        <div className="ml-7 mt-1 space-y-2 pb-2">
          {isEdit ? <Diff t={t} /> : <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[6px] bg-layer-1 p-2 font-mono text-[12px]">{t.input}</pre>}
          {t.result && (
            <pre className={cn("max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[6px] bg-layer-1 p-2 font-mono text-[12px]", t.isError ? "text-destructive" : "text-muted-foreground")}>
              {t.result}
            </pre>
          )}
        </div>
      )}

      {pending && (
        <div className="flex items-center gap-3 px-2 py-2">
          <ShieldAlert className="size-4 shrink-0 text-warning" />
          <p className="flex-1 text-[12px] leading-snug text-muted-foreground">{t.denied?.reason}</p>
          {rule ? (
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" disabled={!canAct} onClick={() => onAllow(t)}>
                Allow once
              </Button>
              <Button size="sm" variant="outline" onClick={() => onReject(t)}>
                Deny
              </Button>
            </div>
          ) : (
            <span className="shrink-0 text-[12px] text-faint">Blocked by a safety check — run it yourself</span>
          )}
        </div>
      )}
      {t.denied?.state === "allowed" && <div className="ml-7 text-[12px] text-success">Approved</div>}
      {t.denied?.state === "rejected" && <div className="ml-7 text-[12px] text-faint">Denied</div>}
    </div>
  );
}
