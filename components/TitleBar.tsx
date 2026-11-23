"use client";

import type { Conversation } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

interface Props {
  tabs: Conversation[];
  activeId: string | null;
  busyIds: string[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onToggleSidebar: () => void;
  onSearch: () => void;
  onSettings: () => void;
  /** Leave room on the right for the native window buttons (desktop app only). */
  nativeControls: boolean;
  /** Desktop OS, to leave room for the native window controls on the right side */
  platform?: string;
  mode: "chat" | "code";
  onMode: (m: "chat" | "code") => void;
}

/** opencode-style top bar: menu, sessions, search, one tab per open session, then "+". Doubles as the window drag area. */
export function TitleBar(p: Props) {
  const iconBtn =
    "flex size-7 shrink-0 items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-accent hover:text-foreground [-webkit-app-region:no-drag]";
  return (
    <div className={cn("flex h-11 shrink-0 items-center gap-1 pl-3 [-webkit-app-region:drag]", !p.nativeControls ? "pr-3" : p.platform === "darwin" ? "pl-[84px] pr-3" : "pr-[150px]")}>
      <button className={iconBtn} onClick={p.onToggleSidebar} aria-label="Sessions">
        <Icon name="menu" />
      </button>
      <button className={iconBtn} onClick={p.onSettings} aria-label="Settings">
        <Icon name="grid-plus" />
      </button>
      <button className={iconBtn} onClick={p.onSearch} aria-label="Search sessions">
        <Icon name="magnifying-glass" />
      </button>

      {/* Chat / Code as tabs, like a segmented switch. */}
      <div role="tablist" className="ml-1 flex shrink-0 items-center rounded-[8px] bg-layer-2 p-0.5 [-webkit-app-region:no-drag]">
        {(
          [
            ["chat", "Chat", "prompt"],
            ["code", "Code", "code"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={p.mode === id}
            onClick={() => p.onMode(id)}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] transition-colors",
              p.mode === id ? "bg-background font-medium text-foreground shadow-btn" : "text-faint hover:text-foreground",
            )}
          >
            <Icon name={icon} size={14} />
            {label}
          </button>
        ))}
      </div>
      <div className="mx-1 h-4 w-px shrink-0 bg-border" />

      <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {p.tabs.map((c) => {
          const active = c.id === p.activeId;
          const project = c.cwd ? (c.cwd.split(/[\\/]/).pop() ?? "") : "";
          return (
            <div
              key={c.id}
              onClick={() => p.onSelect(c.id)}
              title={c.cwd ?? c.title}
              className={cn(
                "group flex h-7 w-56 min-w-28 shrink cursor-pointer items-center gap-2 rounded-[6px] pl-1.5 pr-1 text-[13px] [-webkit-app-region:no-drag]",
                active ? "bg-layer-2 font-medium text-foreground" : "text-faint hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-layer-4 text-[10px] font-semibold uppercase text-foreground">
                {p.busyIds.includes(c.id) ? <span className="size-2 animate-spin rounded-full border border-foreground border-t-transparent" /> : (project || c.title)[0] ?? "?"}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.messages.length === 0 ? "New session" : c.title}</span>
              <button
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  p.onClose(c.id);
                }}
                className={cn("flex size-5 items-center justify-center rounded-[4px] text-faint hover:text-foreground", !active && "opacity-0 group-hover:opacity-100")}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button className={iconBtn} onClick={p.onNew} aria-label="New session">
        <Icon name="plus" />
      </button>
    </div>
  );
}
