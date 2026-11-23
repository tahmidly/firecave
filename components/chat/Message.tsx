"use client";

import type { ChatMessage, ToolCall } from "@/shared/types";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import { ToolCard } from "./ToolCard";

interface Props {
  message: ChatMessage;
  isLast: boolean;
  running: boolean;
  onRegenerate: () => void;
  onAllow: (t: ToolCall) => void;
  onReject: (t: ToolCall) => void;
}

/** opencode-style turn: user text in a soft bubble on the right, assistant as plain text with compact tool rows. */
export function Message({ message: m, isLast, running, onRegenerate, onAllow, onReject }: Props) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(82%,64ch)] whitespace-pre-wrap rounded-[10px] bg-layer-2 px-3 py-2 text-[14px] leading-[150%]">{m.text}</div>
      </div>
    );
  }

  const streaming = running && isLast;
  return (
    <div className="group space-y-1">
      {m.tools.length > 0 && (
        <div className="space-y-0.5">
          {m.tools.map((t) => (
            <ToolCard key={t.id} tool={t} running={streaming} canAct={!running} onAllow={onAllow} onReject={onReject} />
          ))}
        </div>
      )}
      {m.text ? (
        <div className="pt-1 text-[14px]">
          <Markdown>{m.text}</Markdown>
        </div>
      ) : streaming ? (
        <div className="flex h-7 items-center gap-2 text-[13px] text-faint">
          <span className="size-4 animate-spin rounded-full border-[1.5px] border-faint border-t-transparent" />
          <span className="shimmer">Thinking…</span>
        </div>
      ) : null}
      {m.text && streaming && (
        <div className="flex h-6 items-center gap-2 text-[13px] text-faint">
          <span className="shimmer">Working…</span>
        </div>
      )}
      {m.text && !streaming && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={m.text} />
          {isLast && (
            <button onClick={onRegenerate} aria-label="Retry" className="flex size-6 items-center justify-center rounded-[4px] text-faint hover:bg-accent hover:text-foreground">
              <Icon name="refresh" size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
