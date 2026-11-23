"use client";

import { useCallback, useEffect, useState } from "react";
import { getApi } from "@/lib/transport";

export type Theme = "dark" | "light";
export type Accent = "fire" | "purple";
const KEY = "localclaw.theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [accent, setAccentState] = useState<Accent>("fire");

  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setTheme(dark ? "dark" : "light");
    setAccentState(document.documentElement.getAttribute("data-accent") === "purple" ? "purple" : "fire");
    void getApi()?.setWindowTheme?.(dark);
  }, []);

  const apply = useCallback((t: Theme) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage unavailable */
    }
    setTheme(t);
    void getApi()?.setWindowTheme?.(t === "dark");
  }, []);

  const setAccent = useCallback((a: Accent) => {
    document.documentElement.setAttribute("data-accent", a);
    try {
      localStorage.setItem("localclaw.accent", a);
    } catch {
      /* storage unavailable */
    }
    setAccentState(a);
  }, []);

  return { theme, setTheme: apply, toggle: () => apply(theme === "dark" ? "light" : "dark"), accent, setAccent };
}
