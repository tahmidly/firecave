"use client";

import { useEffect, useMemo, useState } from "react";
import { Moon, MoreHorizontal, Puzzle, Search, Sun, Trash2 } from "lucide-react";
import type { Conversation } from "@/shared/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { RemoteQuickToggle } from "@/components/RemoteSection";
import { cn } from "@/lib/utils";

interface Props {
  list: Conversation[];
  activeId: string | null;
  busy: boolean;
  theme: "dark" | "light";
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onCollapse: () => void;
  onSettings: () => void;
  onPlugins: () => void;
  onPairing?: () => void;
  onToggleTheme: () => void;
  width?: number;
}

const DAY = 86_400_000;

function group(c: Conversation, now: number): string {
  const startToday = new Date(now).setHours(0, 0, 0, 0);
  if (c.updatedAt >= startToday) return "Today";
  if (c.updatedAt >= startToday - DAY) return "Yesterday";
  if (c.updatedAt >= startToday - 7 * DAY) return "Previous 7 days";
  return "Older";
}

/** Project avatar: a coloured square with the folder's initial (opencode style). */
const AVATAR = ["#3b5cf6", "#198b43", "#cb9f34", "#b82d35", "#8b46c9", "#0e8a8a"];
function Avatar({ name }: { name: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-semibold uppercase text-white" style={{ background: AVATAR[h % AVATAR.length] }}>
      {name[0] ?? "?"}
    </span>
  );
}

/** One dense sidebar row: icon + label, keyboard-hint style secondary text on hover. */
function NavRow({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13px] leading-4 text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground"
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="hidden text-[11px] text-faint group-hover:block">{hint}</span>}
    </button>
  );
}

export function Sidebar({ list, activeId, busy, theme, onSelect, onNew, onDelete, onCollapse, onSettings, onPlugins, onPairing, onToggleTheme, width = 264 }: Props) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  /** Multi-select: Ctrl/Cmd+click toggles, Shift+click selects a range, the checkbox toggles too. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const selecting = selected.size > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(new Set());
        setConfirming(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Forget selections for sessions that no longer exist.
  useEffect(() => {
    setSelected((sel) => {
      const ids = new Set(list.map((c) => c.id));
      const next = new Set([...sel].filter((id) => ids.has(id)));
      return next.size === sel.size ? sel : next;
    });
  }, [list]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const now = Date.now();
    const filtered = [...list]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      // A session only shows up once something has been sent in it.
      .filter((c) => c.messages.length > 0)
      .filter((c) => !s || c.title.toLowerCase().includes(s) || c.messages.some((m) => m.text.toLowerCase().includes(s)));
    const map = new Map<string, Conversation[]>();
    for (const c of filtered) {
      const g = group(c, now);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return [...map.entries()];
  }, [list, q]);

  const ordered = groups.flatMap(([, items]) => items);
  const emptyIds = list.filter((c) => c.messages.length === 0 && c.id !== activeId).map((c) => c.id);

  function toggle(id: string) {
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
    setConfirming(false);
  }

  function range(id: string) {
    const a = ordered.findIndex((c) => c.id === (anchor ?? activeId));
    const b = ordered.findIndex((c) => c.id === id);
    if (a < 0 || b < 0) return toggle(id);
    const [from, to] = a < b ? [a, b] : [b, a];
    setSelected((sel) => new Set([...sel, ...ordered.slice(from, to + 1).map((c) => c.id)]));
    setConfirming(false);
  }

  function deleteSelected() {
    for (const id of selected) onDelete(id);
    setSelected(new Set());
    setConfirming(false);
  }

  return (
    <aside style={{ width }} className="flex h-full max-w-[85vw] shrink-0 flex-col bg-deep pl-[11px] pr-[3px] text-sidebar-foreground">
      <div className="flex h-11 items-center gap-2 px-1">
        <Logo className="size-5 rounded-[5px]" />
        <span className="text-[13px] font-semibold tracking-tight">Firecave</span>
        <button onClick={onCollapse} aria-label="Hide sidebar" className="ml-auto flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-sidebar-accent hover:text-foreground">
          <Icon name="sidebar" />
        </button>
      </div>

      <div className="space-y-0.5 pb-2">
        <NavRow icon={<Icon name="new-session" />} label="New session" onClick={() => !busy && onNew()} />
        {searching ? (
          <div className="flex h-7 items-center gap-2 rounded-[6px] bg-sidebar-accent px-2">
            <Search className="size-4 text-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => !q && setSearching(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQ("");
                  setSearching(false);
                }
              }}
              placeholder="Search sessions"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
          </div>
        ) : (
          <NavRow icon={<Search className="size-4" />} label="Search" onClick={() => setSearching(true)} />
        )}
        <NavRow icon={<Puzzle className="size-4" />} label="Plugins" onClick={onPlugins} />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto pb-2">
        {groups.map(([label, items]) => (
          <div key={label} className="mb-3">
            <div className="flex h-7 items-center px-2 text-[12px] font-medium text-faint">{label}</div>
            {items.map((c) => {
              const project = c.cwd ? (c.cwd.split(/[\\/]/).pop() ?? c.cwd) : null;
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if (busy) return;
                    if (e.shiftKey) range(c.id);
                    else if (e.ctrlKey || e.metaKey || selecting) toggle(c.id);
                    else onSelect(c.id);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && !busy && onSelect(c.id)}
                  className={cn(
                    "group flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2 text-[13px] outline-none transition-colors",
                    selected.has(c.id)
                      ? "bg-primary/15 text-foreground"
                      : c.id === activeId
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                  )}
                  title={c.cwd ?? undefined}
                >
                  <span
                    role="checkbox"
                    aria-checked={selected.has(c.id)}
                    aria-label="Select session"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!busy) toggle(c.id);
                    }}
                    className="relative flex size-4 shrink-0 items-center justify-center"
                  >
                    <span className={cn("absolute inset-0 flex items-center justify-center", (selecting || selected.has(c.id)) ? "hidden" : "group-hover:hidden")}>
                      {project ? <Avatar name={project} /> : <Icon name="prompt" className="text-faint" />}
                    </span>
                    <span
                      className={cn(
                        "size-3.5 items-center justify-center rounded-[3px] shadow-[inset_0_0_0_1px_var(--border)]",
                        selected.has(c.id) ? "flex bg-primary text-white shadow-none" : selecting ? "flex" : "hidden group-hover:flex",
                      )}
                    >
                      {selected.has(c.id) && <Icon name="check" size={12} />}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {project && <span className="max-w-20 truncate text-[11px] text-faint group-hover:hidden">{project}</span>}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      onClick={(e) => e.stopPropagation()}
                      className="hidden size-5 items-center justify-center rounded-[4px] text-faint outline-none hover:text-foreground group-hover:flex data-[popup-open]:flex"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(c.id);
                        }}
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-faint">No sessions found</p>}
      </nav>

      {selecting ? (
        <div className="mb-1 rounded-[8px] bg-layer-1 p-1.5 shadow-raised">
          {confirming ? (
            <div className="space-y-1.5 px-1 py-0.5">
              <p className="text-[12px] leading-4 text-muted-foreground">
                Delete {selected.size} session{selected.size === 1 ? "" : "s"}? This can&apos;t be undone.
              </p>
              <div className="flex gap-1">
                <button onClick={deleteSelected} className="h-7 flex-1 rounded-[6px] bg-btn-neutral text-[13px] font-medium text-destructive shadow-btn hover:brightness-110">
                  Delete
                </button>
                <button onClick={() => setConfirming(false)} className="h-7 flex-1 rounded-[6px] text-[13px] text-muted-foreground hover:bg-accent">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="flex-1 px-1 text-[13px] font-medium">{selected.size} selected</span>
              <button onClick={() => setSelected(new Set(ordered.map((c) => c.id)))} className="h-7 rounded-[6px] px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground">
                All
              </button>
              <button
                aria-label="Delete selected"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="flex size-7 items-center justify-center rounded-[6px] text-destructive hover:bg-accent disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
              <button aria-label="Clear selection" onClick={() => setSelected(new Set())} className="flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-accent hover:text-foreground">
                <Icon name="close" />
              </button>
            </div>
          )}
        </div>
      ) : (
        emptyIds.length > 1 && (
          <button
            onClick={() => {
              setSelected(new Set(emptyIds));
              setConfirming(true);
            }}
            className="mb-1 h-7 rounded-[6px] px-2 text-left text-[12px] text-faint hover:bg-accent hover:text-foreground"
          >
            Clean up {emptyIds.length} empty sessions
          </button>
        )
      )}

      <RemoteQuickToggle onSettings={onPairing ?? onSettings} />
      <div className="flex items-center gap-0.5 pb-1">
        <div className="flex-1">
          <NavRow icon={<Icon name="settings-gear" />} label="Settings" onClick={onSettings} />
        </div>
        <button
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Light theme" : "Dark theme"}
          className="flex size-7 items-center justify-center rounded-[6px] text-faint hover:bg-sidebar-accent hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </aside>
  );
}
