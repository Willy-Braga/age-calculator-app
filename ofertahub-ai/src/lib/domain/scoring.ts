import type { OfferWithProduct } from "../data/types";
import { dataQuality, verifiedDiscount } from "./offers";
import { checkLink } from "./links";
import type { HistoryConfidence } from "./history";
import { SCORE_COMPONENTS, type ScoreComponentKey, type ScoreWeights } from "./settings";

export interface ScoreComponent {
  key: ScoreComponentKey;
  label: string;
  weight: number;
  /** fração atingida 0..1 */
  ratio: number;
  points: number;
  explanation: string;
}

export type ScoreClass = "alta" | "revisao" | "baixa" | "bloqueada";
export interface ScoreResult {
  score: number;
  classification: ScoreClass;
  components: ScoreComponent[];
  blockers: string[];
}

export const SCORE_CLASS: Record<ScoreClass, { label: string; variant: "success" | "warning" | "muted" | "danger" }> = {
  alta: { label: "Alta prioridade", variant: "success" },
  revisao: { label: "Revisão recomendada", variant: "warning" },
  baixa: { label: "Baixa prioridade", variant: "muted" },
  bloqueada: { label: "Bloqueada", variant: "danger" },
};

export interface ScoreContext {
  favoriteCategories?: string[];
  historyConfidence?: HistoryConfidence;
  sellerReputation?: number | null;
  /** bloqueios externos (direitos autorais, segurança etc.) */
  extraBlockers?: string[];
}

const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const HISTORY_RATIO: Record<HistoryConfidence, number> = { insuficiente: 0, baixa: 0.35, media: 0.7, alta: 1 };

/**
 * Pontuação transparente 0–100. Cada componente explica de onde veio sua nota.
 * Bloqueios obrigatórios prevalecem sobre qualquer nota: classificação "bloqueada".
 */
export function scoreOffer(offer: OfferWithProduct, weights: ScoreWeights, ctx: ScoreContext = {}): ScoreResult {
  const parts: Record<ScoreComponentKey, { ratio: number; explanation: string }> = {} as never;

  // Economia real (desconto verificado; 50% ou mais = nota máxima)
  const d = verifiedDiscount(offer);
  parts.economia = d == null
    ? { ratio: 0, explanation: offer.reference_price_source === "preco_riscado_vendedor" ? "Preço riscado do vendedor não conta como economia real." : "Sem preço de referência verificável: 0 pontos." }
    : d <= 0 ? { ratio: 0, explanation: `Sem economia (${br(d)}%).` }
    : { ratio: clamp(d / 50), explanation: `Desconto verificado de ${br(d)}% (50% ou mais = nota máxima).` };

  // Confiabilidade: avaliação ponderada pela quantidade (60%) + reputação do vendedor (40%)
  const notes: string[] = [];
  let conf = 0;
  if (offer.rating != null && offer.rating_count != null) {
    const r = clamp((offer.rating - 3) / 2) * clamp(offer.rating_count / 200);
    conf += 0.6 * r;
    notes.push(`avaliação ${br(offer.rating)} com ${offer.rating_count.toLocaleString("pt-BR")} avaliações`);
  } else notes.push("avaliação indisponível");
  if (ctx.sellerReputation != null) {
    conf += 0.4 * clamp(ctx.sellerReputation / 100);
    notes.push(`reputação do vendedor ${ctx.sellerReputation}/100`);
  } else notes.push("reputação do vendedor indisponível");
  parts.confiabilidade = { ratio: clamp(conf), explanation: `${notes.join("; ")}.` };

  // Frete (70%) + estoque (30%)
  let frete = 0;
  const fn: string[] = [];
  if (offer.shipping_cost == null) fn.push("frete desconhecido");
  else if (offer.shipping_cost === 0) { frete += 0.7; fn.push("frete grátis"); }
  else if (offer.current_price) {
    const share = offer.shipping_cost / (offer.current_price + offer.shipping_cost);
    frete += 0.7 * clamp(1 - share / 0.3);
    fn.push(`frete = ${(share * 100).toFixed(0)}% do total`);
  }
  if (offer.stock_status === "em_estoque") { frete += 0.3; fn.push("estoque confirmado"); }
  else if (offer.stock_status === "baixo_estoque") { frete += 0.15; fn.push("estoque baixo"); }
  else fn.push(offer.stock_status === "sem_estoque" ? "sem estoque" : "estoque não confirmado");
  parts.frete = { ratio: clamp(frete), explanation: `${fn.join("; ")}.` };

  // Qualidade dos dados (50%) + confiança do histórico (50%)
  const q = dataQuality(offer);
  const hc = ctx.historyConfidence ?? "insuficiente";
  parts.dados = { ratio: clamp(0.5 * (q.score / 100) + 0.5 * HISTORY_RATIO[hc]), explanation: `Completude ${q.score}%; histórico: ${hc}.` };

  // Interesse da audiência
  const fav = (ctx.favoriteCategories ?? []).map((c) => c.toLowerCase());
  const cat = offer.product.category?.toLowerCase();
  parts.audiencia = fav.length === 0
    ? { ratio: 0.5, explanation: "Nenhuma categoria favorita configurada: valor neutro (50%)." }
    : cat && fav.includes(cat) ? { ratio: 1, explanation: `Categoria "${offer.product.category}" está entre as favoritas.` }
    : { ratio: 0.2, explanation: cat ? `Categoria "${offer.product.category}" não está entre as favoritas.` : "Categoria não informada." };

  // Comissão (10% ou mais = nota máxima)
  parts.comissao = offer.commission_rate == null
    ? { ratio: 0, explanation: "Comissão desconhecida." }
    : { ratio: clamp(offer.commission_rate / 10), explanation: `Comissão estimada de ${br(offer.commission_rate)}%.` };

  const components: ScoreComponent[] = SCORE_COMPONENTS.map((c) => {
    const w = weights[c.key] ?? 0;
    const p = parts[c.key];
    return { key: c.key, label: c.label, weight: w, ratio: p.ratio, points: Math.round(w * p.ratio * 10) / 10, explanation: p.explanation };
  });
  const score = Math.max(0, Math.min(100, Math.round(components.reduce((s, c) => s + c.points, 0))));

  const blockers: string[] = [...(ctx.extraBlockers ?? [])];
  if (offer.current_price == null) blockers.push("Preço não confirmado.");
  if (offer.affiliate_url) {
    const lc = checkLink(offer.affiliate_url, offer.platform_code, "afiliado");
    if (!lc.valid) blockers.push(`Link de afiliado inválido: ${lc.messages[0]}`);
  }
  if (offer.original_url) {
    const lc = checkLink(offer.original_url, offer.platform_code);
    if (!lc.valid) blockers.push(`Link original inválido: ${lc.messages[0]}`);
  }

  const classification: ScoreClass = blockers.length ? "bloqueada" : score >= 85 ? "alta" : score >= 70 ? "revisao" : "baixa";
  return { score, classification, components, blockers };
}
