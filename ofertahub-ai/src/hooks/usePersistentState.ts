import * as React from "react";

/** Estado persistido em localStorage (ex.: filtros das telas). */
export function usePersistentState<T>(key: string, initial: T) {
  const fullKey = `ofertahub:ui:${key}`;
  const [value, setValue] = React.useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      return raw ? { ...(initial as object), ...JSON.parse(raw) } as T : initial;
    } catch {
      return initial;
    }
  });
  React.useEffect(() => {
    try { localStorage.setItem(fullKey, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
  }, [fullKey, value]);
  return [value, setValue] as const;
}
