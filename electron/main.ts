import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { cancelAll, cancelRun, getStatus, providersStatus, startRun } from "./claude";
import { deleteConversation, deletePlugin, getSettings, knownProjectRoots, listConversations, listPlugins, saveConversation, savePlugin, setSetting } from "./db";
import { approveRoot, isApprovedRoot, listDir, readFileSafe } from "./fs-safe";
import { RemoteServer, newToken } from "./remote";
import { deleteApiProvider, listApiProviders, saveApiProvider } from "./api-providers";
import type { Conversation, Plugin, SyncMessage, PluginsState, RemoteConfig, RemoteInfo, RunMessage, RunOptions } from "../shared/types";

const REMOTE_DEFAULT: RemoteConfig = { enabled: false, access: "lan", port: 3777 };
const SETTING_KEYS = new Set(["permissionMode", "defaultDir", "defaultModel", "providersEnabled"]);

const DEV = process.env.LOCALCLAW_DEV === "1";

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/**
 * Apps opened from the macOS Finder/Dock get a minimal PATH (no Homebrew, nvm or npm-global), so the claude and
 * gemini CLIs would not be found. Borrow the PATH from the user's login shell once at startup.
 */
if (process.platform === "darwin") {
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const out = execFileSync(shell, ["-ilc", 'printf "__PATH__%s__PATH__" "$PATH"'], { encoding: "utf8", timeout: 5000 });
    const found = /__PATH__(.*)__PATH__/.exec(out)?.[1];
    if (found) process.env.PATH = [...new Set([...found.split(":"), ...(process.env.PATH ?? "").split(":")])].filter(Boolean).join(":");
  } catch {
    process.env.PATH = [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin", `${process.env.HOME}/.npm-global/bin`].filter(Boolean).join(":");
  }
}
let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0c0a14",
    title: "Firecave",
    // macOS takes the app icon from the bundle; Windows and Linux use the file.
    ...(process.platform === "darwin" ? {} : { icon: path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png") }),
    // opencode-style frameless window: the app draws its own tab bar; Windows keeps native min/max/close buttons.
    // Frameless with native window controls: traffic lights on macOS, min/max/close overlay on Windows.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 14 } }
      : { titleBarStyle: "hidden" as const, titleBarOverlay: { color: "#0c0a14", symbolColor: "#b2a9cc", height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);

  if (DEV) win.loadURL("http://localhost:3210");
  else win.loadURL("app://firecave/");

  // Never let the renderer navigate away or open arbitrary windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("http://localhost:3210") && !url.startsWith("app://firecave/")) e.preventDefault();
  });
}

function validRunOptions(o: RunOptions): string | null {
  if (!o || typeof o.runId !== "string" || typeof o.prompt !== "string" || !o.prompt.trim()) return "Invalid run options";
  if (o.model && !/^[\w.\-[\]]+$/.test(o.model)) return "Invalid model";
  if (o.sessionId && !/^[0-9a-fA-F-]{36}$/.test(o.sessionId)) return "Invalid session id";
  if (o.cwd && !(existsSync(o.cwd) && statSync(o.cwd).isDirectory())) return "Project folder does not exist";
  if (o.cwd && !isApprovedRoot(o.cwd)) return "Project folder was not selected by the user";
  if (o.provider && o.provider !== "claude" && o.provider !== "gemini" && !/^api:[\w-]{8,64}$/.test(o.provider)) return "Invalid provider";
  if (o.history) {
    const bad = !Array.isArray(o.history) || o.history.length > 200 || o.history.some((h) => !h || (h.role !== "user" && h.role !== "assistant") || typeof h.text !== "string" || h.text.length > 200_000);
    if (bad) return "Invalid history";
  }
  if (o.newSessionId && !/^[0-9a-fA-F-]{36}$/.test(o.newSessionId)) return "Invalid session id";
  if (o.convId && !/^[\w-]{8,64}$/.test(o.convId)) return "Invalid conversation id";
  if (o.mode && o.mode !== "chat" && o.mode !== "code") return "Invalid mode";
  if (o.effort && !["low", "medium", "high", "xhigh", "max"].includes(o.effort)) return "Invalid effort";
  if (o.permissionMode && !["acceptEdits", "default", "plan"].includes(o.permissionMode)) return "Invalid permission mode";
  if (o.allowedTools) {
    const bad =
      !Array.isArray(o.allowedTools) ||
      o.allowedTools.length > 20 ||
      o.allowedTools.some((t) => typeof t !== "string" || t.length > 2000 || t.includes("*") || /[\r\n]/.test(t));
    if (bad) return "Invalid allowed tools";
  }
  return null;
}

const remote = new RemoteServer();

function remoteConfig(): RemoteConfig {
  const s = getSettings();
  const port = Number(s.remotePort);
  return {
    enabled: s.remoteEnabled === "1",
    access: s.remoteAccess === "local" ? "local" : "lan",
    port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : REMOTE_DEFAULT.port,
  };
}

function remoteToken(): string {
  let t = getSettings().remoteToken;
  if (!t) {
    t = newToken();
    setSetting("remoteToken", t);
  }
  return t;
}

function remoteInfo(): RemoteInfo {
  const cfg = remoteConfig();
  return { ...cfg, token: remoteToken(), running: remote.running, urls: remote.urls(cfg), clients: remote.clients, error: remote.lastError };
}

function pluginsState(): PluginsState {
  return { plugins: listPlugins(), isolate: getSettings().pluginsIsolate !== "0" };
}

/** Validate a plugin coming from the renderer; returns a clean copy or throws. */
function cleanPlugin(p: Plugin): Plugin {
  if (!p || typeof p.id !== "string" || !/^[\w-]{8,64}$/.test(p.id)) throw new Error("Invalid plugin id");
  const name = String(p.name ?? "").trim();
  if (!/^[A-Za-z0-9][\w .-]{0,39}$/.test(name)) throw new Error("Name: use letters, numbers, spaces, - . _ (max 40)");
  const base = { id: p.id, name, kind: p.kind, enabled: !!p.enabled };
  if (p.kind === "stdio") {
    const command = String(p.command ?? "").trim();
    if (!command || /[\r\n]/.test(command)) throw new Error("Command is required");
    const args = (p.args ?? []).map(String);
    if (args.length > 50 || args.some((a) => a.length > 2000 || /[\r\n]/.test(a))) throw new Error("Invalid arguments");
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.env ?? {})) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error("Invalid environment variable name: " + k);
      env[k] = String(v);
    }
    return { ...base, command, args, env };
  }
  if (p.kind === "http") {
    let u: URL;
    try {
      u = new URL(String(p.url ?? ""));
    } catch {
      throw new Error("Enter a valid URL");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("URL must be http or https");
    return { ...base, url: u.toString() };
  }
  if (p.kind === "folder") {
    const dir = String(p.path ?? "");
    if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) throw new Error("Folder does not exist");
    return { ...base, path: dir };
  }
  throw new Error("Unknown plugin type");
}

/** Build CLI plugin arguments from enabled Firecave plugins. Renderer input is never trusted for this. */
function pluginRunConfig(): { mcpConfig?: string; pluginDirs: string[]; isolate: boolean } {
  const { plugins, isolate } = pluginsState();
  const servers: Record<string, unknown> = {};
  const pluginDirs: string[] = [];
  for (const p of plugins) {
    if (!p.enabled) continue;
    const key = p.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || p.id;
    if (p.kind === "stdio") servers[key] = { command: p.command, args: p.args ?? [], env: p.env ?? {} };
    else if (p.kind === "http") servers[key] = { type: "http", url: p.url };
    else if (p.kind === "folder" && p.path) pluginDirs.push(p.path);
  }
  return { mcpConfig: Object.keys(servers).length ? JSON.stringify({ mcpServers: servers }) : undefined, pluginDirs, isolate };
}

const broadcastSync = (m: SyncMessage) => {
  win?.webContents.send("sync:message", m);
  remote.broadcast(m);
};

/** runId -> conversation id, so every device can tell which chats Claude is working on. */
const busyRuns = new Map<string, string>();
const busyIds = () => [...new Set(busyRuns.values())];

const broadcast = (m: RunMessage) => {
  win?.webContents.send("claude:message", m);
  remote.broadcast(m);
  if (m.kind === "exit" && busyRuns.delete(m.runId)) broadcastSync({ kind: "busy", convIds: busyIds() });
};


/** Channels shared by the desktop window (IPC) and, where allowed, remote devices (HTTP). */
const handlers: Record<string, (...args: any[]) => unknown> = {
  "claude:status": () => getStatus(),
  "providers:status": () => providersStatus(),
  "dialog:folder": async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    if (r.canceled) return null;
    approveRoot(r.filePaths[0]);
    return r.filePaths[0];
  },
  "db:list": () => listConversations(),
  "db:save": (c: Conversation, origin?: string) => {
    saveConversation(c);
    broadcastSync({ kind: "conv", origin: String(origin ?? ""), conversation: c });
  },
  "db:delete": (id: string, origin?: string) => {
    deleteConversation(String(id));
    broadcastSync({ kind: "deleted", origin: String(origin ?? ""), id: String(id) });
  },
  "claude:busy": () => busyIds(),
  "settings:get": () => {
    // Remote-control secrets never leave through the generic settings channel.
    const { remoteToken: _t, remoteEnabled: _e, remoteAccess: _a, remotePort: _p, apiProviders: _ap, ...rest } = getSettings();
    // Never hand encrypted API keys to a window either.
    return Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith("apiKey:")));
  },
  "settings:set": (k: string, v: string) => {
    if (!SETTING_KEYS.has(k) || typeof v !== "string") return;
    if (k === "defaultDir" && v) approveRoot(v);
    setSetting(k, v);
  },
  "fs:list": (root: string, rel: string) => listDir(String(root), String(rel)),
  "fs:read": (root: string, rel: string) => readFileSafe(String(root), String(rel)),
  "claude:start": async (opts: RunOptions) => {
    const err = validRunOptions(opts);
    if (err) return { ok: false, error: err };
    if (opts.mode === "chat") {
      // Chat mode never touches a project: run in an empty private folder with tools disabled.
      const dir = path.join(app.getPath("userData"), "chat");
      mkdirSync(dir, { recursive: true });
      opts = { ...opts, cwd: dir, allowedTools: undefined, mcpConfig: undefined, pluginDirs: undefined, isolate: undefined };
    } else {
      // Plugins always come from Firecave's own store, never from the caller.
      opts = { ...opts, ...pluginRunConfig() };
    }
    if (opts.convId) busyRuns.set(opts.runId, opts.convId);
    const res = await startRun(opts, broadcast);
    if (!res.ok) busyRuns.delete(opts.runId);
    else if (opts.convId) broadcastSync({ kind: "busy", convIds: busyIds() });
    return res;
  },
  "claude:cancel": (runId: string) => cancelRun(String(runId)),
};

/** What a remote device may call. No native dialogs, no remote-control settings. */
const remoteHandlers: Record<string, (...args: any[]) => unknown> = {
  ...handlers,
  "dialog:folder": () => null,
};

async function applyRemote(): Promise<void> {
  const cfg = remoteConfig();
  if (!cfg.enabled) {
    await remote.stop();
    remote.lastError = undefined;
    return;
  }
  try {
    await remote.start({
      config: cfg,
      token: remoteToken(),
      handlers: remoteHandlers,
      staticDir: path.join(__dirname, "..", "out"),
      devProxyPort: DEV ? 3210 : undefined,
    });
  } catch {
    /* error text is kept in remote.lastError and shown in Settings */
  }
}

app.whenReady().then(async () => {
  // Serve the static export from app://firecave/ so its absolute /_next/... paths resolve (file:// breaks them).
  const outDir = path.join(__dirname, "..", "out");
  protocol.handle("app", (req) => {
    let rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "");
    if (!rel || rel.endsWith("/")) rel += "index.html";
    let file = path.normalize(path.join(outDir, rel));
    if (!file.startsWith(outDir)) return new Response("Forbidden", { status: 403 });
    if (!existsSync(file) && existsSync(file + ".html")) file += ".html";
    if (!existsSync(file)) file = path.join(outDir, "index.html");
    return net.fetch(pathToFileURL(file).toString());
  });

  for (const root of knownProjectRoots()) approveRoot(root);
  for (const [ch, fn] of Object.entries(handlers)) ipcMain.handle(ch, (_e, ...args) => fn(...args));

  ipcMain.handle("window:theme", (_e, dark: boolean) => {
    if (!win || process.platform !== "win32") return;
    win.setBackgroundColor(dark ? "#0c0a14" : "#f6f3fd");
    // Opaque colour on purpose: a fully transparent overlay colour makes Electron close the window.
    win.setTitleBarOverlay({ color: dark ? "#0c0a14" : "#f6f3fd", symbolColor: dark ? "#b2a9cc" : "#5d5577", height: 40 });
  });

  // Remote-control management is desktop-only (IPC), never reachable over HTTP.
  // Plugin management is desktop-only too: adding one means running a program on this PC.
  // Custom API providers: desktop only. Keys go in, never out.
  ipcMain.handle("apiProviders:list", () => listApiProviders());
  ipcMain.handle("apiProviders:save", (_e, p) => saveApiProvider(p));
  ipcMain.handle("apiProviders:delete", (_e, id: string) => deleteApiProvider(String(id)));
  ipcMain.handle("plugins:list", () => pluginsState());
  ipcMain.handle("plugins:save", (_e, p: Plugin) => {
    savePlugin(cleanPlugin(p));
    return pluginsState();
  });
  ipcMain.handle("plugins:delete", (_e, id: string) => {
    deletePlugin(String(id));
    return pluginsState();
  });
  ipcMain.handle("plugins:isolate", (_e, v: boolean) => {
    setSetting("pluginsIsolate", v ? "1" : "0");
    return pluginsState();
  });
  ipcMain.handle("remote:get", () => remoteInfo());
  ipcMain.handle("remote:set", async (_e, cfg: RemoteConfig) => {
    const port = Number(cfg?.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be between 1024 and 65535");
    setSetting("remoteEnabled", cfg.enabled ? "1" : "0");
    setSetting("remoteAccess", cfg.access === "local" ? "local" : "lan");
    setSetting("remotePort", String(port));
    await applyRemote();
    return remoteInfo();
  });
  ipcMain.handle("remote:regenerate", async () => {
    const t = newToken();
    setSetting("remoteToken", t);
    remote.setToken(t);
    return remoteInfo();
  });

  createWindow();
  await applyRemote();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("before-quit", () => {
  cancelAll();
  void remote.stop();
});
app.on("window-all-closed", () => app.quit());
