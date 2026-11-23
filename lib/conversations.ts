"use client";

import { uid } from "@/lib/utils";
import { getApi } from "@/lib/transport";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppMode, ChatMessage, Conversation, ToolCall } from "@/shared/types";

export type { ChatMessage, Conversation, ToolCall };

const LEGACY_KEY = "localclaw.conversations.v1";

export function newConversation(cwd: string | null = null, model = "default", mode: AppMode = "code"): Conversation {
  return { id: uid(), title: "New chat", cwd: mode === "chat" ? null : cwd, model, mode, messages: [], updatedAt: Date.now() };
}

function legacy(): Conversation[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

/**
 * Conversation list shared by every window and device.
 *
 * - Local edits are marked dirty and written out at most every 300 ms (so a streaming reply reaches other devices while it is typed).
 * - Edits from other devices arrive as sync messages and replace the local copy, unless this device has unsaved edits
 *   to that conversation or is currently running Claude in it.
 * - A resync (reconnect, window focus) re-reads the database to catch anything missed.
 */
export function useConversations(defaults: { cwd: string | null; model: string }) {
  const [list, setList] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef(list);
  listRef.current = list;
  /** Ids known to be stored already (used to notice deletions made elsewhere). */
  const stored = useRef(new Set<string>());
  /** Ids with local changes not yet written out. */
  const dirty = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  /** Conversation currently being written by a run on THIS device: incoming copies must not overwrite it. */
  const ownedRef = useRef<string | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const api = getApi();
    const current = listRef.current;
    if (api) {
      for (const id of dirty.current) {
        const c = current.find((x) => x.id === id);
        if (c) {
          stored.current.add(id);
          void api.dbSave(c);
        }
      }
    } else {
      try {
        localStorage.setItem(LEGACY_KEY, JSON.stringify(current));
      } catch {
        /* ignore */
      }
    }
    dirty.current.clear();
  }, []);

  const markDirty = useCallback(
    (id: string) => {
      dirty.current.add(id);
      if (!timer.current) timer.current = setTimeout(flush, 300);
    },
    [flush],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = getApi();
      let rows = api ? await api.dbList() : legacy();
      // One-time migration from the earlier localStorage store.
      if (api && rows.length === 0) {
        const old = legacy();
        if (old.length) {
          await Promise.all(old.map((c) => api.dbSave(c)));
          localStorage.removeItem(LEGACY_KEY);
          rows = old;
        }
      }
      if (cancelled) return;
      rows.forEach((c) => stored.current.add(c.id));
      if (rows.length) {
        setList(rows);
        setActiveId(rows[0].id);
      } else {
        const c = newConversation(defaultsRef.current.cwd, defaultsRef.current.model);
        setList([c]);
        setActiveId(c.id);
        markDirty(c.id);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [markDirty]);

  /** Take a conversation that changed elsewhere, unless this device is the one writing it. */
  const upsertIncoming = useCallback((incoming: Conversation) => {
    if (ownedRef.current === incoming.id || dirty.current.has(incoming.id)) return;
    stored.current.add(incoming.id);
    setList((prev) => (prev.some((c) => c.id === incoming.id) ? prev.map((c) => (c.id === incoming.id ? incoming : c)) : [incoming, ...prev]));
  }, []);

  const dropIncoming = useCallback(
    (id: string) => {
      if (ownedRef.current === id) return;
      stored.current.delete(id);
      dirty.current.delete(id);
      const next = listRef.current.filter((c) => c.id !== id);
      if (next.length === 0) {
        const c = newConversation(defaultsRef.current.cwd, defaultsRef.current.model);
        setList([c]);
        setActiveId(c.id);
        markDirty(c.id);
        return;
      }
      setList(next);
      setActiveId((cur) => (cur === id ? next[0].id : cur));
    },
    [markDirty],
  );

  /** Catch up with the database (after a reconnect, or when the window comes back to the front). */
  const resync = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    try {
      const rows = await api.dbList();
      const ids = new Set(rows.map((r) => r.id));
      rows.forEach(upsertIncoming);
      for (const c of listRef.current) if (!ids.has(c.id) && stored.current.has(c.id)) dropIncoming(c.id);
    } catch {
      /* offline: the next event or focus will retry */
    }
  }, [upsertIncoming, dropIncoming]);

  useEffect(() => {
    if (!loaded) return;
    const api = getApi();
    if (!api) return;
    const off = api.onSync((m) => {
      if (m.kind === "resync") void resync();
      else if (m.kind === "conv" && m.origin !== api.clientId) upsertIncoming(m.conversation);
      else if (m.kind === "deleted" && m.origin !== api.clientId) dropIncoming(m.id);
    });
    const onFocus = () => void resync();
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, [loaded, resync, upsertIncoming, dropIncoming]);

  const update = useCallback(
    (id: string, fn: (c: Conversation) => Conversation) => {
      setList((prev) => prev.map((c) => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c)));
      markDirty(id);
    },
    [markDirty],
  );

  const create = useCallback(
    (cwd: string | null, model: string, mode: AppMode = "code") => {
      const c = newConversation(cwd, model, mode);
      setList((prev) => [c, ...prev]);
      setActiveId(c.id);
      markDirty(c.id);
      return c;
    },
    [markDirty],
  );

  const remove = useCallback(
    (id: string) => {
      stored.current.delete(id);
      dirty.current.delete(id);
      void getApi()?.dbDelete(id);
      setList((prev) => {
        const gone = prev.find((c) => c.id === id);
        const mode: AppMode = gone?.mode ?? "code";
        const next = prev.filter((c) => c.id !== id);
        const sameMode = next.filter((c) => (c.mode ?? "code") === mode);
        if (sameMode.length === 0) {
          const c = newConversation(defaultsRef.current.cwd, defaultsRef.current.model, mode);
          setActiveId(c.id);
          queueMicrotask(() => markDirty(c.id));
          return [c, ...next];
        }
        setActiveId((cur) => (cur === id ? sameMode[0].id : cur));
        return next;
      });
    },
    [markDirty],
  );

  return { list, activeId, setActiveId, update, create, remove, loaded, ownedRef };
}
