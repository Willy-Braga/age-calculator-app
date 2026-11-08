import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive, CheckCircle2, Eye, FilePlus2, GitCompare, Heart, History, LayoutGrid, Link2, MoreHorizontal, Pencil, Plus, Radar,
  RefreshCcw, Rows3, Search, Send, Trash2, XCircle, Calculator, ImageOff, PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Pagination, SortableTH, Table, TBody, TD, TH, THead, TR, type SortState } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm";
import { RequirementDialog, type Requirement } from "@/components/RequirementDialog";
import { useList } from "@/hooks/useData";
import { useUserPrefs } from "@/hooks/useSettings";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useSession } from "@/lib/auth/AppContext";
import type { AffiliatePlatform, Integration, OfferStatus } from "@/lib/data/types";
import { OFFER_STATUS, OFFER_TRANSITIONS, verifiedDiscount, totalPrice } from "@/lib/domain/offers";
import { checkLink } from "@/lib/domain/links";
import { FILTER_DECISION } from "@/lib/domain/offers";
import { formatBRL, formatPercent, formatRelative } from "@/lib/format";
import { platformName } from "@/lib/data/platformCatalog";
import { useOffers, type EnrichedOffer } from "./useOffers";
import { OfferFormDialog } from "./OfferFormDialog";
import { OfferDetailsDialog } from "./OfferDetailsDialog";
import { useOfferActions, computeSnapshot } from "./offerMutations";
import { DecisionBadge, DemoBadge, ScorePill, StatusBadge, StockBadge } from "./badges";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

interface Filters { q: string; status: string; platform: string; category: string; decision: string; favorites: boolean; profileId: string }
const DEFAULT_FILTERS: Filters = { q: "", status: "ativas", platform: "", category: "", decision: "", favorites: false, profileId: "__default" };

function sortValue(o: EnrichedOffer, col: string): number | string {
  switch (col) {
    case "name": return o.product.name.toLowerCase();
    case "price": return o.current_price ?? Infinity;
    case "discount": return verifiedDiscount(o) ?? -1;
    case "score": return o.scoring.score;
    case "verified": return o.last_verified_at ?? "";
    default: return o.created_at;
  }
}

function LinkDialog({ offer, onClose, onSave }: { offer: EnrichedOffer | null; onClose: () => void; onSave: (url: string) => void }) {
  const [url, setUrl] = React.useState("");
  React.useEffect(() => setUrl(offer?.affiliate_url ?? ""), [offer]);
  const check = offer && url ? checkLink(url, offer.platform_code, "afiliado") : null;
  return (
    <Dialog open={!!offer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar link de afiliado manualmente</DialogTitle>
          <DialogDescription>Cole o link gerado no painel oficial do programa de afiliados. Não use encurtadores que violem as regras do programa.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Link de afiliado" htmlFor="aff" error={check && !check.valid ? check.messages[0] : undefined} hint={check?.valid ? check.messages.join(" ") : undefined}>
            <Input id="aff" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!check?.valid} onClick={() => onSave(url.trim())}>Salvar link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OffersPage() {
  const { client } = useSession();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = usePersistentState<Filters>("offers-filters", DEFAULT_FILTERS);
  const [sort, setSort] = usePersistentState<{ s: SortState }>("offers-sort", { s: { column: "created", direction: "desc" } });
  const [page, setPage] = React.useState(1);
  const { prefs, update: updatePrefs } = useUserPrefs();
  const view = prefs.offersView;
  const profileArg = filters.profileId === "__default" ? undefined : filters.profileId === "" ? null : filters.profileId;
  const { data, profiles, activeProfile, observations, settings, isLoading, error, refetch } = useOffers(profileArg);
  const platforms = useList<AffiliatePlatform>("affiliate_platforms", { orderBy: { column: "sort_order" } }).data ?? [];
  const integrations = useList<Integration>("integrations").data ?? [];
  const { patch, setStatus, remove } = useOfferActions(settings);
  const confirm = useConfirm();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EnrichedOffer | undefined>();
  const [detailsId, setDetailsId] = React.useState<string | null>(null);
  const [detailsTab, setDetailsTab] = React.useState("resumo");
  const [linkFor, setLinkFor] = React.useState<EnrichedOffer | null>(null);
  const [requirement, setRequirement] = React.useState<Requirement | null>(null);
  const [revalidate, setRevalidate] = React.useState<EnrichedOffer | null>(null);

  // Parâmetros vindos da busca global / notificações
  React.useEffect(() => {
    const q = params.get("q"), st = params.get("status"), id = params.get("id");
    if (q !== null || st !== null) setFilters((f) => ({ ...f, q: q ?? f.q, status: st ?? f.status }));
    if (id) { setDetailsId(id); setDetailsTab("resumo"); }
    if (q !== null || st !== null || id) setParams({}, { replace: true });
  }, [params, setParams, setFilters]);
  React.useEffect(() => setPage(1), [filters]);

  const categories = React.useMemo(() => Array.from(new Set([...data.map((o) => o.product.category).filter(Boolean) as string[], ...settings.favoriteCategories])).sort(), [data, settings.favoriteCategories]);

  const filtered = React.useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    let rows = data.filter((o) => {
      if (q && !`${o.product.name} ${o.product.brand ?? ""} ${o.product.model ?? ""} ${o.store_name ?? ""} ${o.external_id ?? ""}`.toLowerCase().includes(q)) return false;
      if (filters.status === "ativas" && ["arquivada", "expirada", "rejeitada"].includes(o.status)) return false;
      if (filters.status && filters.status !== "ativas" && o.status !== filters.status) return false;
      if (filters.platform && o.platform_code !== filters.platform) return false;
      if (filters.category && o.product.category !== filters.category) return false;
      if (filters.decision && o.filter?.decision !== filters.decision) return false;
      if (filters.favorites && !o.is_favorite) return false;
      return true;
    });
    const s = sort.s;
    if (s) {
      rows = [...rows].sort((a, b) => {
        const av = sortValue(a, s.column), bv = sortValue(b, s.column);
        return (av > bv ? 1 : av < bv ? -1 : 0) * (s.direction === "asc" ? 1 : -1);
      });
    }
    return rows;
  }, [data, filters, sort]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const details = data.find((o) => o.id === detailsId) ?? null;
  const integrationOf = (code: string) => integrations.find((i) => i.platform_code === code);
  const platformOf = (code: string) => platforms.find((p) => p.code === code);

  const openEdit = (o?: EnrichedOffer) => { setEditing(o); setFormOpen(true); };
  const openDetails = (o: EnrichedOffer, tab = "resumo") => { setDetailsTab(tab); setDetailsId(o.id); };

  const generateLink = (o: EnrichedOffer) => {
    const integ = integrationOf(o.platform_code);
    const p = platformOf(o.platform_code);
    if (integ?.status === "conectada_validada" && p?.supported_features.includes("link_afiliado")) {
      toast.info("Integração validada, mas o adaptador de geração de links desta plataforma ainda não foi implementado (Fase 4). Use a inclusão manual.");
      return;
    }
    setRequirement({
      title: `Gerar link de afiliado — ${p?.name ?? o.platform_code}`,
      missing: p?.supported_features.includes("link_afiliado")
        ? `Integração com ${p?.name} não está conectada e validada (status atual: ${integ?.status ?? "não configurada"}).`
        : `${p?.name ?? "Esta plataforma"} não oferece geração de links por API pública. Gere o link no painel oficial e use “Adicionar link manualmente”.`,
      credentials: p?.required_credentials.length ? p.required_credentials.join(", ") : "Nenhuma API disponível — fluxo manual.",
      unlocks: "Geração automática de links de afiliado com identificadores de campanha, quando suportado pela API oficial.",
      link: { to: "/integracoes", label: "Ver integrações" },
    });
  };

  const recalcAll = async () => {
    let n = 0;
    for (const o of data) {
      const { patch: p } = computeSnapshot(o, settings, activeProfile, o.history.confidence);
      await client.update("product_offers", { id: o.id, organization_id: o.organization_id }, p);
      n++;
    }
    refetch();
    toast.success(`${n} oferta(s) recalculada(s) com as regras atuais.`);
  };

  const ActionsMenu = ({ o }: { o: EnrichedOffer }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Ações para ${o.product.name}`}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem onSelect={() => openDetails(o)}><Eye /> Visualizar detalhes</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openEdit(o)}><Pencil /> Editar</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setRevalidate(o)}><RefreshCcw /> Revalidar informações</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDetails(o, "comparar")}><GitCompare /> Comparar preços</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDetails(o, "historico")}><History /> Consultar histórico</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => generateLink(o)}><Link2 /> Gerar link de afiliado</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLinkFor(o)}><FilePlus2 /> Adicionar link manualmente</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setRequirement({
          title: "Preparar publicação", missing: "O Gerador de Conteúdos e a Fila de Publicações são entregues na Fase 3.",
          credentials: "Nenhuma — os templates determinísticos são gratuitos. IA é opcional e exige credencial autorizada.",
          unlocks: "Textos prontos para WhatsApp, Telegram, Instagram e TikTok com #publi, prévia, cópia e histórico de versões.",
        })}><Send /> Preparar publicação</DropdownMenuItem>
        <DropdownMenuSeparator />
        {OFFER_TRANSITIONS[o.status].filter((s) => s !== "arquivada" && s !== "aprovada" && s !== "rejeitada").map((s) => (
          <DropdownMenuItem key={s} onSelect={() => setStatus(o, s)}><PlayCircle /> Mover para: {OFFER_STATUS[s].label}</DropdownMenuItem>
        ))}
        {OFFER_TRANSITIONS[o.status].includes("aprovada") && <DropdownMenuItem onSelect={() => setStatus(o, "aprovada")}><CheckCircle2 className="!text-success" /> Aprovar</DropdownMenuItem>}
        {OFFER_TRANSITIONS[o.status].includes("rejeitada") && <DropdownMenuItem onSelect={() => setStatus(o, "rejeitada")}><XCircle className="!text-danger" /> Rejeitar</DropdownMenuItem>}
        {OFFER_TRANSITIONS[o.status].includes("arquivada") && <DropdownMenuItem onSelect={() => setStatus(o, "arquivada")}><Archive /> Arquivar</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => patch.mutate({ id: o.id, values: { is_favorite: !o.is_favorite }, message: o.is_favorite ? "Removida dos favoritos." : "Adicionada aos favoritos." })}><Heart /> {o.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => patch.mutate({ id: o.id, values: { is_monitored: !o.is_monitored }, message: o.is_monitored ? "Monitoramento desativado." : "Oferta marcada para monitoramento." })}><Radar /> {o.is_monitored ? "Parar de monitorar" : "Monitorar alterações"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={async () => {
          if (await confirm({ title: "Excluir oferta?", description: `“${o.product.name}” e suas observações vinculadas serão removidas. Esta ação não pode ser desfeita.`, confirmLabel: "Excluir", destructive: true })) remove.mutate(o);
        }}><Trash2 /> Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const activeFilterCount = (["q", "platform", "category", "decision"] as const).filter((k) => filters[k]).length + (filters.favorites ? 1 : 0) + (filters.status !== "ativas" ? 1 : 0);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Central de Ofertas"
        description="Cadastre, verifique, pontue e aprove ofertas. Desconto só conta quando o preço de referência é verificável."
        actions={<>
          <Button variant="outline" size="sm" onClick={recalcAll} disabled={!data.length}><Calculator /> Recalcular pontuações</Button>
          <Button variant="brand" onClick={() => openEdit()}><Plus /> Nova oferta</Button>
        </>}
      />

      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(5,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar ofertas" placeholder="Nome, marca, loja, ID…" className="pl-8" value={filters.q} onChange={(e) => set("q", e.target.value)} />
          </div>
          <NativeSelect aria-label="Status" value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="ativas">Ativas</option><option value="">Todos os status</option>
            {Object.entries(OFFER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Plataforma" value={filters.platform} onChange={(e) => set("platform", e.target.value)}>
            <option value="">Todas as plataformas</option>{platforms.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Categoria" value={filters.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Todas as categorias</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Perfil de filtros" value={filters.profileId} onChange={(e) => set("profileId", e.target.value)}>
            <option value="__default">Perfil padrão{activeProfile && filters.profileId === "__default" ? ` (${activeProfile.name})` : ""}</option>
            <option value="">Sem perfil de filtros</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Resultado dos filtros" value={filters.decision} onChange={(e) => set("decision", e.target.value)} disabled={!activeProfile}>
            <option value="">Qualquer resultado</option>
            {Object.entries(FILTER_DECISION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </NativeSelect>
          <div className="flex items-center gap-1">
            <Button size="icon" variant={filters.favorites ? "default" : "outline"} onClick={() => set("favorites", !filters.favorites)} aria-pressed={filters.favorites} aria-label="Somente favoritos"><Heart /></Button>
            <Button size="icon" variant={view === "cards" ? "secondary" : "ghost"} onClick={() => updatePrefs({ offersView: "cards" })} aria-label="Ver em cards" aria-pressed={view === "cards"}><LayoutGrid /></Button>
            <Button size="icon" variant={view === "tabela" ? "secondary" : "ghost"} onClick={() => updatePrefs({ offersView: "tabela" })} aria-label="Ver em tabela" aria-pressed={view === "tabela"}><Rows3 /></Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{filtered.length} de {data.length} oferta(s)</span>
          {activeFilterCount > 0 && <button className="text-primary hover:underline" onClick={() => setFilters(DEFAULT_FILTERS)}>Limpar filtros ({activeFilterCount})</button>}
          <span className="ml-auto">Ordenar:</span>
          <NativeSelect aria-label="Ordenação" className="h-7 w-auto text-xs" value={sort.s ? `${sort.s.column}:${sort.s.direction}` : ""} onChange={(e) => {
            const [column, direction] = e.target.value.split(":");
            setSort({ s: column ? { column, direction: direction as "asc" | "desc" } : null });
          }}>
            <option value="created:desc">Mais recentes</option><option value="score:desc">Maior pontuação</option>
            <option value="discount:desc">Maior desconto verificado</option><option value="price:asc">Menor preço</option>
            <option value="price:desc">Maior preço</option><option value="name:asc">Nome (A–Z)</option><option value="verified:desc">Verificadas recentemente</option>
          </NativeSelect>
        </div>
      </Card>

      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <LoadingRows rows={6} /> : data.length === 0 ? (
        <EmptyState
          title="Nenhuma oferta cadastrada"
          description="O banco começa vazio. Cadastre manualmente a primeira oferta; a importação por CSV e conectores oficiais chegam nas próximas fases."
          action={<Button variant="brand" onClick={() => openEdit()}><Plus /> Cadastrar primeira oferta</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma oferta corresponde aos filtros" action={<Button variant="outline" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Limpar filtros</Button>} />
      ) : view === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {pageRows.map((o) => {
            const vd = verifiedDiscount(o);
            return (
              <Card key={o.id} className="group flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
                <button className="relative aspect-[16/9] w-full overflow-hidden bg-muted text-left" onClick={() => openDetails(o)} aria-label={`Detalhes de ${o.product.name}`}>
                  {o.product.image_url ? (
                    <img src={o.product.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain p-2" />
                  ) : (
                    <div className="grid size-full place-items-center text-muted-foreground"><ImageOff className="size-6" /></div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1"><StatusBadge status={o.status} /><DemoBadge show={o.is_demo} /></div>
                  {vd != null && vd > 0 && <span className="absolute bottom-2 left-2 rounded-md bg-success px-1.5 py-0.5 text-xs font-bold text-white">-{formatPercent(vd)}</span>}
                  {o.is_favorite && <Heart className="absolute right-2 top-2 size-4 fill-danger text-danger" />}
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">{platformName(o.platform_code, platforms)}{o.product.category ? ` · ${o.product.category}` : ""}</p>
                      <h3 className="line-clamp-2 text-sm font-medium leading-snug">{o.product.name}</h3>
                    </div>
                    <ScorePill scoring={o.scoring} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold">{formatBRL(o.current_price)}</span>
                    {o.reference_price != null && <span className={cn("text-xs line-through", vd == null ? "text-muted-foreground/60" : "text-muted-foreground")} title={vd == null ? "Referência não verificável" : "Referência verificada"}>{formatBRL(o.reference_price)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <StockBadge status={o.stock_status} />
                    {o.shipping_cost === 0 && <Badge variant="success">Frete grátis</Badge>}
                    {o.coupon_code && <Badge variant="violet">Cupom {o.coupon_code}</Badge>}
                    {o.filter && <DecisionBadge decision={o.filter.decision} />}
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                    <span>{o.last_verified_at ? `Verificada ${formatRelative(o.last_verified_at)}` : <span className="text-warning">Não verificada</span>}</span>
                    <div className="flex items-center gap-0.5">
                      {OFFER_TRANSITIONS[o.status].includes("aprovada") && <Button size="icon-sm" variant="ghost" onClick={() => setStatus(o, "aprovada")} aria-label="Aprovar" title="Aprovar"><CheckCircle2 className="text-success" /></Button>}
                      {OFFER_TRANSITIONS[o.status].includes("rejeitada") && <Button size="icon-sm" variant="ghost" onClick={() => setStatus(o, "rejeitada")} aria-label="Rejeitar" title="Rejeitar"><XCircle className="text-danger" /></Button>}
                      <ActionsMenu o={o} />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <SortableTH column="name" sort={sort.s} onSort={(s) => setSort({ s })}>Produto</SortableTH>
              <TH>Plataforma</TH><TH>Status</TH>
              <SortableTH column="price" sort={sort.s} onSort={(s) => setSort({ s })}>Preço</SortableTH>
              <SortableTH column="discount" sort={sort.s} onSort={(s) => setSort({ s })}>Desc. verificado</SortableTH>
              <TH>Total</TH><TH>Estoque</TH>
              <SortableTH column="score" sort={sort.s} onSort={(s) => setSort({ s })}>Pontuação</SortableTH>
              {activeProfile && <TH>Filtros</TH>}
              <SortableTH column="verified" sort={sort.s} onSort={(s) => setSort({ s })}>Verificação</SortableTH>
              <TH className="w-10"><span className="sr-only">Ações</span></TH>
            </TR>
          </THead>
          <TBody>
            {pageRows.map((o) => (
              <TR key={o.id}>
                <TD className="max-w-72">
                  <button className="block truncate text-left font-medium hover:text-primary" onClick={() => openDetails(o)}>{o.product.name}</button>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">{o.product.category ?? "Sem categoria"} {o.is_favorite && <Heart className="size-3 fill-danger text-danger" />}<DemoBadge show={o.is_demo} /></span>
                </TD>
                <TD className="whitespace-nowrap">{platformName(o.platform_code, platforms)}</TD>
                <TD><StatusBadge status={o.status} /></TD>
                <TD className="whitespace-nowrap font-medium">{formatBRL(o.current_price)}</TD>
                <TD className={verifiedDiscount(o) != null ? "text-success" : "text-muted-foreground"}>{verifiedDiscount(o) != null ? formatPercent(verifiedDiscount(o)) : "—"}</TD>
                <TD className="whitespace-nowrap">{totalPrice(o) != null ? formatBRL(totalPrice(o)) : <span className="text-muted-foreground">?</span>}</TD>
                <TD><StockBadge status={o.stock_status} /></TD>
                <TD><ScorePill scoring={o.scoring} /></TD>
                {activeProfile && <TD>{o.filter && <DecisionBadge decision={o.filter.decision} />}</TD>}
                <TD className={cn("whitespace-nowrap text-xs", !o.last_verified_at && "text-warning")}>{formatRelative(o.last_verified_at)}</TD>
                <TD><ActionsMenu o={o} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {filtered.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />}

      <OfferFormDialog open={formOpen} onOpenChange={setFormOpen} offer={editing} platforms={platforms} categories={categories} settings={settings} profile={activeProfile} />
      <OfferDetailsDialog
        offer={details} open={!!details} onOpenChange={(o) => !o && setDetailsId(null)} observations={observations}
        allOffers={data} platforms={platforms} initialTab={detailsTab}
        actions={details && <>
          <Button size="sm" variant="outline" onClick={() => { setDetailsId(null); openEdit(details); }}><Pencil /> Editar</Button>
          {OFFER_TRANSITIONS[details.status].includes("aprovada") && <Button size="sm" variant="success" onClick={() => setStatus(details, "aprovada")}><CheckCircle2 /> Aprovar</Button>}
          {OFFER_TRANSITIONS[details.status].includes("rejeitada") && <Button size="sm" variant="outline" className="text-danger" onClick={() => setStatus(details, "rejeitada")}><XCircle /> Rejeitar</Button>}
          {OFFER_TRANSITIONS[details.status].filter((s: OfferStatus) => !["aprovada", "rejeitada", "arquivada"].includes(s)).map((s) => (
            <Button key={s} size="sm" variant="ghost" onClick={() => setStatus(details, s)}>→ {OFFER_STATUS[s].label}</Button>
          ))}
        </>}
      />
      <LinkDialog offer={linkFor} onClose={() => setLinkFor(null)} onSave={(url) => { patch.mutate({ id: linkFor!.id, values: { affiliate_url: url }, message: "Link de afiliado salvo." }); setLinkFor(null); }} />
      <RequirementDialog req={requirement} onOpenChange={(o) => !o && setRequirement(null)} />

      <Dialog open={!!revalidate} onOpenChange={(o) => !o && setRevalidate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revalidar informações</DialogTitle>
            <DialogDescription>{revalidate?.product.name}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 text-sm">
            {revalidate && integrationOf(revalidate.platform_code)?.status !== "conectada_validada" && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                A revalidação automática exige a integração com <strong>{platformName(revalidate.platform_code, platforms)}</strong> conectada e validada
                (status atual: {integrationOf(revalidate.platform_code)?.status ?? "não configurada"}). Nenhuma consulta externa foi feita.
              </p>
            )}
            <p>Você pode revalidar manualmente: confira preço, frete, estoque e cupom na loja e atualize o cadastro. A data da verificação será registrada.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevalidate(null)}>Cancelar</Button>
            <Button variant="outline" onClick={() => { const o = revalidate!; setRevalidate(null); openEdit(o); }}>Atualizar dados</Button>
            <Button onClick={() => { patch.mutate({ id: revalidate!.id, values: { last_verified_at: new Date().toISOString() }, message: "Verificação manual registrada." }); setRevalidate(null); }}>
              Conferi — os dados continuam corretos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
