"use client";

import { useCallback, useEffect, useState } from "react";

/** Width that persists per device and can be dragged between min and max. */
export function usePaneWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(key));
      if (v >= min && v <= max) setWidth(v);
    } catch {
      /* ignore */
    }
  }, [key, min, max]);
  const set = useCallback(
    (w: number) => {
      const v = Math.round(Math.min(max, Math.max(min, w)));
      setWidth(v);
      try {
        localStorage.setItem(key, String(v));
      } catch {
        /* ignore */
      }
    },
    [key, min, max],
  );
  return [width, set] as const;
}

/**
 * Invisible drag strip on a pane edge (opencode style: a thin line shows on hover).
 * side="right" grows the pane when dragged right (left sidebar); side="left" grows it when dragged left (right panel).
 */
export function ResizeHandle({ width, onWidth, side }: { width: number; onWidth: (w: number) => void; side: "left" | "right" }) {
  const [drag, setDrag] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = width;
        setDrag(true);
        const move = (ev: PointerEvent) => onWidth(startW + (side === "right" ? ev.clientX - startX : startX - ev.clientX));
        const up = () => {
          setDrag(false);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      className="group relative z-10 -mx-1.5 hidden w-2 shrink-0 cursor-col-resize md:block"
    >
      <div className={`absolute inset-y-2 left-1/2 w-px -translate-x-1/2 transition-colors ${drag ? "bg-ring" : "bg-transparent group-hover:bg-border"}`} />
    </div>
  );
}
