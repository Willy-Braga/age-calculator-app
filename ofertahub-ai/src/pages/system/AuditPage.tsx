import * as React from "react";
import { History } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { useList } from "@/hooks/useData";
import type { AuditLog } from "@/lib/data/types";
import { formatDateTime } from "@/lib/format";

const ENTITY: Record<string, string> = {
  product_offers: "Oferta", products: "Produto", filter_profiles: "Perfil de filtros", integrations: "Integração", app_settings: "Configurações",
  affiliate_links: "Link de afiliado", publications: "Publicação", distribution_channels: "Canal", campaigns: "Campanha",
  media_assets: "Mídia", media_licenses: "Licença", automation_jobs: "Automação", conversions: "Conversão", commissions: "Comissão", product_variants: "Variante",
};
const ACTION = { insert: { label: "Criação", v: "success" }, update: { label: "Alteração", v: "default" }, delete: { label: "Exclusão", v: "danger" } } as const;

function summarize(log: AuditLog): string {
  const c = log.changes ?? {};
  if (log.action === "update") {
    return Object.entries(c).slice(0, 4).map(([k, v]) => {
      const d = v as { de?: unknown; para?: unknown };
      const fmt = (x: unknown) => (x == null ? "∅" : typeof x === "object" ? "{…}" : String(x).slice(0, 40));
      return `${k}: ${fmt(d?.de)} → ${fmt(d?.para)}`;
    }).join(" · ") + (Object.keys(c).length > 4 ? ` (+${Object.keys(c).length - 4})` : "");
  }
  const rec = (log.action === "delete" ? (c as { removido?: Record<string, unknown> }).removido : c) ?? {};
  return String(rec.name ?? rec.platform_code ?? rec.status ?? "");
}

export function AuditPage() {
  const q = useList<AuditLog>("audit_logs", { orderBy: { column: "created_at", ascending: false }, limit: 2000 });
  const [entity, setEntity] = React.useState("");
  const [action, setAction] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const rows = (q.data ?? []).filter((l) => (!entity || l.entity === entity) && (!action || l.action === action) && (!search || JSON.stringify(l.changes ?? {}).toLowerCase().includes(search.toLowerCase())));
  React.useEffect(() => setPage(1), [entity, action, search]);
  const entities = Array.from(new Set((q.data ?? []).map((l) => l.entity)));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Histórico e Auditoria" description="Registro automático (gerado pelo banco de dados) de criações, alterações e exclusões." />
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Input aria-label="Buscar nas alterações" placeholder="Buscar nas alterações…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <NativeSelect aria-label="Entidade" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Todas as entidades</option>{entities.map((e) => <option key={e} value={e}>{ENTITY[e] ?? e}</option>)}</NativeSelect>
        <NativeSelect aria-label="Ação" value={action} onChange={(e) => setAction(e.target.value)}><option value="">Todas as ações</option><option value="insert">Criação</option><option value="update">Alteração</option><option value="delete">Exclusão</option></NativeSelect>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.isLoading ? <LoadingRows /> : rows.length === 0 ? (
        <EmptyState icon={History} title="Nenhum registro de auditoria" description="As alterações aparecem aqui automaticamente." />
      ) : (
        <>
          <Table>
            <THead><TR><TH>Data</TH><TH>Ação</TH><TH>Entidade</TH><TH>ID</TH><TH>Detalhes</TH></TR></THead>
            <TBody>
              {rows.slice((page - 1) * 25, page * 25).map((l) => {
                const a = ACTION[l.action as keyof typeof ACTION];
                return (
                  <TR key={String(l.id)}>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(l.created_at)}</TD>
                    <TD><Badge variant={a?.v ?? "muted"}>{a?.label ?? l.action}</Badge></TD>
                    <TD className="whitespace-nowrap">{ENTITY[l.entity] ?? l.entity}</TD>
                    <TD className="font-mono text-[11px] text-muted-foreground">{l.entity_id?.slice(0, 8)}</TD>
                    <TD className="max-w-xl truncate text-xs text-muted-foreground" title={JSON.stringify(l.changes)}>{summarize(l)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={25} total={rows.length} onPage={setPage} />
        </>
      )}
    </div>
  );
}
