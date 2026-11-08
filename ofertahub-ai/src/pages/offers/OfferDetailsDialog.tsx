import * as React from "react";
import { CheckCircle2, CircleDashed, ExternalLink, XCircle, AlertTriangle, Copy } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { AffiliatePlatform, PriceObservation } from "@/lib/data/types";
import { formatBRL, formatDate, formatDateTime, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { OFFER_PIPELINE, OFFER_STATUS, REFERENCE_SOURCES, dataQuality, nominalDiscount, totalPrice, verifiedDiscount } from "@/lib/domain/offers";
import { CONFIDENCE_LABEL } from "@/lib/domain/history";
import { SCORE_CLASS } from "@/lib/domain/scoring";
import { checkLink } from "@/lib/domain/links";
import { platformName } from "@/lib/data/platformCatalog";
import type { EnrichedOffer } from "./useOffers";
import { DecisionBadge, DemoBadge, ScorePill, StatusBadge, StockBadge } from "./badges";
import { cn } from "@/lib/utils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children ?? "—"}</span>
    </div>
  );
}

function Pipeline({ status }: { status: EnrichedOffer["status"] }) {
  const idx = OFFER_PIPELINE.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px]" aria-label="Etapas da oferta">
      {OFFER_PIPELINE.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={cn("rounded-full px-2 py-0.5", i === idx ? "bg-primary text-white" : idx > i ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{OFFER_STATUS[s].label}</span>
          {i < OFFER_PIPELINE.length - 1 && <span className="text-muted-foreground">→</span>}
        </li>
      ))}
      {idx === -1 && <li className="ml-2"><StatusBadge status={status} /></li>}
    </ol>
  );
}

const CheckIcon = ({ status }: { status: "ok" | "falha" | "sem_dados" }) =>
  status === "ok" ? <CheckCircle2 className="size-4 text-success" /> : status === "falha" ? <XCircle className="size-4 text-danger" /> : <CircleDashed className="size-4 text-warning" />;

export function OfferDetailsDialog({ offer, open, onOpenChange, observations, allOffers, platforms, initialTab = "resumo", actions }: {
  offer: EnrichedOffer | null; open: boolean; onOpenChange: (o: boolean) => void; observations: PriceObservation[];
  allOffers: EnrichedOffer[]; platforms: AffiliatePlatform[]; initialTab?: string; actions?: React.ReactNode;
}) {
  const [tab, setTab] = React.useState(initialTab);
  React.useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  if (!offer) return null;
  const obs = observations.filter((o) => o.offer_id === offer.id);
  const vd = verifiedDiscount(offer);
  const nd = nominalDiscount(offer);
  const q = dataQuality(offer);
  const siblings = allOffers.filter((o) => o.product_id === offer.product_id && o.id !== offer.id);
  const sc = SCORE_CLASS[offer.scoring.classification];
  const chart = obs.map((o) => ({ date: formatDate(o.observed_at), price: Number(o.price) }));
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado."));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={offer.status} />
            <ScorePill scoring={offer.scoring} />
            <DemoBadge show={offer.is_demo} />
            {offer.filter && <DecisionBadge decision={offer.filter.decision} />}
          </div>
          <DialogTitle className="mt-1">{offer.product.name}</DialogTitle>
          <DialogDescription>
            {platformName(offer.platform_code, platforms)} · ID interno {offer.id.slice(0, 8)} · cadastrada em {formatDateTime(offer.created_at)}
          </DialogDescription>
          <div className="mt-2"><Pipeline status={offer.status} /></div>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </DialogHeader>
        <DialogBody>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="pontuacao">Pontuação</TabsTrigger>
              <TabsTrigger value="filtros">Filtros</TabsTrigger>
              <TabsTrigger value="historico">Histórico ({obs.length})</TabsTrigger>
              <TabsTrigger value="comparar">Comparar ({siblings.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Preço</h4>
                <Row label="Preço atual">{formatBRL(offer.current_price)}</Row>
                <Row label="Preço de referência">{formatBRL(offer.reference_price)}</Row>
                <Row label="Origem da referência">{offer.reference_price_source ? REFERENCE_SOURCES[offer.reference_price_source] : "—"}</Row>
                <Row label="Desconto verificado">{vd != null ? <span className="text-success">{formatPercent(vd)}</span> : <span className="text-muted-foreground">Não verificável{nd != null ? ` (anunciado ${formatPercent(nd)})` : ""}</span>}</Row>
                <Row label="Frete">{offer.shipping_cost == null ? "Não informado" : offer.shipping_cost === 0 ? "Grátis" : formatBRL(offer.shipping_cost)}</Row>
                <Row label="Preço total estimado">{totalPrice(offer) != null ? formatBRL(totalPrice(offer)) : "Depende do frete"}</Row>
                <Row label="Cupom">{offer.coupon_code ? <span>{offer.coupon_code}{offer.coupon_details ? ` — ${offer.coupon_details}` : ""}</span> : "—"}</Row>
                <Row label="Comissão estimada">{offer.commission_rate != null ? `${formatPercent(offer.commission_rate)}${offer.commission_source ? ` (${offer.commission_source})` : ""}` : "Desconhecida"}</Row>
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Produto e loja</h4>
                <Row label="Marca / modelo">{[offer.product.brand, offer.product.model].filter(Boolean).join(" · ") || "—"}</Row>
                <Row label="Categoria">{offer.product.category}</Row>
                <Row label="Loja / vendedor">{offer.store_name}</Row>
                <Row label="Reputação do vendedor">{offer.seller_reputation ?? "Não disponível"}</Row>
                <Row label="Avaliação">{offer.rating != null ? `${offer.rating.toLocaleString("pt-BR")} ★ (${formatNumber(offer.rating_count)} avaliações)` : "Não disponível"}</Row>
                <Row label="Estoque"><StockBadge status={offer.stock_status} /></Row>
                <Row label="ID externo">{offer.external_id}</Row>
                <Row label="Última verificação">{offer.last_verified_at ? formatDateTime(offer.last_verified_at) : <span className="text-warning">Nunca verificada</span>}</Row>
                <Row label="Fonte / método">{offer.data_source} · {offer.collection_method}</Row>
                <Row label="Qualidade dos dados">{q.score}%</Row>
              </div>
              <div className="space-y-2 md:col-span-2">
                {(["original_url", "affiliate_url"] as const).map((k) => {
                  const url = offer[k];
                  const c = url ? checkLink(url, offer.platform_code, k === "affiliate_url" ? "afiliado" : "original") : null;
                  return (
                    <div key={k} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-xs">
                      <span className="w-28 shrink-0 text-muted-foreground">{k === "original_url" ? "Link original" : "Link de afiliado"}</span>
                      {url ? (
                        <>
                          <a href={url} target="_blank" rel="noopener noreferrer sponsored" className="min-w-0 flex-1 truncate text-primary hover:underline">{url}</a>
                          <Badge variant={c!.level === "valido" ? "success" : c!.level === "atencao" ? "warning" : "danger"}>{c!.level === "valido" ? "Estrutura válida" : c!.level === "atencao" ? "Atenção" : "Inválido"}</Badge>
                          <Button size="icon-sm" variant="ghost" onClick={() => copy(url)} aria-label="Copiar link"><Copy /></Button>
                          <Button size="icon-sm" variant="ghost" asChild><a href={url} target="_blank" rel="noopener noreferrer sponsored" aria-label="Abrir link"><ExternalLink /></a></Button>
                        </>
                      ) : <span className="text-muted-foreground">Não cadastrado</span>}
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground">A verificação de links é estrutural. Atribuição de cliques e vendas só é confirmada pelos relatórios oficiais da plataforma.</p>
              </div>
            </TabsContent>

            <TabsContent value="pontuacao" className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-semibold tabular-nums">{offer.scoring.score}</span>
                <Badge variant={sc.variant}>{sc.label}</Badge>
                <span className="text-xs text-muted-foreground">Recalculada com os pesos atuais de Configurações.</span>
              </div>
              {offer.scoring.blockers.length > 0 && (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-4" /> Bloqueios obrigatórios (prevalecem sobre a nota)</p>
                  <ul className="mt-1 list-disc pl-6 text-xs">{offer.scoring.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              )}
              <div className="space-y-2">
                {offer.scoring.components.map((c) => (
                  <div key={c.key} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.label}</span>
                      <span className="tabular-nums">{c.points.toLocaleString("pt-BR")} / {c.weight}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="brand-gradient h-full rounded-full" style={{ width: `${c.ratio * 100}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{c.explanation}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="filtros">
              {!offer.filter ? (
                <EmptyState title="Nenhum perfil de filtro selecionado" description="Escolha um perfil na Central de Ofertas ou defina um perfil padrão em Filtros Inteligentes." />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm"><DecisionBadge decision={offer.filter.decision} /><span className="text-muted-foreground">Ausência de dados nunca é tratada como aprovação.</span></div>
                  {offer.filter.checks.length === 0 && <p className="text-sm text-muted-foreground">O perfil não possui regras ativas.</p>}
                  {offer.filter.checks.map((c) => (
                    <div key={c.key} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                      <CheckIcon status={c.status} />
                      <div><p className="font-medium">{c.label}</p><p className="text-xs text-muted-foreground">{c.message}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="historico" className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Menor", formatBRL(offer.history.min)], ["Maior", formatBRL(offer.history.max)],
                  ["Médio", formatBRL(offer.history.avg)], ["Mediana", formatBRL(offer.history.median)],
                  ["Variação", formatPercent(offer.history.variationPercent)], ["Última alteração", formatRelative(offer.history.lastChangeAt)],
                  ["Observações", String(offer.history.count)], ["Confiança", CONFIDENCE_LABEL[offer.history.confidence]],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg border p-2.5"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-sm font-semibold">{v}</p></div>
                ))}
              </div>
              {obs.length < 2 ? (
                <EmptyState title="Histórico insuficiente" description="O histórico é formado apenas por observações registradas (a cada preço informado ou importado). Nenhum preço anterior é inventado." />
              ) : (
                <div className="h-56 rounded-lg border p-2">
                  <ResponsiveContainer>
                    <AreaChart data={chart}>
                      <defs><linearGradient id="hist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `R$${v}`} width={60} domain={["auto", "auto"]} />
                      <RTooltip formatter={(v) => formatBRL(Number(v))} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      <Area type="stepAfter" dataKey="price" name="Preço" stroke="var(--primary)" fill="url(#hist)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {obs.length > 0 && (
                <Table>
                  <THead><TR><TH>Data</TH><TH>Preço</TH><TH>Frete</TH><TH>Fonte</TH><TH>Método</TH><TH>Qualidade</TH></TR></THead>
                  <TBody>
                    {[...obs].reverse().slice(0, 50).map((o) => (
                      <TR key={o.id}><TD>{formatDateTime(o.observed_at)}</TD><TD>{formatBRL(Number(o.price))}</TD><TD>{o.shipping_cost == null ? "—" : formatBRL(Number(o.shipping_cost))}</TD><TD>{o.source}{o.is_demo && <Badge variant="demo" className="ml-1">DEMO</Badge>}</TD><TD>{o.collection_method}</TD><TD>{o.quality}</TD></TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="comparar">
              {siblings.length === 0 ? (
                <EmptyState title="Nenhuma outra oferta deste produto" description="Cadastre o mesmo produto em outra plataforma para comparar. O Comparador completo (com confiança e frete por CEP) chega na Fase 2." />
              ) : (
                <Table>
                  <THead><TR><TH>Plataforma</TH><TH>Preço</TH><TH>Frete</TH><TH>Total</TH><TH>Avaliação</TH><TH>Verificada</TH></TR></THead>
                  <TBody>
                    {[offer, ...siblings].sort((a, b) => (totalPrice(a) ?? Infinity) - (totalPrice(b) ?? Infinity)).map((o) => (
                      <TR key={o.id} className={o.id === offer.id ? "bg-primary/5" : ""}>
                        <TD>{platformName(o.platform_code, platforms)}</TD><TD>{formatBRL(o.current_price)}</TD>
                        <TD>{o.shipping_cost == null ? "?" : formatBRL(o.shipping_cost)}</TD><TD className="font-medium">{formatBRL(totalPrice(o))}</TD>
                        <TD>{o.rating ?? "—"}</TD><TD className={!o.last_verified_at ? "text-warning" : ""}>{formatRelative(o.last_verified_at)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
