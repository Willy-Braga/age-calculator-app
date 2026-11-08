import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/lib/auth/AppContext";
import type { AppSettingsRow, UserPreferencesRow } from "@/lib/data/types";
import { DEFAULT_USER_PREFS, mergeOrgSettings, type OrgSettings, type UserPreferences } from "@/lib/domain/settings";

export function useOrgSettings() {
  const { client, orgId, mode } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [mode, orgId, "app_settings"],
    queryFn: async () => {
      const rows = await client.list<AppSettingsRow>("app_settings", { filters: [{ column: "organization_id", op: "eq", value: orgId }] });
      return mergeOrgSettings(rows[0]?.settings);
    },
  });
  const save = useMutation({
    mutationFn: (s: OrgSettings) => client.upsert("app_settings", { organization_id: orgId, settings: s }, "organization_id"),
    onSuccess: () => { qc.invalidateQueries({ predicate: (x) => x.queryKey[2] === "app_settings" || x.queryKey[2] === "audit_logs" }); toast.success("Configurações salvas."); },
    onError: (e: Error) => toast.error(e.message),
  });
  return { settings: q.data, isLoading: q.isLoading, error: q.error, save };
}

export function useUserPrefs() {
  const { client, user, mode } = useSession();
  const qc = useQueryClient();
  const key = [mode, user.id, "user_preferences"];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const rows = await client.list<UserPreferencesRow>("user_preferences", { filters: [{ column: "user_id", op: "eq", value: user.id }] });
      return { ...DEFAULT_USER_PREFS, ...(rows[0]?.preferences ?? {}) } as UserPreferences;
    },
  });
  const save = useMutation({
    mutationFn: (p: UserPreferences) => client.upsert("user_preferences", { user_id: user.id, preferences: p }, "user_id"),
    onMutate: async (p) => { qc.setQueryData(key, p); },
    onError: (e: Error) => { toast.error(e.message); qc.invalidateQueries({ queryKey: key }); },
  });
  const prefs = q.data ?? DEFAULT_USER_PREFS;
  const update = React.useCallback((patch: Partial<UserPreferences>) => save.mutate({ ...prefs, ...patch }), [prefs, save]);
  return { prefs, isLoading: q.isLoading, update };
}
