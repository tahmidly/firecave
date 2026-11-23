import { safeStorage } from "electron";
import type { ApiProvider, ApiProviderInput, ClaudeEvent, ProviderStatus, RunMessage, RunOptions } from "../shared/types";
import { getSettings, setSetting } from "./db";

/**
 * Custom API providers the user adds with their own key.
 * The list (no keys) lives in settings "apiProviders"; each key is encrypted with Windows DPAPI via Electron safeStorage
 * under "apiKey:<id>" and is only ever decrypted here, in the main process, to send a request. It never reaches a window.
 */

const LIST_KEY = "apiProviders";
const keyName = (id: string) => `apiKey:${id}`;

export const API_DEFAULT_URL: Record<ApiProvider["kind"], string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
};

export function listApiProviders(): ApiProvider[] {
  try {
    const raw = JSON.parse(getSettings()[LIST_KEY] ?? "[]") as Omit<ApiProvider, "hasKey">[];
    const s = getSettings();
    return raw.map((p) => ({ ...p, hasKey: !!s[keyName(p.id)] }));
  } catch {
    return [];
  }
}

function writeList(list: ApiProvider[]) {
  setSetting(LIST_KEY, JSON.stringify(list.map(({ hasKey: _h, ...p }) => p)));
}

export function saveApiProvider(input: ApiProviderInput): ApiProvider[] {
  if (!input || typeof input.id !== "string" || !/^[\w-]{8,64}$/.test(input.id)) throw new Error("Invalid provider id");
  const name = String(input.name ?? "").trim();
  if (!/^[A-Za-z0-9][\w .()-]{0,39}$/.test(name)) throw new Error("Name: letters, numbers, spaces, - . _ ( ) (max 40)");
  if (!["openai", "anthropic", "gemini"].includes(input.kind)) throw new Error("Unknown provider type");
  let url: URL;
  try {
    url = new URL(String(input.baseUrl || API_DEFAULT_URL[input.kind]));
  } catch {
    throw new Error("Enter a valid base URL");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error("Base URL must use https (http is allowed for localhost only)");
  const models = (input.models ?? []).map((m) => String(m).trim()).filter(Boolean);
  if (!models.length || models.length > 30 || models.some((m) => m.length > 120 || /[\s/?#]/.test(m) && input.kind === "gemini")) throw new Error("Add at least one model id");
  const list = listApiProviders().filter((p) => p.id !== input.id);
  const entry: ApiProvider = { id: input.id, name, kind: input.kind, baseUrl: url.toString().replace(/\/+$/, ""), models, hasKey: false };
  if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure storage is not available on this computer");
    setSetting(keyName(input.id), safeStorage.encryptString(input.apiKey.trim()).toString("base64"));
  }
  writeList([...list, entry]);
  return listApiProviders();
}

export function deleteApiProvider(id: string): ApiProvider[] {
  writeList(listApiProviders().filter((p) => p.id !== id));
  setSetting(keyName(id), "");
  return listApiProviders();
}

function readKey(id: string): string | null {
  const enc = getSettings()[keyName(id)];
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, "base64"));
  } catch {
    return null;
  }
}

export function apiProviderStatuses(): ProviderStatus[] {
  return listApiProviders().map((p) => ({
    id: `api:${p.id}`,
    name: p.name,
    installed: true,
    loggedIn: p.hasKey || !p.baseUrl.startsWith("https://"),
    kind: "api",
    models: p.models,
    hint: p.hasKey ? undefined : "Add an API key in Settings → Providers",
  }));
}

type Turn = { role: "user" | "assistant"; text: string };

/** Read a Server-Sent Events body and hand each JSON "data:" payload to onData. */
async function readSse(body: ReadableStream<Uint8Array>, onData: (d: Record<string, unknown>) => void) {
  // Decode by hand: TextDecoderStream's typings don't line up with fetch bodies in this TypeScript version.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        onData(JSON.parse(payload) as Record<string, unknown>);
      } catch {
        /* ignore keep-alives and partial frames */
      }
    }
  }
}

const runs = new Map<string, AbortController>();

export function cancelApiRun(runId: string): boolean {
  const c = runs.get(runId);
  if (!c) return false;
  c.abort();
  return true;
}

/**
 * Stream a chat reply from a custom API provider. Chat only: no tools, files or commands.
 * Output is translated into the same events Claude Code produces, so the UI treats it the same way.
 */
export async function startApiRun(opts: RunOptions, emit: (m: RunMessage) => void): Promise<{ ok: boolean; error?: string }> {
  const id = String(opts.provider ?? "").slice(4);
  const p = listApiProviders().find((x) => x.id === id);
  if (!p) return { ok: false, error: "Provider not found" };
  const key = readKey(p.id);
  if (!key && p.baseUrl.startsWith("https://")) return { ok: false, error: `No API key saved for ${p.name}` };
  const model = opts.model && opts.model !== "default" ? opts.model : p.models[0];
  const history: Turn[] = [...(opts.history ?? []).slice(-60), { role: "user", text: opts.prompt }];

  const ctl = new AbortController();
  runs.set(opts.runId, ctl);
  const ev = (event: ClaudeEvent) => emit({ runId: opts.runId, kind: "event", event });
  const text = (t: string) => t && ev({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: t } } });
  let usage = { input_tokens: 0, output_tokens: 0 };

  void (async () => {
    let code = 0;
    try {
      ev({ type: "system", subtype: "init", model });
      let res: Response;
      if (p.kind === "openai") {
        res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          signal: ctl.signal,
          headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true }, messages: history.map((h) => ({ role: h.role, content: h.text })) }),
        });
        if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 400));
        await readSse(res.body, (d) => {
          const choice = (d.choices as { delta?: { content?: string } }[] | undefined)?.[0];
          if (choice?.delta?.content) text(choice.delta.content);
          const u = d.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
          if (u) usage = { input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 };
        });
      } else if (p.kind === "anthropic") {
        res = await fetch(`${p.baseUrl}/v1/messages`, {
          method: "POST",
          signal: ctl.signal,
          headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", ...(key ? { "x-api-key": key } : {}) },
          body: JSON.stringify({ model, max_tokens: 8192, stream: true, messages: history.map((h) => ({ role: h.role, content: h.text })) }),
        });
        if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 400));
        await readSse(res.body, (d) => {
          if (d.type === "content_block_delta") text(String((d.delta as { text?: string })?.text ?? ""));
          if (d.type === "message_start") usage.input_tokens = (d.message as { usage?: { input_tokens?: number } })?.usage?.input_tokens ?? 0;
          if (d.type === "message_delta") usage.output_tokens = (d.usage as { output_tokens?: number })?.output_tokens ?? usage.output_tokens;
        });
      } else {
        res = await fetch(`${p.baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
          method: "POST",
          signal: ctl.signal,
          headers: { "content-type": "application/json", ...(key ? { "x-goog-api-key": key } : {}) },
          body: JSON.stringify({ contents: history.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })) }),
        });
        if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 400));
        await readSse(res.body, (d) => {
          const parts = (d.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]?.content?.parts ?? [];
          for (const part of parts) if (part.text) text(part.text);
          const u = d.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
          if (u) usage = { input_tokens: u.promptTokenCount ?? 0, output_tokens: u.candidatesTokenCount ?? 0 };
        });
      }
      ev({ type: "result", is_error: false, total_cost_usd: 0, usage, modelUsage: { [model]: {} } });
    } catch (e) {
      if (!ctl.signal.aborted) {
        code = 1;
        const msg = e instanceof Error ? e.message : String(e);
        ev({ type: "result", is_error: true, result: `${p.name}: ${msg}` });
      }
    } finally {
      runs.delete(opts.runId);
      emit({ runId: opts.runId, kind: "exit", code: ctl.signal.aborted ? null : code, cancelled: ctl.signal.aborted });
    }
  })();
  return { ok: true };
}
