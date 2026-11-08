import type { OfferStatus, ProductOffer, StockStatus, FilterDecision } from "../data/types";

export const OFFER_STATUS: Record<OfferStatus, { label: string; variant: "default" | "violet" | "success" | "warning" | "danger" | "muted" }> = {
  encontrada: { label: "Encontrada", variant: "default" },
  em_verificacao: { label: "Em verificação", variant: "warning" },
  aguardando_aprovacao: { label: "Aguardando aprovação", variant: "violet" },
  aprovada: { label: "Aprovada", variant: "success" },
  publicada: { label: "Publicada", variant: "success" },
  expirada: { label: "Expirada", variant: "muted" },
  rejeitada: { label: "Rejeitada", variant: "danger" },
  dados_insuficientes: { label: "Dados insuficientes", variant: "warning" },
  arquivada: { label: "Arquivada", variant: "muted" },
};

/** Fluxo principal: Encontrada → Em verificação → Aguardando aprovação → Aprovada → Publicada → Expirada. */
export const OFFER_PIPELINE: OfferStatus[] = ["encontrada", "em_verificacao", "aguardando_aprovacao", "aprovada", "publicada", "expirada"];

/** Transições permitidas manualmente (evita, por ex., publicar algo rejeitado). */
export const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  encontrada: ["em_verificacao", "rejeitada", "dados_insuficientes", "arquivada"],
  em_verificacao: ["aguardando_aprovacao", "rejeitada", "dados_insuficientes", "arquivada"],
  aguardando_aprovacao: ["aprovada", "rejeitada", "em_verificacao", "arquivada"],
  aprovada: ["publicada", "expirada", "rejeitada", "em_verificacao", "arquivada"],
  publicada: ["expirada", "arquivada"],
  expirada: ["em_verificacao", "arquivada"],
  rejeitada: ["em_verificacao", "arquivada"],
  dados_insuficientes: ["em_verificacao", "rejeitada", "arquivada"],
  arquivada: ["encontrada"],
};

export function canTransition(from: OfferStatus, to: OfferStatus) {
  return OFFER_TRANSITIONS[from]?.includes(to) ?? false;
}

export const STOCK_STATUS: Record<StockStatus, { label: string; variant: "success" | "warning" | "danger" | "muted" }> = {
  em_estoque: { label: "Em estoque", variant: "success" },
  baixo_estoque: { label: "Estoque baixo", variant: "warning" },
  sem_estoque: { label: "Sem estoque", variant: "danger" },
  desconhecido: { label: "Estoque não informado", variant: "muted" },
};

export const FILTER_DECISION: Record<FilterDecision, { label: string; variant: "success" | "warning" | "danger" | "violet" }> = {
  aprovado: { label: "Aprovado nos filtros", variant: "success" },
  rejeitado: { label: "Rejeitado nos filtros", variant: "danger" },
  aguardando_dados: { label: "Aguardando dados", variant: "warning" },
  revisao_humana: { label: "Revisão humana", variant: "violet" },
};

export const REFERENCE_SOURCES = {
  historico: "Histórico próprio de observações",
  manual_verificado: "Verificado manualmente pelo administrador",
  api_oficial: "API oficial da plataforma",
  preco_riscado_vendedor: "Preço riscado do vendedor (não comprova desconto)",
} as const;

/**
 * Desconto VERIFICADO. Preço riscado do vendedor não é prova de desconto real
 * (espelha public.offer_verified_discount no banco).
 */
export function verifiedDiscount(o: Pick<ProductOffer, "current_price" | "reference_price" | "reference_price_source">): number | null {
  if (o.current_price == null || o.reference_price == null || o.reference_price === 0) return null;
  if (!o.reference_price_source || o.reference_price_source === "preco_riscado_vendedor") return null;
  return Math.round((1 - o.current_price / o.reference_price) * 10000) / 100;
}

/** Desconto anunciado (pode ser baseado em preço riscado). Apenas informativo. */
export function nominalDiscount(o: Pick<ProductOffer, "current_price" | "reference_price">): number | null {
  if (o.current_price == null || o.reference_price == null || o.reference_price === 0) return null;
  return Math.round((1 - o.current_price / o.reference_price) * 10000) / 100;
}

export function totalPrice(o: Pick<ProductOffer, "current_price" | "shipping_cost">): number | null {
  if (o.current_price == null) return null;
  if (o.shipping_cost == null) return null;
  return Math.round((o.current_price + o.shipping_cost) * 100) / 100;
}

/** Completude dos dados (0–100) considerando os campos que sustentam uma decisão. */
export const QUALITY_FIELDS: { key: keyof ProductOffer; label: string; weight: number }[] = [
  { key: "current_price", label: "Preço atual", weight: 20 },
  { key: "reference_price", label: "Preço de referência", weight: 15 },
  { key: "original_url", label: "Link original", weight: 15 },
  { key: "shipping_cost", label: "Frete", weight: 10 },
  { key: "rating", label: "Avaliação", weight: 10 },
  { key: "rating_count", label: "Qtde. de avaliações", weight: 10 },
  { key: "stock_status", label: "Estoque", weight: 10 },
  { key: "last_verified_at", label: "Última verificação", weight: 10 },
];

export function dataQuality(o: ProductOffer): { score: number; missing: string[] } {
  let score = 0;
  const missing: string[] = [];
  for (const f of QUALITY_FIELDS) {
    const v = o[f.key];
    const present = f.key === "stock_status" ? v !== "desconhecido" : v !== null && v !== undefined && v !== "";
    if (present) score += f.weight;
    else missing.push(f.label);
  }
  return { score, missing };
}
