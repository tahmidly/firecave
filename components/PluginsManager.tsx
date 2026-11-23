"use client";

import { uid } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import type { Plugin, PluginKind, PluginsState } from "@/shared/types";
import { getApi } from "@/lib/transport";
import { Icon, type IconName } from "@/components/Icon";
import { Btn, Card, Field, Row, Segmented } from "@/components/settings-ui";
import { Switch } from "@/components/ui/switch";

const KINDS: { id: PluginKind; label: string; hint: string; icon: IconName }[] = [
  { id: "stdio", label: "Command", hint: "MCP server run on this PC", icon: "terminal" },
  { id: "http", label: "URL", hint: "Remote MCP server", icon: "globe" },
  { id: "folder", label: "Folder", hint: "Skills / commands bundle", icon: "folder" },
];

const PRESETS = [
  { name: "Memory", command: "npx", args: "-y @modelcontextprotocol/server-memory", note: "Remembers facts across a run" },
  { name: "Sequential Thinking", command: "npx", args: "-y @modelcontextprotocol/server-sequential-thinking", note: "Step-by-step reasoning tool" },
];

/** Split a command line into arguments, honouring "double quotes". */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2]);
  return out;
}

function parseEnv(s: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of s.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function describe(p: Plugin): string {
  if (p.kind === "stdio") return [p.command, ...(p.args ?? [])].join(" ");
  if (p.kind === "http") return p.url ?? "";
  return p.path ?? "";
}

/** Plugin manager body, used on the Settings → Extensions page. */
export function PluginsManager() {
  const api = getApi();
  const [state, setState] = useState<PluginsState | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<PluginKind>("stdio");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [url, setUrl] = useState("");
  const [folder, setFolder] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (api?.pluginsList) setState(await api.pluginsList());
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setAdding(false);
    setName("");
    setCommand("");
    setArgs("");
    setEnv("");
    setUrl("");
    setFolder("");
    setError(null);
  }

  const wrap = async (fn: () => Promise<PluginsState> | undefined) => {
    setError(null);
    try {
      const s = await fn();
      if (s) setState(s);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
      return false;
    }
  };

  async function add() {
    const p: Plugin = {
      id: uid(),
      name: name.trim(),
      kind,
      enabled: true,
      ...(kind === "stdio" ? { command: command.trim(), args: splitArgs(args), env: parseEnv(env) } : {}),
      ...(kind === "http" ? { url: url.trim() } : {}),
      ...(kind === "folder" ? { path: folder } : {}),
    };
    if (await wrap(() => api?.pluginsSave?.(p))) reset();
  }

  if (!api?.pluginsList) {
    return (
      <Card>
        <Row title="Managed on the computer" description="Plugins can only be changed in the desktop app, not from a remote device." />
      </Card>
    );
  }

  const canAdd = !!name.trim() && !(kind === "stdio" && !command.trim()) && !(kind === "http" && !url.trim()) && !(kind === "folder" && !folder);

  return (
    <>
      <Card title="Isolation">
        <Row
          title="Separate from Claude"
          description={
            state?.isolate
              ? "Nothing is synced. Your Claude Code plugins, claude.ai connectors and user settings are not used here, and plugins added below are never written to Claude's config."
              : "Claude Code's own connectors and plugins are also loaded in Code mode. Firecave plugins are still stored only here."
          }
        >
          <Switch checked={!!state?.isolate} onCheckedChange={(v) => void wrap(() => api.pluginsIsolate?.(v))} aria-label="Keep separate from Claude" />
        </Row>
      </Card>

      <Card
        title="Plugins"
        action={
          !adding && (
            <Btn onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> Add plugin
            </Btn>
          )
        }
      >
        {state?.plugins.length === 0 && !adding && <Row title="No plugins yet" description="Add one to give Claude new tools in Code mode." />}
        {state?.plugins.map((p) => {
          const K = KINDS.find((k) => k.id === p.kind)!;
          return (
            <Row
              key={p.id}
              title={
                <span className="flex items-center gap-2">
                  <Icon name={K.icon} className="text-faint" />
                  {p.name}
                  <span className="rounded-[4px] bg-layer-2 px-1.5 text-[11px] font-normal text-muted-foreground">{K.label}</span>
                </span>
              }
              description={
                <span className="block truncate font-mono text-[12px]" title={describe(p)}>
                  {describe(p)}
                </span>
              }
            >
              <Switch checked={p.enabled} onCheckedChange={(v) => void wrap(() => api.pluginsSave?.({ ...p, enabled: v }))} aria-label={`Enable ${p.name}`} />
              <button
                onClick={() => void wrap(() => api.pluginsDelete?.(p.id))}
                aria-label={`Remove ${p.name}`}
                className="flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-accent hover:text-destructive"
              >
                <Icon name="trash" />
              </button>
            </Row>
          );
        })}

        {adding && (
          <div className="space-y-4 border-t border-border py-4 first:border-t-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[14px] font-medium">New plugin</div>
                <div className="text-[13px] text-muted-foreground">{KINDS.find((k) => k.id === kind)!.hint}</div>
              </div>
              <Segmented value={kind} options={KINDS.map((k) => ({ id: k.id, label: k.label }))} onChange={setKind} />
            </div>

            {kind === "stdio" && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-faint">Presets</span>
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    title={p.note}
                    onClick={() => {
                      setName(p.name);
                      setCommand(p.command);
                      setArgs(p.args);
                    }}
                    className="h-6 rounded-[4px] bg-layer-2 px-2 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-2">
              <Field placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              {kind === "stdio" && (
                <>
                  <Field placeholder="Command, e.g. npx" value={command} onChange={(e) => setCommand(e.target.value)} className="font-mono" />
                  <Field placeholder='Arguments, e.g. -y @scope/server "C:\my folder"' value={args} onChange={(e) => setArgs(e.target.value)} className="font-mono" />
                  <textarea
                    placeholder={"Environment (optional), one per line\nAPI_KEY=…"}
                    value={env}
                    onChange={(e) => setEnv(e.target.value)}
                    rows={2}
                    className="resize-none rounded-[6px] bg-background px-2 py-1.5 font-mono text-[13px] shadow-[0_0_0_0.5px_var(--border),0_1px_1.5px_#0000001a] outline-none placeholder:text-faint focus:shadow-[0_0_0_1px_var(--ring)]"
                  />
                </>
              )}
              {kind === "http" && <Field placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono" />}
              {kind === "folder" && (
                <div className="flex gap-2">
                  <Field readOnly value={folder} placeholder="Plugin folder" className="flex-1 font-mono" />
                  <Btn
                    onClick={async () => {
                      const f = await api.selectFolder();
                      if (f) setFolder(f);
                    }}
                  >
                    Browse
                  </Btn>
                </div>
              )}
            </div>

            {kind === "stdio" && (
              <p className="flex gap-2 text-[12px] leading-4 text-muted-foreground">
                <Icon name="warning" size={14} className="text-warning" />
                This program runs on your PC with your permissions whenever Claude starts in Code mode. Only add commands you trust.
              </p>
            )}
            {error && <p className="text-[13px] text-destructive">{error}</p>}
            <div className="flex justify-end gap-1.5">
              <Btn variant="ghost" onClick={reset}>
                Cancel
              </Btn>
              <Btn variant="primary" disabled={!canAdd} onClick={() => void add()}>
                Add plugin
              </Btn>
            </div>
          </div>
        )}
      </Card>
      {!adding && error && <p className="-mt-6 mb-6 text-[13px] text-destructive">{error}</p>}

      <p className="text-[13px] leading-5 text-faint">
        Plugins apply to new messages in Code mode. Chat mode never uses tools. When a plugin tool needs approval, an Allow once card appears in the chat.
      </p>
    </>
  );
}
