import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { RemoteConfig } from "../shared/types";

type Handler = (...args: unknown[]) => unknown;

const MAX_BODY = 20 * 1024 * 1024;
const MAX_FAILS = 8;
const LOCKOUT_MS = 5 * 60_000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

// Marks the page as served by the remote server. A cookie (not injected HTML) keeps hydration clean.
const REMOTE_COOKIE = "lc_remote=1; Path=/; SameSite=Lax";

export function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function digest(s: string): Buffer {
  return crypto.createHash("sha256").update(s).digest();
}

export interface RemoteOptions {
  config: RemoteConfig;
  token: string;
  /** Only these channels are callable over the network. */
  handlers: Record<string, Handler>;
  /** Folder with the static Next export (production). */
  staticDir: string;
  /** In dev, proxy page requests to the Next dev server instead. */
  devProxyPort?: number;
}

/**
 * Optional HTTP server that lets another device on your network drive this app.
 * Everything under /api needs the bearer token; pages and assets are static and hold no secrets.
 */
export class RemoteServer {
  private server: http.Server | null = null;
  private sse = new Set<http.ServerResponse>();
  private fails = new Map<string, { n: number; until: number }>();
  private tokenDigest: Buffer = Buffer.alloc(0);
  private opts: RemoteOptions | null = null;
  lastError: string | undefined;

  get running(): boolean {
    return !!this.server?.listening;
  }
  get clients(): number {
    return this.sse.size;
  }

  setToken(token: string): void {
    this.tokenDigest = digest(token);
    // Drop existing event streams so old tokens stop receiving output.
    for (const r of this.sse) r.end();
    this.sse.clear();
  }

  urls(config: RemoteConfig): string[] {
    if (config.access === "local") return [`http://127.0.0.1:${config.port}`];
    const out: string[] = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) out.push(`http://${i.address}:${config.port}`);
    }
    return out.length ? out : [`http://127.0.0.1:${config.port}`];
  }

  /** Push any JSON message to every connected device (run output and sync updates share one stream). */
  broadcast(msg: object): void {
    if (this.sse.size === 0) return;
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const r of this.sse) r.write(data);
  }

  async start(opts: RemoteOptions): Promise<void> {
    await this.stop();
    this.opts = opts;
    this.lastError = undefined;
    this.setToken(opts.token);
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((e) => {
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Server error" }));
      });
    });
    if (opts.devProxyPort) {
      // Dev only: Next's hot-reload socket must reach the dev server too, or the page never hydrates.
      const port = opts.devProxyPort;
      server.on("upgrade", (req, socket, head) => {
        const up = net.connect(port, "127.0.0.1", () => {
          let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
          for (let i = 0; i < req.rawHeaders.length; i += 2) {
            const k = req.rawHeaders[i];
            const lower = k.toLowerCase();
            if (lower === "origin" || lower === "referer") continue;
            raw += `${k}: ${lower === "host" ? `127.0.0.1:${port}` : req.rawHeaders[i + 1]}\r\n`;
          }
          up.write(raw + "\r\n");
          if (head.length) up.write(head);
          socket.pipe(up);
          up.pipe(socket);
        });
        up.on("error", () => socket.destroy());
        socket.on("error", () => up.destroy());
      });
    }
    server.on("error", (e) => {
      this.lastError = e.message;
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(opts.config.port, opts.config.access === "lan" ? "0.0.0.0" : "127.0.0.1", () => resolve());
    }).catch((e: Error) => {
      this.lastError = e.message;
      throw e;
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    for (const r of this.sse) r.end();
    this.sse.clear();
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
  }

  private authorized(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const ip = req.socket.remoteAddress ?? "unknown";
    const f = this.fails.get(ip);
    if (f && f.until > Date.now()) {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "300" });
      res.end(JSON.stringify({ ok: false, error: "Too many failed attempts. Try again in a few minutes." }));
      return false;
    }
    const h = req.headers.authorization ?? "";
    const given = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (given && crypto.timingSafeEqual(digest(given), this.tokenDigest)) {
      this.fails.delete(ip);
      return true;
    }
    const n = (f?.n ?? 0) + 1;
    this.fails.set(ip, { n, until: n >= MAX_FAILS ? Date.now() + LOCKOUT_MS : 0 });
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
    return false;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const opts = this.opts!;
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");

    if (url.pathname.startsWith("/api/")) {
      res.setHeader("cache-control", "no-store");
      if (!this.authorized(req, res)) return;

      if (url.pathname === "/api/ping" && req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"ok":true}');
        return;
      }

      if (url.pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/event-stream", connection: "keep-alive", "x-accel-buffering": "no" });
        res.write(": connected\n\n");
        this.sse.add(res);
        const beat = setInterval(() => res.write(": hb\n\n"), 20_000);
        req.on("close", () => {
          clearInterval(beat);
          this.sse.delete(res);
        });
        return;
      }

      const m = /^\/api\/rpc\/([\w:.-]+)$/.exec(url.pathname);
      if (m && req.method === "POST") {
        const fn = Object.prototype.hasOwnProperty.call(opts.handlers, m[1]) ? opts.handlers[m[1]] : undefined;
        if (!fn) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Unknown channel" }));
          return;
        }
        const body = await readBody(req);
        const args = body ? (JSON.parse(body) as unknown) : [];
        const result = await fn(...(Array.isArray(args) ? args : []));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, result: result ?? null }));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end('{"ok":false,"error":"Not found"}');
      return;
    }

    if (opts.devProxyPort) return proxyDev(req, res, opts.devProxyPort);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    await serveStatic(opts.staticDir, url.pathname, res);
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function serveStatic(root: string, pathname: string, res: http.ServerResponse): Promise<void> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const rootAbs = path.resolve(root);
  let target = path.resolve(rootAbs, "." + rel);
  if (target !== rootAbs && !target.startsWith(rootAbs + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    if ((await fs.stat(target)).isDirectory()) target = path.join(target, "index.html");
    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    res.writeHead(200, ext === ".html" ? { "content-type": type, "set-cookie": REMOTE_COOKIE } : { "content-type": type });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found. Build the app first (npm run build:web).");
  }
}

function proxyDev(req: http.IncomingMessage, res: http.ServerResponse, port: number): void {
  // Next's dev server refuses requests whose Origin is a LAN address, which leaves other devices with a
  // blank page. Dev-only proxy, so present the request as local by dropping those headers.
  const { origin: _o, referer: _r, ...rest } = req.headers;
  const up = http.request(
    { host: "127.0.0.1", port, path: req.url, method: req.method, headers: { ...rest, host: `127.0.0.1:${port}`, "accept-encoding": "identity" } },
    (r) => {
      const html = String(r.headers["content-type"] ?? "").includes("text/html");
      res.writeHead(r.statusCode ?? 200, html ? { ...r.headers, "set-cookie": REMOTE_COOKIE } : r.headers);
      r.pipe(res);
    },
  );
  up.on("error", () => {
    res.writeHead(502);
    res.end("Dev server not reachable");
  });
  req.pipe(up);
}
