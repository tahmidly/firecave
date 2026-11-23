"use client";

import { uid } from "@/lib/utils";
import { getApi, getToken, isRemote, verifyToken } from "@/lib/transport";
import { RemoteLogin } from "@/components/RemoteLogin";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { AppMode, ClaudeStatus, Effort, ProviderId, ProviderStatus, RunMessage, Settings } from "@/shared/types";
import { useConversations, type ChatMessage, type Conversation, type ToolCall } from "@/lib/conversations";
import { Sidebar } from "@/components/Sidebar";
import { RightPanel } from "@/components/RightPanel";
import { SettingsPage, type SettingsPageId } from "@/components/SettingsPage";
import { TitleBar } from "@/components/TitleBar";
import { Wordmark } from "@/components/Wordmark";
import { ProjectPicker } from "@/components/ProjectPicker";
import { ResizeHandle, usePaneWidth } from "@/components/ResizeHandle";
import { Composer } from "@/components/chat/Composer";
import { Message } from "@/components/chat/Message";
import { ruleFor } from "@/components/chat/ToolCard";

import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  // null = still checking. Remote devices must present a valid token before anything loads.
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isRemote()) return setAuthed(true);
    const t = getToken();
    if (!t) return setAuthed(false);
    void verifyToken(t).then((err) => setAuthed(!err));
  }, []);

  useEffect(() => {
    if (!authed) return;
    const api = getApi();
    if (api) api.settingsGet().then(setSettings);
    else setSettings({});
  }, [authed]);

  const change = useCallback((key: string, value: string) => {
    setSettings((s) => ({ ...(s ?? {}), [key]: value }));
    void getApi()?.settingsSet(key, value);
  }, []);

  if (authed === null) return <div className="h-screen bg-background" />;
  if (!authed) return <RemoteLogin onDone={() => setAuthed(true)} />;
  if (!settings) return <div className="h-screen bg-background" />;
  return <Chat settings={settings} onSetting={change} />;
}

function Chat({ settings, onSetting }: { settings: Settings; onSetting: (k: string, v: string) => void }) {
  const defaultModel = settings.defaultModel || "default";
  const { list, activeId, setActiveId, update, create, remove, loaded, ownedRef } = useConversations({
    cwd: settings.defaultDir || null,
    model: defaultModel,
  });
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  /** Conversations Claude is working on right now, on any device */
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [panel, setPanel] = useState(true);
  const [showSettings, setShowSettings] = useState<SettingsPageId | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [sidebarWidth, setSidebarWidth] = usePaneWidth("localclaw.sidebarWidth", 264, 180, 480);
  /** Asks the right panel to open a tab (e.g. Context when the usage readout is clicked). */
  const [panelRequest, setPanelRequest] = useState<{ kind: "context"; n: number } | null>(null);
  const [panelWidth, setPanelWidth] = usePaneWidth("localclaw.panelWidth", 320, 260, 640);
  /** Sessions shown as tabs in the title bar (opencode "top tabs" layout), remembered per device. */
  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("localclaw.tabs") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const small = () => typeof window !== "undefined" && window.innerWidth < 768;

  // Start with the sidebar closed on phones and narrow windows.
  useEffect(() => {
    if (small()) setSidebar(false);
  }, []);
  const { theme, setTheme, toggle: toggleTheme } = useTheme();
  const activeRun = useRef<{ runId: string; convId: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const api = typeof window !== "undefined" ? getApi() : undefined;
  const conv = list.find((c) => c.id === activeId) ?? null;
  const mode: AppMode = conv?.mode ?? "code";

  useEffect(() => {
    api?.getStatus().then(setStatus);
    api?.providersStatus?.().then(setProviders).catch(() => {});
  }, [api]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages]);

  const patchAssistant = useCallback(
    (convId: string, fn: (m: ChatMessage) => ChatMessage) => {
      update(convId, (c) => {
        const last = c.messages[c.messages.length - 1];
        if (!last || last.role !== "assistant") return c;
        return { ...c, messages: [...c.messages.slice(0, -1), fn(last)] };
      });
    },
    [update],
  );

  /** Patch a tool call wherever it lives in the conversation (approvals resolve after the turn). */
  const patchTool = useCallback(
    (convId: string, toolId: string, fn: (t: ToolCall) => ToolCall) => {
      update(convId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.tools.some((t) => t.id === toolId) ? { ...m, tools: m.tools.map((t) => (t.id === toolId ? fn(t) : t)) } : m)),
      }));
    },
    [update],
  );

  const handle = useCallback(
    (msg: RunMessage) => {
      const run = activeRun.current;
      if (!run || msg.runId !== run.runId) return;
      const id = run.convId;
      if (msg.kind === "stderr") {
        setLog((l) => [...l, msg.text.trim()]);
        return;
      }
      if (msg.kind === "exit") {
        activeRun.current = null;
        ownedRef.current = null;
        setRunId(null);
        if (msg.cancelled) patchAssistant(id, (m) => ({ ...m, text: m.text + "\n\n*(stopped)*" }));
        else if (msg.code) setLog((l) => [...l, `claude exited with code ${msg.code}`]);
        return;
      }
      const ev = msg.event;
      if (ev.type === "rate_limit_event") return;
      if (ev.type === "system" && typeof ev.session_id === "string") {
        const sid = ev.session_id;
        update(id, (c) => ({ ...c, sessionId: sid }));
      }
      if (ev.type === "system" && ev.subtype === "permission_denied" && typeof ev.tool_use_id === "string") {
        const reason = String(ev.message ?? "Permission required");
        const overridable = ev.decision_reason_type !== "safetyCheck";
        patchTool(id, ev.tool_use_id, (t) => ({ ...t, denied: { reason, overridable, state: "pending" } }));
      } else if (ev.type === "stream_event") {
        const e = ev.event as { type?: string; delta?: { type?: string; text?: string }; content_block?: { type?: string } };
        if (e?.type === "content_block_start" && e.content_block?.type === "text") {
          // a new text block after a tool call: keep it from running into the previous sentence
          patchAssistant(id, (m) => (m.text && !/\s$/.test(m.text) ? { ...m, text: m.text + "\n\n" } : m));
        }
        if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
          const t = e.delta.text;
          patchAssistant(id, (m) => ({ ...m, text: m.text + t }));
        }
      } else if (ev.type === "assistant") {
        const content = (ev.message as { content?: Array<Record<string, unknown>> })?.content ?? [];
        for (const c of content) {
          if (c.type === "tool_use") {
            const call: ToolCall = { id: String(c.id), name: String(c.name), input: JSON.stringify(c.input) };
            patchAssistant(id, (m) => (m.tools.some((t) => t.id === call.id) ? m : { ...m, tools: [...m.tools, call] }));
          }
        }
      } else if (ev.type === "user") {
        const content = (ev.message as { content?: unknown })?.content;
        if (Array.isArray(content)) {
          for (const c of content as Array<Record<string, unknown>>) {
            if (c.type === "tool_result") {
              const raw = c.content;
              const text = typeof raw === "string" ? raw : JSON.stringify(raw);
              patchTool(id, String(c.tool_use_id), (t) => ({ ...t, result: text, isError: !!c.is_error }));
            }
          }
        }
      } else if (ev.type === "result") {
        if (typeof ev.session_id === "string") {
          const sid = ev.session_id;
          update(id, (c) => ({ ...c, sessionId: sid }));
        }
        if (ev.is_error && typeof ev.result === "string") patchAssistant(id, (m) => ({ ...m, text: m.text || `Error: ${ev.result}` }));
        const u = ev.usage as { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } | undefined;
        const cost = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : 0;
        if (u) {
          const tokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0);
          const mu = ev.modelUsage as Record<string, { contextWindow?: number }> | undefined;
          const model = mu ? Object.keys(mu)[0] : undefined;
          update(id, (c) => ({
            ...c,
            stats: {
              tokens,
              cost: (c.stats?.cost ?? 0) + cost,
              input: u.input_tokens ?? 0,
              output: u.output_tokens ?? 0,
              cacheRead: u.cache_read_input_tokens ?? 0,
              cacheWrite: u.cache_creation_input_tokens ?? 0,
              model: model ?? c.stats?.model,
              contextWindow: (model && mu?.[model]?.contextWindow) || c.stats?.contextWindow,
            },
          }));
        }
      }
    },
    [patchAssistant, patchTool, update, ownedRef],
  );

  useEffect(() => api?.onRunMessage(handle), [api, handle]);

  useEffect(() => {
    if (!activeId) return;
    setOpenTabs((t) => (t.includes(activeId) ? t : [...t, activeId]));
  }, [activeId]);

  useEffect(() => {
    if (!loaded) return;
    setOpenTabs((t) => t.filter((id) => list.some((c) => c.id === id)));
  }, [list, loaded]);

  useEffect(() => {
    try {
      localStorage.setItem("localclaw.tabs", JSON.stringify(openTabs));
    } catch {
      /* ignore */
    }
  }, [openTabs]);

  // Which chats are busy on any device (live) so a second device never talks over a running one.
  useEffect(() => {
    if (!api) return;
    const refresh = () => void api.busyList().then(setBusyIds).catch(() => {});
    refresh();
    return api.onSync((m) => {
      if (m.kind === "busy") setBusyIds(m.convIds);
      else if (m.kind === "resync") refresh();
    });
  }, [api]);

  async function run(c: Conversation, prompt: string, sessionId: string | undefined, allowedTools?: string[]) {
    if (!api) return;
    const id = uid();
    activeRun.current = { runId: id, convId: c.id };
    ownedRef.current = c.id;
    setRunId(id);
    const res = await api.startRun({
      runId: id,
      convId: c.id,
      prompt,
      cwd: c.cwd ?? undefined,
      provider: c.provider ?? "claude",
      // API providers keep no session: send the earlier turns along.
      history: c.provider?.startsWith("api:")
        ? (() => {
            // Everything before this prompt (a retry re-sends the same prompt, so drop it and what followed).
            const cut = c.messages.map((m) => m.role === "user" && m.text === prompt).lastIndexOf(true);
            const before = cut >= 0 ? c.messages.slice(0, cut) : c.messages;
            return before.filter((m) => m.text.trim()).slice(-60).map((m) => ({ role: m.role, text: m.text }));
          })()
        : undefined,
      model: c.model === "default" ? undefined : c.model,
      sessionId,
      mode: c.mode ?? "code",
      effort: c.effort && (c.effort as string) !== "default" ? (c.effort as Effort) : undefined,
      allowedTools,
      permissionMode: (settings.permissionMode as "acceptEdits" | "default" | "plan") || "acceptEdits",
    });
    if (!res.ok) {
      activeRun.current = null;
      ownedRef.current = null;
      setRunId(null);
      patchAssistant(c.id, (m) => ({ ...m, text: `Error: ${res.error}` }));
    }
  }

  function send() {
    const prompt = input.trim();
    if (!prompt || runId || !conv || busyHere) return;
    setInput("");
    update(conv.id, (c) => ({
      ...c,
      title: c.messages.length === 0 ? prompt.slice(0, 48) : c.title,
      messages: [
        ...c.messages,
        { id: uid(), role: "user", text: prompt, tools: [] },
        { id: uid(), role: "assistant", text: "", tools: [] },
      ],
    }));
    void run(conv, prompt, conv.sessionId);
  }

  function regenerate() {
    if (runId || !conv || busyHere) return;
    const msgs = conv.messages;
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // With a single exchange we can restart the session cleanly; otherwise resume it.
    const fresh = msgs.filter((m) => m.role === "user").length === 1;
    update(conv.id, (c) => ({
      ...c,
      sessionId: fresh ? undefined : c.sessionId,
      messages: [...c.messages.slice(0, -1), { id: uid(), role: "assistant", text: "", tools: [] }],
    }));
    void run(conv, lastUser.text, fresh ? undefined : conv.sessionId);
  }

  /** User approved one denied action: resume the session with an allow-rule for exactly that call. */
  function allow(t: ToolCall) {
    if (runId || !conv || busyHere) return;
    const rule = ruleFor(t);
    if (!rule) return;
    patchTool(conv.id, t.id, (x) => ({ ...x, denied: x.denied && { ...x.denied, state: "allowed" } }));
    update(conv.id, (c) => ({
      ...c,
      messages: [
        ...c.messages,
        { id: uid(), role: "user", text: `✔ Approved: ${t.name}`, tools: [] },
        { id: uid(), role: "assistant", text: "", tools: [] },
      ],
    }));
    void run(conv, "I approved that exact action. Please retry it now and continue with the task.", conv.sessionId, [rule]);
  }

  function reject(t: ToolCall) {
    if (!conv) return;
    patchTool(conv.id, t.id, (x) => ({ ...x, denied: x.denied && { ...x.denied, state: "rejected" } }));
  }

  function switchMode(next: AppMode) {
    if (running || next === mode) return;
    const latest = [...list].filter((c) => (c.mode ?? "code") === next).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) setActiveId(latest.id);
    else create(next === "code" ? settings.defaultDir || null : null, conv!.model, next);
  }

  async function pickFolder() {
    if (!conv || runId) return;
    const f = await api?.selectFolder();
    if (!f) return;
    setFolder(f);
  }

  /** Point the session at a folder: an empty session takes it, otherwise a new session starts there. */
  function setFolder(f: string | null) {
    if (!conv || runId) return;
    if (conv.messages.length === 0) update(conv.id, (c) => ({ ...c, cwd: f, mode: f ? "code" : c.mode }));
    else create(f, conv.model); // a project change starts a new conversation (new Claude session)
  }

  const provider: ProviderId = conv?.provider ?? "claude";
  const provStatus = providers.find((x) => x.id === provider);
  const ready = provider === "claude" ? !!(status?.installed && status.loggedIn) : !!(provStatus?.installed && provStatus.loggedIn);
  const running = !!runId;
  const busyHere = !!conv && busyIds.includes(conv.id);
  const busyElsewhere = busyHere && !running;

  if (!loaded || !conv) return <div className="h-screen bg-background" />;

  const lastIdx = conv.messages.length - 1;
  const empty = conv.messages.length === 0;

  // Tabs in the title bar: the open sessions, in the order they were opened.
  const tabs = openTabs.map((id) => list.find((c) => c.id === id)).filter((c): c is Conversation => !!c && (c.mode ?? "code") === mode);

  function closeTab(id: string) {
    const idx = openTabs.indexOf(id);
    const rest = openTabs.filter((t) => t !== id);
    setOpenTabs(rest);
    if (id === activeId) {
      const next = rest[Math.min(idx, rest.length - 1)];
      if (next) setActiveId(next);
      else create(mode === "code" ? settings.defaultDir || null : null, conv?.model ?? defaultModel, mode);
    }
  }

  const composer = (
    <Composer
      className={empty ? "max-w-none px-0 pb-0" : undefined}
      value={input}
      onChange={setInput}
      onSend={send}
      onStop={() => runId && api?.cancelRun(runId)}
      running={running}
      disabled={!ready || busyElsewhere}
      placeholder={busyElsewhere ? "Claude is working on this session from another device…" : ready ? "Ask anything…" : provider === "gemini" ? (provStatus?.installed ? "Gemini CLI is not signed in: run `gemini` in a terminal once" : "Gemini CLI not found") : "Claude Code is not ready"}
      cwd={conv.cwd}
      onPickFolder={pickFolder}
      model={conv.model}
      provider={provider}
      providers={providers}
      enabled={(settings.providersEnabled ?? "").split(",").filter(Boolean) as ProviderId[]}
      onModel={(m, prov) => {
        // Sessions belong to one CLI: switching provider mid-conversation starts a new session.
        if (prov !== provider && conv.messages.length > 0) {
          const next = create(conv.cwd, m, mode);
          update(next.id, (c) => ({ ...c, provider: prov }));
        } else update(conv.id, (c) => ({ ...c, model: m, provider: prov, sessionId: prov !== provider ? undefined : c.sessionId }));
      }}
      permission={settings.permissionMode || "acceptEdits"}
      onPermission={(v) => onSetting("permissionMode", v)}
      mode={mode}
      onMode={switchMode}
      effort={conv.effort ?? "default"}
      onEffort={(e) => update(conv.id, (c) => ({ ...c, effort: e as Effort }))}
    />
  );

  // Folders used in earlier sessions, most recent first (for the new-session project picker).
  const recent = [...new Set([...list].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => c.cwd).filter((c): c is string => !!c))].slice(0, 8);

  const usage = conv.stats;
  const project = conv.cwd ? (conv.cwd.split(/[\\/]/).pop() ?? conv.cwd) : null;

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-deep">
        {!small() && (
          <TitleBar
            tabs={tabs}
            activeId={activeId}
            busyIds={busyIds}
            onSelect={(id) => !running && setActiveId(id)}
            onClose={(id) => !running && closeTab(id)}
            onNew={() => !running && create(mode === "code" ? settings.defaultDir || conv.cwd : null, conv.model, mode)}
            onToggleSidebar={() => setSidebar((s) => !s)}
            onSearch={() => setSidebar(true)}
            onSettings={() => setShowSettings("preferences")}
            nativeControls={!!api?.setWindowTheme}
            platform={api?.platform}
            mode={mode}
            onMode={switchMode}
          />
        )}

        <div className="flex min-h-0 flex-1 gap-2 p-2 md:pt-0">
          {sidebar && (
            <div className="fixed inset-0 z-40 flex bg-deep md:static md:z-auto md:bg-transparent">
              <Sidebar
                list={list.filter((c) => (c.mode ?? "code") === mode)}
                activeId={activeId}
                busy={running}
                theme={theme}
                onSelect={(id) => {
                  setActiveId(id);
                  setShowSettings(null);
                  if (small()) setSidebar(false);
                }}
                onNew={() => {
                  create(mode === "code" ? settings.defaultDir || conv.cwd : null, conv.model, mode);
                  setShowSettings(null);
                  if (small()) setSidebar(false);
                }}
                onDelete={(id) => {
                  setOpenTabs((t) => t.filter((x) => x !== id));
                  remove(id);
                }}
                onCollapse={() => setSidebar(false)}
                onSettings={() => setShowSettings("preferences")}
                onPlugins={() => setShowSettings("extensions")}
                onPairing={() => setShowSettings("pairing")}
                onToggleTheme={toggleTheme}
                width={sidebarWidth}
              />
              <button aria-label="Close sidebar" className="flex-1 bg-black/50 md:hidden" onClick={() => setSidebar(false)} />
              <ResizeHandle side="right" width={sidebarWidth} onWidth={setSidebarWidth} />
            </div>
          )}

          {showSettings ? (
            <SettingsPage
              key={showSettings}
              initial={showSettings}
              settings={settings}
              status={status}
              theme={theme}
              onTheme={setTheme}
              onChange={onSetting}
              onBack={() => setShowSettings(null)}
            />
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-background shadow-raised">
                {!empty && (
                <header className="flex h-12 shrink-0 items-center gap-2 px-4">
                  {small() && (
                    <button onClick={() => setSidebar(true)} aria-label="Sessions" className="flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-accent">
                      <Icon name="menu" />
                    </button>
                  )}
                  <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-layer-4 text-[10px] font-semibold uppercase">
                      {(project ?? (mode === "chat" ? "C" : "L"))[0]}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{project ?? (mode === "chat" ? "Chat" : "No project")}</span>
                    <span className="text-faint">/</span>
                    <span className="truncate font-medium">{empty ? "New session" : conv.title}</span>
                    <button onClick={() => setSidebar(true)} aria-label="Session options" className="flex size-6 items-center justify-center rounded-[6px] text-faint hover:bg-accent hover:text-foreground">
                      <Icon name="outline-dots" />
                    </button>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    {!ready && status != null && <span className="text-[13px] text-destructive">{status.installed ? "Not signed in" : "Claude Code not found"}</span>}
                    {usage && (
                      <button
                        onClick={() => {
                          setPanel(true);
                          setPanelRequest({ kind: "context", n: Date.now() });
                        }}
                        className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Context used by the last turn, and total cost so far"
                      >
                        <span className="size-3.5 rounded-full border-[1.5px] border-faint" />
                        {usage.tokens >= 1000 ? `${Math.round(usage.tokens / 1000)}k` : usage.tokens}
                        <span className="text-faint">·</span>${usage.cost.toFixed(2)}
                      </button>
                    )}
                    {mode === "code" && !panel && (
                      <button onClick={() => setPanel(true)} aria-label="Show panel" className="hidden size-7 items-center justify-center rounded-[6px] text-faint hover:bg-accent hover:text-foreground lg:flex">
                        <Icon name="layout-right" />
                      </button>
                    )}
                  </div>
                </header>
                )}

                <main className="min-h-0 flex-1 overflow-y-auto">
                  {empty ? (
                    // opencode-style new session: big blocky wordmark, the composer, then the project row.
                    <div className="flex min-h-full flex-col items-center justify-center px-4 pb-24">
                      {small() && (
                        <button onClick={() => setSidebar(true)} aria-label="Sessions" className="absolute left-4 top-4 flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-accent">
                          <Icon name="menu" />
                        </button>
                      )}
                      <Wordmark className="mb-9 w-[560px] max-w-[70%] text-layer-2" />
                      <div className="w-full max-w-[880px]">
                        {composer}
                        {mode === "code" && <ProjectPicker cwd={conv.cwd} recent={recent} onPick={setFolder} onBrowse={pickFolder} onNone={() => setFolder(null)} />}
                      </div>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-[744px] space-y-5 px-4 py-6">
                      {conv.messages.map((m, i) => (
                        <Message key={m.id} message={m} isLast={i === lastIdx} running={running || busyHere} onRegenerate={regenerate} onAllow={allow} onReject={reject} />
                      ))}
                      <div ref={endRef} />
                    </div>
                  )}
                </main>

                {log.length > 0 && (
                  <div className="mx-auto w-full max-w-[744px] px-4 pb-2">
                    <pre className="max-h-20 overflow-auto rounded-[6px] bg-destructive/10 px-3 py-1.5 font-mono text-xs text-destructive">{log.slice(-4).join("\n")}</pre>
                  </div>
                )}

                {!empty && composer}
              </div>

              {(mode === "code" || panelRequest) && panel && !empty && (
                <>
                  <ResizeHandle side="left" width={panelWidth} onWidth={setPanelWidth} />
                  <RightPanel conv={conv} running={running || busyHere} onClose={() => setPanel(false)} width={panelWidth} request={panelRequest} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
