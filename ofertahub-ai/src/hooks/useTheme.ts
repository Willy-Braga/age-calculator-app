import * as React from "react";
import type { ThemePref } from "@/lib/domain/settings";

export function applyTheme(t: ThemePref) {
  const dark = t === "dark" || (t === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", !!dark);
  try { localStorage.setItem("ofertahub:theme", t); } catch { /* ignore */ }
}

export function useApplyTheme(t: ThemePref | undefined) {
  React.useEffect(() => { if (t) applyTheme(t); }, [t]);
}
