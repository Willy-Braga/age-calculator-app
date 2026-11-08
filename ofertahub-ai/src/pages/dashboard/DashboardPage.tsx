import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown, ArrowUp, CheckCircle2, Clock, Eye, LayoutGrid, MousePointerClick, PackageSearch, Plus, Radar, Send, Sparkles, Wallet, XCircle,
  AlertTriangle, Maximize2, Minimize2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useList } from "@/hooks/useData";
import { useUserPrefs } from "@/hooks/useSettings";
import { useApp } from "@/lib/auth/AppContext";
import type { AffiliatePlatform, Integration } from "@/lib/data/types";
import { PLATFORM_COLORS, platformName } from "@/lib/data/platformCatalog";
import { verifiedDiscount } from "@/lib/domain/offers";
import { formatBRL, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import type { DashboardWidgetPref } from "@/lib/domain/settings";
import { useOffers, type EnrichedOffer } from "../offers/useOffers";
import { ScorePill, DemoBadge } from "../offers/badges";
import { INTEGRATION_STATUS } from "../integrations/IntegrationsPage";
import { TrendArea, HBars } from "./charts";
import { cn } from "@/lib/utils";

type ClickRow = { clicks: number; campaign_id: string | null; is_demo: boolean };
type CommissionRow = { amount: number; status: string; origin: string; is_demo: boolean };
type PublicationRow = { status: string; planned_at: string | null };

const WIDGETS: { id: string; title: string; size: 1 | 2 }[] = [
  { id: "trend", title: "Evolução das ofertas encontradas", size: 2 },
  { id: "approvedByCategory", title: "Ofertas aprovadas por categoria", size: 1 },
  { id: "discountByPlatform", title: "Desconto verificado médio por plataforma", size: 1 },
  { id: "bestOffers", title: "Melhores ofertas disponíveis", size: 1 },
  { id: "pendingReview", title: "Produtos aguardando revisão", size: 1 },
  { id: "latestOffers", title: "Últimas ofertas encontradas", size: 1 },
  { id: "topReductions", title: "Maiores reduções verificadas", size: 1 },
  { id: "alerts", title: "Alertas de estoque e preço", size: 1 },
  { id: "integrations", title: "Status das integrações", size: 1 },
  { id: "platformSummary", title: "Resumo por plataforma", size: 2 },
  { id: "clicksByCampaign", title: "Cliques por campanha", size: 1 },
  { id: "commissionsByPeriod", title: "Comissões por período", size: 1 },
  { id: "channelPerformance", title: "Desempenho por canal", size: 1 },
  { id: "scheduledPublications", title: "Publicações agendadas para revisão", size: 1 },
  { id: "automations", title: "Últimas automações", size: 1 },
];

/** Mescla preferências salvas com o catálogo (novos widgets aparecem ao final). */
export function resolveWidgets(saved: DashboardWidgetPref[]): DashboardWidgetPref[] {
  const known = saved.filter((w) => WIDGETS.some((d) => d.id === w.id));
  const missing = WIDGETS.filter((d) => !known.some((w) => w.id === d.id)).map((d) => ({ id: d.id, visible: true, size: d.size }));
  return [...known, ...missing];
}

function Kpi({ label, value, icon: Icon, tone = "default", hint, to }: {
  label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; tone?: "default" | "success" | "warning" | "danger" | "violet"; hint?: string; to?: string;
}) {
  const toneCls = { default: "bg-primary/10 text-primary", success: "bg-success/12 text-success", warning: "bg-warning/15 text-warning", danger: "bg-danger/12 text-danger", violet: "bg-violet/12 text-violet" }[tone];
  const body = (
    <Card className="h-full p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className={cn("grid size-7 place-items-center rounded-lg", toneCls)}><Icon className="size-4" /></span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

function OfferList({ offers, platforms, empty }: { offers: EnrichedOffer[]; platforms: AffiliatePlatform[]; empty: string }) {
  if (!offers.length) return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {offers.map((o) => (
        <li key={o.id}>
          <Link to={`/ofertas?id=${o.id}`} className="flex items-center gap-3 py-2 hover:bg-muted/40">
            <span className="size-2 shrink-0 rounded-full" style={{ background: PLATFORM_COLORS[o.platform_code] }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{o.product.name}</p>
              <p className="text-[11px] text-muted-foreground">{platformName(o.platform_code, platforms)} · {formatRelative(o.created_at)}</p>
            </div>
            <DemoBadge show={o.is_demo} />
            <span className="text-sm font-medium tabular-nums">{formatBRL(o.current_price)}</span>
            <ScorePill scoring={o.scoring} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const Pending = ({ text }: { text: string }) => <EmptyState className="border-0 p-4" title="Sem dados registrados" description={text} />;

export function DashboardPage() {
  const { mode } = useApp();
  const { data: offers, isLoading, error, refetch } = useOffers();
  const platforms = useList<AffiliatePlatform>("affiliate_platforms", { orderBy: { column: "sort_order" } }).data ?? [];
  const integrations = useList<Integration>("integrations").data ?? [];
  const clicks = useList<ClickRow>("click_events").data ?? [];
  const commissions = useList<CommissionRow>("commissions").data ?? [];
  const publications = useList<PublicationRow>("publications").data ?? [];
  const { prefs, update } = useUserPrefs();
  const widgets = resolveWidgets(prefs.dashboardWidgets);
  const [customizing, setCustomizing] = React.useState(false);
  const [draft, setDraft] = React.useState<DashboardWidgetPref[]>([]);

  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const isToday = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === today;
  const count = (fn: (o: EnrichedOffer) => boolean) => offers.filter(fn).length;
  const confirmedCommissions = commissions.filter((c) => c.status === "confirmada" || c.status === "paga").reduce((s, c) => s + Number(c.amount), 0);
  const estimatedCommissions = commissions.filter((c) => c.status === "estimada").reduce((s, c) => s + Number(c.amount), 0);

  const trend = React.useMemo(() => {
    const days: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      days.push({ label: key.slice(0, 5), value: offers.filter((o) => new Date(o.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === key).length });
    }
    return days;
  }, [offers]);

  const approvedByCategory = React.useMemo(() => {
    const m = new Map<string, number>();
    offers.filter((o) => o.status === "aprovada" || o.status === "publicada").forEach((o) => m.set(o.product.category ?? "Sem categoria", (m.get(o.product.category ?? "Sem categoria") ?? 0) + 1));
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [offers]);

  const discountByPlatform = React.useMemo(() => {
    const m = new Map<string, number[]>();
    offers.forEach((o) => { const d = verifiedDiscount(o); if (d != null) m.set(o.platform_code, [...(m.get(o.platform_code) ?? []), d]); });
    return [...m].map(([code, arr]) => ({ code, label: platformName(code, platforms), value: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 })).sort((a, b) => b.value - a.value);
  }, [offers, platforms]);

  const topReductions = offers
    .filter((o) => o.history.count >= 2 && o.history.max != null && o.current_price != null && o.current_price < o.history.max)
    .map((o) => ({ o, drop: Math.round((1 - o.current_price! / o.history.max!) * 1000) / 10 }))
    .sort((a, b) => b.drop - a.drop).slice(0, 6);

  const alerts = offers.filter((o) => o.is_monitored && (o.stock_status === "sem_estoque" || o.stock_status === "baixo_estoque" || (o.history.lastChangeAt && Date.now() - new Date(o.history.lastChangeAt).getTime() < 7 * 86_400_000)));

  const platformSummary = platforms.map((p) => {
    const list = offers.filter((o) => o.platform_code === p.code);
    return { p, total: list.length, approved: list.filter((o) => o.status === "aprovada" || o.status === "publicada").length, avgScore: list.length ? Math.round(list.reduce((s, o) => s + o.scoring.score, 0) / list.length) : null };
  }).filter((r) => r.total > 0);

  const render = (id: string): React.ReactNode => {
    switch (id) {
      case "trend": return offers.length ? <TrendArea data={trend} valueLabel="Ofertas" /> : <Pending text="Cadastre ofertas para ver a evolução diária." />;
      case "approvedByCategory": return approvedByCategory.length ? <HBars data={approvedByCategory} format={(v) => formatNumber(v)} /> : <Pending text="Nenhuma oferta aprovada ainda." />;
      case "discountByPlatform": return discountByPlatform.length
        ? <HBars data={discountByPlatform} format={(v) => formatPercent(v)} colors={discountByPlatform.map((d) => PLATFORM_COLORS[d.code])} />
        : <Pending text="Sem ofertas com preço de referência verificável. Preço riscado do vendedor não entra nesta média." />;
      case "bestOffers": return <OfferList platforms={platforms} empty="Nenhuma oferta ativa sem bloqueios." offers={offers.filter((o) => !["rejeitada", "expirada", "arquivada"].includes(o.status) && o.scoring.classification !== "bloqueada").sort((a, b) => b.scoring.score - a.scoring.score).slice(0, 5)} />;
      case "pendingReview": return <OfferList platforms={platforms} empty="Nada aguardando revisão." offers={offers.filter((o) => o.status === "aguardando_aprovacao" || o.status === "em_verificacao").slice(0, 5)} />;
      case "latestOffers": return <OfferList platforms={platforms} empty="Nenhuma oferta cadastrada." offers={offers.slice(0, 5)} />;
      case "topReductions": return topReductions.length ? (
        <ul className="divide-y">{topReductions.map(({ o, drop }) => (
          <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{o.product.name}</span><DemoBadge show={o.is_demo} />
            <span className="text-xs text-muted-foreground">{formatBRL(o.history.max)} → {formatBRL(o.current_price)}</span>
            <span className="flex items-center gap-0.5 text-xs font-semibold text-success"><ArrowDown className="size-3" />{formatPercent(drop)}</span>
          </li>))}
        </ul>) : <Pending text="Reduções aparecem quando há ao menos 2 observações registradas de preço." />;
      case "alerts": return alerts.length ? (
        <ul className="divide-y">{alerts.slice(0, 6).map((o) => (
          <li key={o.id} className="flex items-center gap-2 py-2 text-sm">
            <AlertTriangle className={cn("size-4 shrink-0", o.stock_status === "sem_estoque" ? "text-danger" : "text-warning")} />
            <span className="min-w-0 flex-1 truncate">{o.product.name}</span>
            <span className="text-xs text-muted-foreground">{o.stock_status === "sem_estoque" ? "Sem estoque" : o.stock_status === "baixo_estoque" ? "Estoque baixo" : `Preço alterado ${formatRelative(o.history.lastChangeAt)}`}</span>
          </li>))}
        </ul>) : <Pending text="Marque ofertas como “Monitorar alterações” para receber alertas aqui." />;
      case "integrations": return (
        <ul className="divide-y">{platforms.map((p) => {
          const st = INTEGRATION_STATUS[integrations.find((i) => i.platform_code === p.code)?.status ?? "nao_configurada"];
          return <li key={p.code} className="flex items-center justify-between py-1.5 text-sm"><span>{p.name}</span><Badge variant={st.variant}>{st.label}</Badge></li>;
        })}</ul>);
      case "platformSummary": return platformSummary.length ? (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="py-1.5 text-left font-medium">Plataforma</th><th className="text-right font-medium">Ofertas</th><th className="text-right font-medium">Aprovadas</th><th className="text-right font-medium">Pontuação média</th></tr></thead>
          <tbody className="divide-y">{platformSummary.map((r) => (
            <tr key={r.p.code}><td className="py-1.5"><span className="mr-2 inline-block size-2 rounded-full" style={{ background: PLATFORM_COLORS[r.p.code] }} />{r.p.name}</td><td className="text-right tabular-nums">{r.total}</td><td className="text-right tabular-nums">{r.approved}</td><td className="text-right tabular-nums">{r.avgScore ?? "—"}</td></tr>
          ))}</tbody>
        </table></div>) : <Pending text="Sem ofertas por plataforma." />;
      case "clicksByCampaign": return clicks.length ? <p className="text-sm">{formatNumber(clicks.reduce((s, c) => s + c.clicks, 0))} cliques registrados.</p> : <Pending text="Nenhum clique registrado. Importação de relatórios oficiais chega na Fase 4." />;
      case "commissionsByPeriod": return commissions.length ? (
        <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Estimadas (não é receita)</p><p className="font-semibold">{formatBRL(estimatedCommissions)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Confirmadas pela plataforma</p><p className="font-semibold text-success">{formatBRL(confirmedCommissions)}</p></div></div>
      ) : <Pending text="Nenhuma comissão importada. Relatórios oficiais (CSV/API) chegam na Fase 4." />;
      case "channelPerformance": return <Pending text="Canais e publicações chegam na Fase 3; métricas de desempenho na Fase 4." />;
      case "scheduledPublications": return publications.length ? <p className="text-sm">{publications.filter((p) => p.status === "aguardando_aprovacao").length} aguardando aprovação.</p> : <Pending text="Fila de publicações disponível na Fase 3." />;
      case "automations": return <Pending text="Nenhuma automação executada. O motor de automações chega na Fase 4 e só roda com fontes e credenciais configuradas." />;
      default: return null;
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        description={mode === "demo" ? "Visão geral com dados fictícios do modo DEMO." : "Visão geral calculada exclusivamente a partir dos dados registrados."}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => { setDraft(widgets); setCustomizing(true); }}><LayoutGrid /> Personalizar</Button>
          <Button variant="brand" size="sm" asChild><Link to="/ofertas"><Plus /> Nova oferta</Link></Button>
        </>}
      />
      {error ? <ErrorState error={error} onRetry={refetch} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />) : <>
              <Kpi label="Ofertas encontradas hoje" value={count((o) => isToday(o.created_at))} icon={Sparkles} to="/ofertas" />
              <Kpi label="Aguardando verificação" value={count((o) => o.status === "encontrada" || o.status === "em_verificacao" || o.status === "dados_insuficientes")} icon={Clock} tone="warning" to="/ofertas?status=em_verificacao" />
              <Kpi label="Ofertas aprovadas" value={count((o) => o.status === "aprovada")} icon={CheckCircle2} tone="success" to="/ofertas?status=aprovada" />
              <Kpi label="Ofertas rejeitadas" value={count((o) => o.status === "rejeitada")} icon={XCircle} tone="danger" to="/ofertas?status=rejeitada" />
              <Kpi label="Produtos monitorados" value={count((o) => o.is_monitored)} icon={Radar} tone="violet" />
              <Kpi label="Publicações realizadas" value={publications.filter((p) => p.status === "publicada").length} icon={Send} hint="Fila de publicações: Fase 3" />
              <Kpi label="Cliques registrados" value={formatNumber(clicks.reduce((s, c) => s + c.clicks, 0))} icon={MousePointerClick} hint="Somente relatórios importados" />
              <Kpi label="Comissões confirmadas" value={formatBRL(confirmedCommissions)} icon={Wallet} tone="success" hint={estimatedCommissions ? `${formatBRL(estimatedCommissions)} estimadas (não é receita)` : "Confirmadas pela plataforma"} />
            </>}
          </div>
          {!isLoading && offers.length === 0 && (
            <EmptyState className="mt-4" icon={PackageSearch} title="Seu banco de dados está vazio" description="Comece cadastrando uma oferta na Central de Ofertas. Nenhum dado é inventado: indicadores e gráficos usam apenas o que você registrar ou importar." action={<Button asChild variant="brand"><Link to="/ofertas"><Plus /> Cadastrar oferta</Link></Button>} />
          )}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {widgets.filter((w) => w.visible).map((w) => {
              const def = WIDGETS.find((d) => d.id === w.id)!;
              return (
                <Card key={w.id} className={cn("min-w-0", w.size === 2 && "lg:col-span-2")}>
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle>{def.title}</CardTitle>
                    {(w.id === "discountByPlatform") && <CardDescription>Apenas referências verificáveis</CardDescription>}
                    {(w.id === "bestOffers" || w.id === "pendingReview" || w.id === "latestOffers") && <Link to="/ofertas" className="flex items-center gap-1 text-xs text-primary hover:underline"><Eye className="size-3" /> Ver todas</Link>}
                  </CardHeader>
                  <CardContent>{isLoading ? <Skeleton className="h-40" /> : render(w.id)}</CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={customizing} onOpenChange={setCustomizing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Personalizar dashboard</DialogTitle><DialogDescription>Escolha quais widgets aparecem, a ordem e a largura. Salvo no seu perfil.</DialogDescription></DialogHeader>
          <DialogBody className="space-y-1.5">
            {draft.map((w, i) => (
              <div key={w.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <Switch checked={w.visible} aria-label={`Exibir ${WIDGETS.find((d) => d.id === w.id)?.title}`} onCheckedChange={(v) => setDraft((d) => d.map((x) => (x.id === w.id ? { ...x, visible: v } : x)))} />
                <span className={cn("flex-1", !w.visible && "text-muted-foreground")}>{WIDGETS.find((d) => d.id === w.id)?.title}</span>
                <Button size="icon-sm" variant="ghost" aria-label={w.size === 2 ? "Largura normal" : "Largura dupla"} onClick={() => setDraft((d) => d.map((x) => (x.id === w.id ? { ...x, size: x.size === 2 ? 1 : 2 } : x)))}>{w.size === 2 ? <Minimize2 /> : <Maximize2 />}</Button>
                <Button size="icon-sm" variant="ghost" aria-label="Mover para cima" disabled={i === 0} onClick={() => setDraft((d) => { const n = [...d]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}><ArrowUp /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Mover para baixo" disabled={i === draft.length - 1} onClick={() => setDraft((d) => { const n = [...d]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}><ArrowDown /></Button>
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(WIDGETS.map((d) => ({ id: d.id, visible: true, size: d.size })))}>Restaurar padrão</Button>
            <Button onClick={() => { update({ dashboardWidgets: draft }); setCustomizing(false); }}>Salvar layout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
