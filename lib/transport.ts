"use client";

import type { LocalClawApi, RunMessage, SyncMessage } from "@/shared/types";
import { uid } from "@/lib/utils";

const TOKEN_KEY = "localclaw.remote.token";

/** True when this page was served by the desktop app's remote server (no Electron preload). */
export function isRemote(): boolean {
  return typeof window !== "undefined" && !window.localclaw && document.cookie.split("; ").includes("lc_remote=1");
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(t: string): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Check a token against the server. Returns an error message, or null when it works. */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    const r = await fetch("/api/ping", { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return null;
    if (r.status === 429) return "Too many attempts. Wait a few minutes and try again.";
    return "That access token is not valid.";
  } catch {
    return "Cannot reach the desktop app.";
  }
}

async function rpc<T>(channel: string, args: unknown[]): Promise<T> {
  const r = await fetch(`/api/rpc/${channel}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (r.status === 401) {
    setToken("");
    location.reload();
  }
  const j = (await r.json()) as { ok: boolean; result?: T; error?: string };
  if (!j.ok) throw new Error(j.error ?? "Request failed");
  return j.result as T;
}

const CLIENT_ID = uid();

function makeRemoteApi(): LocalClawApi {
  const runListeners = new Set<(m: RunMessage) => void>();
  const syncListeners = new Set<(m: SyncMessage) => void>();
  let streaming = false;

  const emitSync = (m: SyncMessage) => syncListeners.forEach((cb) => cb(m));
  const wanted = () => runListeners.size + syncListeners.size > 0;

  // One long-lived event stream (SSE over fetch so the token stays in a header).
  // Reconnects with backoff; after every reconnect the app is told to re-sync, so nothing is missed.
  async function pump() {
    if (streaming) return;
    streaming = true;
    let delay = 500;
    let first = true;
    while (wanted()) {
      const ctl = new AbortController();
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => ctl.abort(), 50_000); // server heartbeats every 20s
      };
      try {
        arm();
        const r = await fetch("/api/events", { headers: { Authorization: `Bearer ${getToken()}` }, signal: ctl.signal });
        if (!r.ok || !r.body) throw new Error(String(r.status));
        delay = 500;
        if (!first) emitSync({ kind: "resync" });
        first = false;
        const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          arm();
          buf += value;
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              const msg = JSON.parse(line.slice(6)) as RunMessage | SyncMessage;
              if ("runId" in msg) runListeners.forEach((cb) => cb(msg));
              else emitSync(msg);
            } catch {
              /* ignore malformed frame */
            }
          }
        }
      } catch {
        /* reconnect below */
      } finally {
        clearTimeout(watchdog);
      }
      await new Promise((res) => setTimeout(res, delay));
      delay = Math.min(delay * 2, 8000);
    }
    streaming = false;
  }

  // Phones suspend background tabs: catch up as soon as the page is visible again.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") emitSync({ kind: "resync" });
    });
  }

  return {
    clientId: CLIENT_ID,
    getStatus: () => rpc("claude:status", []),
    providersStatus: () => rpc("providers:status", []),
    selectFolder: () => rpc("dialog:folder", []),
    startRun: (o) => rpc("claude:start", [o]),
    cancelRun: (id) => rpc("claude:cancel", [id]),
    dbList: () => rpc("db:list", []),
    dbSave: (c) => rpc("db:save", [c, CLIENT_ID]),
    dbDelete: (id) => rpc("db:delete", [id, CLIENT_ID]),
    busyList: () => rpc("claude:busy", []),
    settingsGet: () => rpc("settings:get", []),
    settingsSet: (k, v) => rpc("settings:set", [k, v]),
    fsList: (root, rel) => rpc("fs:list", [root, rel]),
    fsRead: (root, rel) => rpc("fs:read", [root, rel]),
    onRunMessage: (cb) => {
      runListeners.add(cb);
      void pump();
      return () => {
        runListeners.delete(cb);
      };
    },
    onSync: (cb) => {
      syncListeners.add(cb);
      void pump();
      return () => {
        syncListeners.delete(cb);
      };
    },
  };
}

let remoteApi: LocalClawApi | undefined;

/** The API for this page: Electron IPC on the desktop, HTTP when opened from another device. */
export function getApi(): LocalClawApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (window.localclaw) return window.localclaw;
  if (isRemote()) return (remoteApi ??= makeRemoteApi());
  return undefined;
}
