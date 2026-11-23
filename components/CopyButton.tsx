"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      className="inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-[4px] px-1 text-[12px] text-faint transition-colors hover:bg-accent hover:text-foreground"
      onClick={async () => {
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
          else {
            // Plain-HTTP pages (remote devices) have no async clipboard API.
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            if (!ok) return;
          }
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} size={14} className={done ? "text-success" : undefined} />
      {label && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}
