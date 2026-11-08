import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { useList, useTableMutation } from "@/hooks/useData";
import { useSession } from "@/lib/auth/AppContext";
import type { Notification } from "@/lib/data/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEV = { info: "default", sucesso: "success", aviso: "warning", erro: "danger" } as const;

export function NotificationsPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [filter, setFilter] = React.useState<"todas" | "nao_lidas">("todas");
  const q = useList<Notification>("notifications", { orderBy: { column: "created_at", ascending: false }, limit: 500 });
  const mark = useTableMutation("notifications", "update");
  const remove = useTableMutation("notifications", "remove", { success: "Notificação excluída." });
  const rows = (q.data ?? []).filter((n) => (!n.user_id || n.user_id === user.id) && (filter === "todas" || !n.read_at));
  const unread = (q.data ?? []).filter((n) => !n.read_at);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Notificações"
        description="Eventos do aplicativo. Preferências por tipo de evento em Configurações › Notificações."
        actions={<>
          <NativeSelect aria-label="Filtrar" className="w-40" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="todas">Todas</option><option value="nao_lidas">Não lidas ({unread.length})</option></NativeSelect>
          <Button variant="outline" disabled={!unread.length} onClick={() => unread.forEach((n) => mark.mutate({ match: { id: n.id }, patch: { read_at: new Date().toISOString() } }))}><CheckCheck /> Marcar todas como lidas</Button>
        </>}
      />
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.isLoading ? <LoadingRows /> : rows.length === 0 ? (
        <EmptyState icon={Bell} title="Nenhuma notificação" description="Você será avisado sobre ofertas de alta pontuação, falhas de integração e outros eventos." />
      ) : (
        <Card className="divide-y">
          {rows.map((n) => (
            <div key={n.id} className={cn("flex items-start gap-3 p-4", !n.read_at && "bg-primary/[0.04]")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                  <Badge variant={SEV[n.severity]}>{n.severity}</Badge>
                  {n.is_demo && <Badge variant="demo">DEMO</Badge>}
                </div>
                {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {n.link && <Button size="sm" variant="outline" onClick={() => { if (!n.read_at) mark.mutate({ match: { id: n.id }, patch: { read_at: new Date().toISOString() } }); navigate(n.link!); }}>Abrir</Button>}
                <Button size="sm" variant="ghost" onClick={() => mark.mutate({ match: { id: n.id }, patch: { read_at: n.read_at ? null : new Date().toISOString() } })}>{n.read_at ? "Marcar não lida" : "Marcar lida"}</Button>
                <Button size="icon-sm" variant="ghost" aria-label="Excluir" onClick={async () => { if (await confirm({ title: "Excluir notificação?", confirmLabel: "Excluir", destructive: true })) remove.mutate({ match: { id: n.id } }); }}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
