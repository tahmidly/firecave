import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { app } from "electron";
import type { Conversation, Plugin, Settings } from "../shared/types";

let db: DatabaseSync | null = null;

function open(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(path.join(app.getPath("userData"), "localclaw.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cwd TEXT,
      model TEXT NOT NULL,
      session_id TEXT,
      updated_at INTEGER NOT NULL,
      messages TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

interface Row {
  id: string;
  title: string;
  cwd: string | null;
  model: string;
  session_id: string | null;
  updated_at: number;
  messages: string;
}

export function listConversations(): Conversation[] {
  const rows = open().prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all() as unknown as Row[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    cwd: r.cwd,
    model: r.model,
    sessionId: r.session_id ?? undefined,
    updatedAt: r.updated_at,
    messages: JSON.parse(r.messages),
  }));
}

export function saveConversation(c: Conversation): void {
  open()
    .prepare(
      `INSERT INTO conversations (id, title, cwd, model, session_id, updated_at, messages)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, cwd=excluded.cwd, model=excluded.model,
         session_id=excluded.session_id, updated_at=excluded.updated_at, messages=excluded.messages`,
    )
    .run(c.id, c.title, c.cwd, c.model, c.sessionId ?? null, c.updatedAt, JSON.stringify(c.messages));
}

export function deleteConversation(id: string): void {
  open().prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

export function getSettings(): Settings {
  const rows = open().prepare("SELECT key, value FROM settings").all() as unknown as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(key: string, value: string): void {
  open()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key, value);
}

export function knownProjectRoots(): string[] {
  const rows = open().prepare("SELECT DISTINCT cwd FROM conversations WHERE cwd IS NOT NULL").all() as unknown as { cwd: string }[];
  return rows.map((r) => r.cwd);
}

export function listPlugins(): Plugin[] {
  const rows = open().prepare("SELECT data FROM plugins").all() as unknown as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as Plugin).sort((a, b) => a.name.localeCompare(b.name));
}

export function savePlugin(p: Plugin): void {
  open()
    .prepare("INSERT INTO plugins (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data")
    .run(p.id, JSON.stringify(p));
}

export function deletePlugin(id: string): void {
  open().prepare("DELETE FROM plugins WHERE id = ?").run(id);
}
