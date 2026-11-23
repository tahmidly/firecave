export interface ClaudeStatus {
  installed: boolean;
  path?: string;
  version?: string;
  loggedIn: boolean;
  authMethod?: string;
  subscriptionType?: string;
  error?: string;
}

/** "claude", "gemini" (installed CLIs) or "api:<id>" for a custom API provider */
export type ProviderId = "claude" | "gemini" | `api:${string}`;

/** A custom provider reached with the user's own API key (chat only). The key itself never leaves the main process. */
export interface ApiProvider {
  id: string;
  name: string;
  kind: "openai" | "anthropic" | "gemini";
  baseUrl: string;
  models: string[];
  hasKey: boolean;
}

export interface ApiProviderInput extends Omit<ApiProvider, "hasKey"> {
  /** Only sent when adding or replacing the key */
  apiKey?: string;
}

/** An installed AI CLI Firecave can drive. Each keeps its own sign-in; Firecave never reads its credentials. */
export interface ProviderStatus {
  id: ProviderId;
  name: string;
  installed: boolean;
  loggedIn: boolean;
  version?: string;
  path?: string;
  hint?: string;
  /** "cli" (default) or "api" */
  kind?: "cli" | "api";
  /** Model ids, for API providers */
  models?: string[];
}

export interface RunOptions {
  /** Which installed CLI runs this turn (default: Claude Code) */
  provider?: ProviderId;
  /** Earlier turns, for API providers (they keep no session of their own) */
  history?: { role: "user" | "assistant"; text: string }[];
  /** For providers that take a session id up front */
  newSessionId?: string;
  runId: string;
  prompt: string;
  cwd?: string;
  model?: string;
  /** Claude session id to resume, if any */
  sessionId?: string;
  /** Exact tool rules the user approved for this run, e.g. Bash(mkdir x) */
  allowedTools?: string[];
  permissionMode?: "acceptEdits" | "default" | "plan";
  /** chat = plain conversation, no tools or files; code = project work with tools */
  mode?: AppMode;
  effort?: Effort;
  /** Which conversation this run belongs to, so every device can see it is busy */
  convId?: string;
  /** Set by the main process only: renderer-supplied values are discarded. */
  mcpConfig?: string;
  pluginDirs?: string[];
  isolate?: boolean;
}

export type AppMode = "chat" | "code";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** One parsed stream-json line from the Claude CLI. Shape is owned by the CLI. */
export type ClaudeEvent = Record<string, unknown> & { type: string };

export type RunMessage =
  | { runId: string; kind: "event"; event: ClaudeEvent }
  | { runId: string; kind: "stderr"; text: string }
  | { runId: string; kind: "exit"; code: number | null; cancelled: boolean };

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  result?: string;
  isError?: boolean;
  /** Set when the CLI denied this call and is waiting on the user */
  denied?: { reason: string; overridable?: boolean; state: "pending" | "allowed" | "rejected" };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolCall[];
}

export interface Conversation {
  id: string;
  title: string;
  cwd: string | null;
  model: string;
  provider?: ProviderId;
  mode?: AppMode;
  effort?: Effort;
  sessionId?: string;
  /** Context size of the last turn and total cost so far, from the CLI's result events */
  stats?: {
    tokens: number;
    cost: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    model?: string;
    contextWindow?: number;
    createdAt?: number;
  };
  messages: ChatMessage[];
  updatedAt: number;
}

export interface FsEntry {
  name: string;
  rel: string;
  isDir: boolean;
}

export interface FsFile {
  rel: string;
  content: string;
  truncated: boolean;
  binary: boolean;
}

export type Settings = Record<string, string>;

export type PluginKind = "stdio" | "http" | "folder";

/** A Firecave plugin. Stored in Firecave's own database; never read from or written to Claude's config. */
export interface Plugin {
  id: string;
  name: string;
  kind: PluginKind;
  enabled: boolean;
  /** stdio: program to run */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http: MCP endpoint */
  url?: string;
  /** folder: a Claude Code style plugin directory (skills, commands, agents) */
  path?: string;
}

export interface PluginsState {
  plugins: Plugin[];
  /** When true, runs ignore Claude Code's own plugins, connectors and user settings. */
  isolate: boolean;
}

export interface RemoteConfig {
  enabled: boolean;
  /** "local" = this computer only, "lan" = reachable from other devices on your network */
  access: "local" | "lan";
  port: number;
}

export interface RemoteInfo extends RemoteConfig {
  token: string;
  running: boolean;
  urls: string[];
  clients: number;
  error?: string;
}

/** Live updates pushed to every connected window and remote device. */
export type SyncMessage =
  | { kind: "conv"; origin: string; conversation: Conversation }
  | { kind: "deleted"; origin: string; id: string }
  | { kind: "busy"; convIds: string[] }
  /** Generated by the client itself after a reconnect or when the window regains focus */
  | { kind: "resync" };

export interface LocalClawApi {
  /** Identifies this window/device so it can ignore its own echoes */
  clientId: string;
  /** Desktop only: "win32", "darwin" or "linux" (decides where the window controls sit) */
  platform?: string;
  getStatus(): Promise<ClaudeStatus>;
  providersStatus(): Promise<ProviderStatus[]>;
  selectFolder(): Promise<string | null>;
  startRun(opts: RunOptions): Promise<{ ok: boolean; error?: string }>;
  cancelRun(runId: string): Promise<void>;
  onRunMessage(cb: (msg: RunMessage) => void): () => void;
  /** Remote-control management: only present in the desktop app, never over the network */
  apiProvidersList?(): Promise<ApiProvider[]>;
  apiProvidersSave?(p: ApiProviderInput): Promise<ApiProvider[]>;
  apiProvidersDelete?(id: string): Promise<ApiProvider[]>;
  pluginsList?(): Promise<PluginsState>;
  pluginsSave?(p: Plugin): Promise<PluginsState>;
  pluginsDelete?(id: string): Promise<PluginsState>;
  pluginsIsolate?(v: boolean): Promise<PluginsState>;
  /** Desktop only: recolour the native window-control area to match the theme */
  setWindowTheme?(dark: boolean): Promise<void>;
  remoteGet?(): Promise<RemoteInfo>;
  remoteSet?(cfg: RemoteConfig): Promise<RemoteInfo>;
  remoteRegenerate?(): Promise<RemoteInfo>;
  dbList(): Promise<Conversation[]>;
  dbSave(c: Conversation): Promise<void>;
  dbDelete(id: string): Promise<void>;
  busyList(): Promise<string[]>;
  onSync(cb: (msg: SyncMessage) => void): () => void;
  settingsGet(): Promise<Settings>;
  settingsSet(key: string, value: string): Promise<void>;
  fsList(root: string, rel: string): Promise<FsEntry[]>;
  fsRead(root: string, rel: string): Promise<FsFile>;
}
