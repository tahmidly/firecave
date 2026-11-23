"use client";

import { getApi } from "@/lib/transport";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File as FileIcon, Folder, FilePen, Terminal, CheckCircle2, XCircle } from "lucide-react";
import type { Conversation, FsEntry, FsFile, ToolCall } from "@/shared/types";
import { Icon, type IconName } from "@/components/Icon";

type Tab = "files" | "changes" | "activity" | "context";

const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

function parseInput(t: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(t.input) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface Change {
  path: string;
  calls: { id: string; tool: string; removed: string; added: string; error: boolean }[];
}

function collectChanges(conv: Conversation): Change[] {
  const byPath = new Map<string, Change>();
  for (const m of conv.messages) {
    for (const t of m.tools) {
      if (!EDIT_TOOLS.has(t.name)) continue;
      const inp = parseInput(t);
      const p = String(inp.file_path ?? inp.notebook_path ?? "");
      if (!p) continue;
      let removed = "";
      let added = "";
      if (t.name === "Write") added = String(inp.content ?? "");
      else if (t.name === "Edit") {
        removed = String(inp.old_string ?? "");
        added = String(inp.new_string ?? "");
      } else if (t.name === "MultiEdit" && Array.isArray(inp.edits)) {
        const e = inp.edits as { old_string?: string; new_string?: string }[];
        removed = e.map((x) => x.old_string ?? "").join("\n…\n");
        added = e.map((x) => x.new_string ?? "").join("\n…\n");
      }
      const ch = byPath.get(p) ?? { path: p, calls: [] };
      ch.calls.push({ id: t.id, tool: t.name, removed, added, error: !!t.isError || t.denied?.state === "pending" });
      byPath.set(p, ch);
    }
  }
  return [...byPath.values()];
}

function Tree({ root, rel, depth, onOpen, openPath }: { root: string; rel: string; depth: number; onOpen: (e: FsEntry) => void; openPath: string | null }) {
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    getApi()
      ?.fsList(root, rel)
      .then((e) => !off && setEntries(e))
      .catch((e: Error) => !off && setErr(e.message));
    return () => {
      off = true;
    };
  }, [root, rel]);

  if (err) return <div className="px-2 text-xs text-destructive">{err}</div>;
  if (!entries) return <div className="px-2 text-xs text-muted-foreground">Loading…</div>;
  return (
    <ul>
      {entries.map((e) => (
        <li key={e.rel}>
          <button
            onClick={() => (e.isDir ? setExpanded((x) => ({ ...x, [e.rel]: !x[e.rel] })) : onOpen(e))}
            style={{ paddingLeft: 8 + depth * 12 }}
            className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60 ${openPath === e.rel ? "bg-muted" : ""}`}
          >
            {e.isDir ? expanded[e.rel] ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span className="w-3" />}
            {e.isDir ? <Folder size={12} className="text-primary" /> : <FileIcon size={12} className="text-muted-foreground" />}
            <span className="truncate">{e.name}</span>
          </button>
          {e.isDir && expanded[e.rel] && <Tree root={root} rel={e.rel} depth={depth + 1} onOpen={onOpen} openPath={openPath} />}
        </li>
      ))}
    </ul>
  );
}

export function RightPanel({
  conv,
  running,
  onClose,
  width = 320,
  request,
}: {
  conv: Conversation;
  running: boolean;
  onClose: () => void;
  width?: number;
  request?: { kind: "context"; n: number } | null;
}) {
  const [file, setFile] = useState<FsFile | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [treeKey, setTreeKey] = useState(0);

  const changes = useMemo(() => collectChanges(conv), [conv]);
  const commands = useMemo(
    () => conv.messages.flatMap((m) => m.tools).filter((t) => t.name === "Bash" || t.name === "PowerShell"),
    [conv],
  );

  // Refresh the tree when a run finishes (files may have changed).
  useEffect(() => {
    if (!running) setTreeKey((k) => k + 1);
  }, [running]);

  const open = useCallback(
    async (e: FsEntry) => {
      if (!conv.cwd) return;
      setFileErr(null);
      try {
        setFile(await getApi()!.fsRead(conv.cwd, e.rel));
      } catch (x) {
        setFile(null);
        setFileErr(x instanceof Error ? x.message : String(x));
      }
    },
    [conv.cwd],
  );

  const kinds: Record<Tab, { label: string; icon: IconName; keys: string }> = {
    changes: { label: changes.length ? `Review (${changes.length})` : "Review", icon: "review", keys: "R" },
    activity: { label: "Terminal", icon: "terminal", keys: "T" },
    files: { label: "Open file", icon: "open-file", keys: "P" },
    context: { label: "Context", icon: "status", keys: "C" },
  };

  // opencode-style panel: a strip of tabs; a fresh tab shows a launcher for Review, Terminal and Open file.
  const [tabs, setTabs] = useState<(Tab | "new")[]>(["new"]);
  const [current, setCurrent] = useState(0);
  const tab = tabs[current] ?? "new";
  const openKind = useCallback(
    (k: Tab) => {
      setTabs((t) => {
        const existing = t.indexOf(k);
        if (existing >= 0) {
          setCurrent(existing);
          return t;
        }
        const next = [...t];
        next[current] = k;
        return next;
      });
    },
    [current],
  );

  useEffect(() => {
    if (request) openKind(request.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.altKey)) return;
      const k = e.key.toLowerCase();
      if (k === "r") openKind("changes");
      else if (k === "t") openKind("activity");
      else if (k === "p") openKind("files");
      else if (k === "c") openKind("context");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKind]);

  const close = (i: number) => {
    setTabs((t) => {
      const next = t.filter((_, j) => j !== i);
      return next.length ? next : ["new"];
    });
    setCurrent((c) => Math.max(0, c >= i ? c - 1 : c));
  };

  return (
    <aside style={{ width }} className="hidden shrink-0 flex-col overflow-hidden rounded-[10px] bg-background shadow-raised lg:flex">
      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
        {tabs.map((k, i) => (
          <div
            key={i}
            onClick={() => setCurrent(i)}
            className={`group flex h-7 max-w-40 cursor-pointer items-center gap-1.5 rounded-[6px] pl-2 pr-1 text-[13px] ${i === current ? "bg-layer-2 text-foreground" : "text-faint hover:text-foreground"}`}
          >
            {k !== "new" && <Icon name={kinds[k].icon} size={14} />}
            <span className="truncate">{k === "new" ? "New tab" : kinds[k].label}</span>
            <button
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                close(i);
              }}
              className="flex size-4 items-center justify-center rounded-[4px] text-faint hover:text-foreground"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
        <button
          aria-label="New tab"
          onClick={() => {
            setTabs((t) => [...t, "new"]);
            setCurrent(tabs.length);
          }}
          className="flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-accent hover:text-foreground"
        >
          <Icon name="plus" />
        </button>
        <button aria-label="Hide panel" onClick={onClose} className="ml-auto flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-accent hover:text-foreground">
          <Icon name="layout-right" />
        </button>
      </div>
      {tab === "new" && (
        <div className="space-y-2 p-4 pt-8">
          {(["changes", "activity", "files"] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => openKind(k)}
              className="flex h-10 w-full items-center gap-2 rounded-[8px] bg-btn-neutral px-3 text-[13px] font-medium shadow-btn hover:brightness-110"
            >
              <Icon name={kinds[k].icon} className="text-faint" />
              <span className="flex-1 text-left">{kinds[k].label}</span>
              {["Ctrl", "Alt", kinds[k].keys].map((key) => (
                <kbd key={key} className="rounded-[4px] bg-layer-2 px-1 font-sans text-[10px] font-medium text-muted-foreground">
                  {key.toUpperCase()}
                </kbd>
              ))}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "context" && <ContextView conv={conv} />}
        {tab === "files" &&
          (conv.cwd ? (
            <>
              <Tree key={treeKey} root={conv.cwd} rel="" depth={0} onOpen={open} openPath={file?.rel ?? null} />
              {fileErr && <p className="mt-2 text-xs text-destructive">{fileErr}</p>}
              {file && (
                <div className="mt-3 rounded-lg border border-border bg-background">
                  <div className="truncate border-b border-border px-2 py-1 font-mono text-xs text-muted-foreground">{file.rel}</div>
                  {file.binary ? (
                    <p className="p-2 text-xs text-muted-foreground">Binary file — no preview.</p>
                  ) : (
                    <pre className="max-h-96 overflow-auto p-2 font-mono text-xs">{file.content}{file.truncated ? "\n… (truncated)" : ""}</pre>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="p-2 text-xs text-muted-foreground">Select a project folder to browse its files.</p>
          ))}

        {tab === "changes" &&
          (changes.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No file changes in this conversation yet.</p>
          ) : (
            changes.map((c) => (
              <details key={c.path} className="mb-2 rounded-lg border border-border bg-background" open>
                <summary className="flex cursor-pointer items-center gap-1 px-2 py-1 text-xs">
                  <FilePen size={12} className="text-primary" />
                  <span className="truncate font-mono" title={c.path}>
                    {c.path.split(/[\\/]/).slice(-2).join("/")}
                  </span>
                  <span className="ml-auto text-muted-foreground">{c.calls.length}×</span>
                </summary>
                {c.calls.map((x) => (
                  <pre key={x.id} className="max-h-60 overflow-auto border-t border-border p-2 font-mono text-[11px] leading-snug">
                    {x.removed && <span className="block whitespace-pre-wrap bg-red-500/10 text-destructive">{x.removed.split("\n").map((l) => `- ${l}`).join("\n")}</span>}
                    {x.added && <span className="block whitespace-pre-wrap bg-green-500/10 text-success">{x.added.split("\n").map((l) => `+ ${l}`).join("\n")}</span>}
                  </pre>
                ))}
              </details>
            ))
          ))}

        {tab === "activity" &&
          (commands.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No commands run yet. Terminal activity from Claude appears here.</p>
          ) : (
            commands.map((t) => {
              const inp = parseInput(t);
              return (
                <div key={t.id} className="mb-2 rounded-lg border border-border bg-background text-xs">
                  <div className="flex items-start gap-1 px-2 py-1 font-mono">
                    <Terminal size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="whitespace-pre-wrap break-all">{String(inp.command ?? t.input)}</span>
                    {t.result !== undefined && (t.isError ? <XCircle size={12} className="ml-auto shrink-0 text-destructive" /> : <CheckCircle2 size={12} className="ml-auto shrink-0 text-success" />)}
                  </div>
                  {t.denied?.state === "pending" && <div className="border-t border-border px-2 py-1 text-warning">Waiting for approval in chat</div>}
                  {t.result && <pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t border-border px-2 py-1 font-mono text-muted-foreground">{t.result}</pre>}
                </div>
              );
            })
          ))}
      </div>
    </aside>
  );
}

/** opencode-style context sheet: label over value, one per line. */
function ContextView({ conv }: { conv: Conversation }) {
  const st = conv.stats;
  const n = (v?: number) => (v === undefined ? "—" : v.toLocaleString());
  const users = conv.messages.filter((m) => m.role === "user").length;
  const assistants = conv.messages.filter((m) => m.role === "assistant").length;
  const tools = conv.messages.reduce((a, m) => a + m.tools.length, 0);
  const pct = st?.contextWindow ? Math.round((st.tokens / st.contextWindow) * 100) : undefined;
  const rows: [string, string][] = [
    ["Session", conv.title],
    ["Messages", n(conv.messages.length)],
    ["Provider", "Claude Code"],
    ["Model", st?.model ?? (conv.model === "default" ? "Default" : conv.model)],
    ["Context Limit", n(st?.contextWindow)],
    ["Total Tokens", n(st?.tokens)],
    ["Usage", pct === undefined ? "—" : `${pct}%`],
    ["Input Tokens", n(st?.input)],
    ["Output Tokens", n(st?.output)],
    ["Cache Tokens (read/write)", st ? `${n(st.cacheRead)} / ${n(st.cacheWrite)}` : "—"],
    ["User Messages", n(users)],
    ["Assistant Messages", n(assistants)],
    ["Tool Calls", n(tools)],
    ["Total Cost", st ? `$${st.cost.toFixed(2)}` : "—"],
    ["Last Activity", new Date(conv.updatedAt).toLocaleString()],
  ];
  return (
    <div className="space-y-4 px-3 py-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <div className="text-[13px] text-faint">{k}</div>
          <div className="text-[14px] font-medium">{v}</div>
        </div>
      ))}
      <p className="text-[12px] leading-4 text-faint">Figures come from the Claude Code CLI after each reply. On a subscription, cost is what the same usage would cost on the API.</p>
    </div>
  );
}
