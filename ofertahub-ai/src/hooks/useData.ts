import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/lib/auth/AppContext";
import type { ListOptions } from "@/lib/data/client";
import type { TableName } from "@/lib/data/types";

/** Tabelas sem organization_id (não filtrar por organização). */
const GLOBAL_TABLES: TableName[] = ["affiliate_platforms", "profiles", "user_preferences", "organizations"];

export function useList<T>(table: TableName, opts: ListOptions = {}, enabled = true) {
  const { client, orgId, mode } = useSession();
  const filters = GLOBAL_TABLES.includes(table) ? opts.filters ?? [] : [{ column: "organization_id", op: "eq" as const, value: orgId }, ...(opts.filters ?? [])];
  return useQuery({
    queryKey: [mode, orgId, table, opts],
    queryFn: () => client.list<T>(table, { ...opts, filters }),
    enabled,
  });
}

type MutationKind = "insert" | "update" | "remove" | "upsert";
interface MutationVars { values?: Record<string, unknown> | Record<string, unknown>[]; match?: Record<string, unknown>; patch?: Record<string, unknown>; onConflict?: string }

/**
 * Mutação genérica: injeta organization_id, invalida o cache da tabela e de tabelas
 * afetadas por gatilhos (ex.: price_observations, audit_logs).
 */
export function useTableMutation<T = unknown>(table: TableName, kind: MutationKind, opts: { success?: string; invalidate?: TableName[] } = {}) {
  const { client, orgId } = useSession();
  const qc = useQueryClient();
  const withOrg = (v: Record<string, unknown>) => (GLOBAL_TABLES.includes(table) ? v : { organization_id: orgId, ...v });
  return useMutation({
    mutationFn: async (vars: MutationVars): Promise<T[] | void> => {
      // match sempre restrito à organização ativa
      const match = vars.match && !GLOBAL_TABLES.includes(table) ? { ...vars.match, organization_id: orgId } : vars.match;
      switch (kind) {
        case "insert":
          return client.insert<T>(table, Array.isArray(vars.values) ? vars.values.map(withOrg) : withOrg(vars.values ?? {}));
        case "update":
          return client.update<T>(table, match ?? {}, vars.patch ?? {});
        case "upsert":
          return client.upsert<T>(table, withOrg(vars.values as Record<string, unknown>), vars.onConflict ?? "id");
        case "remove":
          return client.remove(table, match ?? {});
      }
    },
    onSuccess: () => {
      for (const t of [table, ...(opts.invalidate ?? []), "audit_logs" as TableName]) {
        qc.invalidateQueries({ predicate: (q) => q.queryKey[2] === t });
      }
      if (opts.success) toast.success(opts.success);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
