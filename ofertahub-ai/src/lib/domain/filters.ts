import { z } from "zod";
import type { FilterDecision, OfferWithProduct } from "../data/types";
import { dataQuality, verifiedDiscount } from "./offers";
import { CONFIDENCE_RANK, type HistoryConfidence } from "./history";

export const filterRulesSchema = z.object({
  minDiscount: z.number().min(0).max(100).nullable(),
  minRating: z.number().min(0).max(5).nullable(),
  minRatingCount: z.number().int().min(0).nullable(),
  minPrice: z.number().min(0).nullable(),
  maxPrice: z.number().min(0).nullable(),
  allowedPlatforms: z.array(z.string()),
  allowedCategories: z.array(z.string()),
  blockedTerms: z.array(z.string()),
  minSellerReputation: z.number().min(0).max(100).nullable(),
  minCommission: z.number().min(0).max(100).nullable(),
  maxCommission: z.number().min(0).max(100).nullable(),
  requireCoupon: z.boolean(),
  requireInStock: z.boolean(),
  minDataQuality: z.number().min(0).max(100).nullable(),
  maxVerificationAgeHours: z.number().int().min(1).nullable(),
  minHistoryConfidence: z.enum(["baixa", "media", "alta"]).nullable(),
  requireHumanReview: z.boolean(),
}).refine((r) => r.minPrice == null || r.maxPrice == null || r.minPrice <= r.maxPrice, { message: "Preço mínimo maior que o máximo.", path: ["maxPrice"] })
  .refine((r) => r.minCommission == null || r.maxCommission == null || r.minCommission <= r.maxCommission, { message: "Comissão mínima maior que a máxima.", path: ["maxCommission"] });

export type FilterRules = z.infer<typeof filterRulesSchema>;

export const EMPTY_RULES: FilterRules = {
  minDiscount: null, minRating: null, minRatingCount: null, minPrice: null, maxPrice: null,
  allowedPlatforms: [], allowedCategories: [], blockedTerms: [], minSellerReputation: null,
  minCommission: null, maxCommission: null, requireCoupon: false, requireInStock: false,
  minDataQuality: null, maxVerificationAgeHours: null, minHistoryConfidence: null, requireHumanReview: true,
};

/** Exemplo do enunciado: Perfil Tecnologia (valores editáveis). */
export const TECH_PRESET: { name: string; category: string; description: string; rules: FilterRules } = {
  name: "Perfil Tecnologia",
  category: "Tecnologia",
  description: "Desconto ≥ 20%, avaliação ≥ 4,5, ≥ 100 avaliações, até R$ 500 e estoque confirmado.",
  rules: { ...EMPTY_RULES, minDiscount: 20, minRating: 4.5, minRatingCount: 100, maxPrice: 500, requireInStock: true, allowedCategories: ["Tecnologia"] },
};

export type CheckStatus = "ok" | "falha" | "sem_dados";
export interface FilterCheck { key: string; label: string; status: CheckStatus; message: string }
export interface FilterResult { decision: FilterDecision; checks: FilterCheck[] }

export interface FilterContext {
  now?: Date;
  /** Confiança do histórico da oferta, quando calculada. */
  historyConfidence?: HistoryConfidence;
  /** Reputação numérica do vendedor (0–100), se disponível de fonte oficial. */
  sellerReputation?: number | null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Avalia uma oferta contra um perfil de filtros.
 * Regra central: AUSÊNCIA DE DADOS NUNCA É APROVAÇÃO — gera "aguardando_dados".
 * Prioridade: rejeitado > aguardando_dados > revisao_humana > aprovado.
 */
export function evaluateFilters(offer: OfferWithProduct, rules: FilterRules, ctx: FilterContext = {}): FilterResult {
  const checks: FilterCheck[] = [];
  const now = ctx.now ?? new Date();
  const add = (key: string, label: string, status: CheckStatus, message: string) => checks.push({ key, label, status, message });

  const numeric = (key: string, label: string, value: number | null | undefined, min: number | null, max: number | null, fmt: (n: number) => string) => {
    if (min == null && max == null) return;
    if (value == null) return add(key, label, "sem_dados", `${label}: dado não disponível.`);
    if (min != null && value < min) return add(key, label, "falha", `${label} ${fmt(value)} abaixo do mínimo ${fmt(min)}.`);
    if (max != null && value > max) return add(key, label, "falha", `${label} ${fmt(value)} acima do máximo ${fmt(max)}.`);
    add(key, label, "ok", `${label} ${fmt(value)} dentro do limite.`);
  };
  const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  // Termos proibidos (bloqueio)
  if (rules.blockedTerms.length) {
    const hay = norm(`${offer.product.name} ${offer.product.brand ?? ""} ${offer.product.model ?? ""} ${offer.product.description ?? ""}`);
    const hit = rules.blockedTerms.find((t) => t.trim() && hay.includes(norm(t)));
    add("blockedTerms", "Produtos proibidos", hit ? "falha" : "ok", hit ? `Contém termo proibido: "${hit}".` : "Nenhum termo proibido encontrado.");
  }
  if (rules.allowedPlatforms.length) {
    const ok = rules.allowedPlatforms.includes(offer.platform_code);
    add("platform", "Plataforma", ok ? "ok" : "falha", ok ? "Plataforma permitida." : "Plataforma não permitida neste perfil.");
  }
  if (rules.allowedCategories.length) {
    const cat = offer.product.category;
    if (!cat) add("category", "Categoria", "sem_dados", "Categoria não informada.");
    else {
      const ok = rules.allowedCategories.some((c) => norm(c) === norm(cat));
      add("category", "Categoria", ok ? "ok" : "falha", ok ? `Categoria "${cat}" permitida.` : `Categoria "${cat}" fora do perfil.`);
    }
  }

  // Desconto: somente o VERIFICADO conta
  if (rules.minDiscount != null) {
    const d = verifiedDiscount(offer);
    if (d == null) {
      const why = offer.reference_price_source === "preco_riscado_vendedor"
        ? "Preço de referência é o preço riscado do vendedor, que não comprova desconto real."
        : "Sem preço de referência verificável.";
      add("discount", "Desconto mínimo", "sem_dados", why);
    } else numeric("discount", "Desconto verificado", d, rules.minDiscount, null, pct);
  }
  numeric("rating", "Avaliação", offer.rating, rules.minRating, null, (n) => n.toLocaleString("pt-BR"));
  numeric("ratingCount", "Quantidade de avaliações", offer.rating_count, rules.minRatingCount, null, (n) => n.toLocaleString("pt-BR"));
  numeric("price", "Preço", offer.current_price, rules.minPrice, rules.maxPrice, money);
  numeric("sellerReputation", "Reputação do vendedor", ctx.sellerReputation ?? null, rules.minSellerReputation, null, (n) => `${n}/100`);
  numeric("commission", "Comissão", offer.commission_rate, rules.minCommission, rules.maxCommission, pct);

  if (rules.requireCoupon) {
    add("coupon", "Cupom", offer.coupon_code ? "ok" : "falha", offer.coupon_code ? `Cupom ${offer.coupon_code} associado.` : "Nenhum cupom associado.");
  }
  if (rules.requireInStock) {
    const s = offer.stock_status;
    if (s === "desconhecido") add("stock", "Estoque", "sem_dados", "Disponibilidade não confirmada.");
    else if (s === "sem_estoque") add("stock", "Estoque", "falha", "Produto sem estoque.");
    else add("stock", "Estoque", "ok", s === "baixo_estoque" ? "Em estoque (baixo)." : "Disponibilidade confirmada.");
  }
  if (rules.minDataQuality != null) {
    const q = dataQuality(offer);
    add("dataQuality", "Qualidade dos dados", q.score >= rules.minDataQuality ? "ok" : "falha",
      q.score >= rules.minDataQuality ? `Completude ${q.score}%.` : `Completude ${q.score}% (mínimo ${rules.minDataQuality}%). Faltam: ${q.missing.join(", ")}.`);
  }
  if (rules.maxVerificationAgeHours != null) {
    if (!offer.last_verified_at) add("verifiedAt", "Última verificação", "sem_dados", "Oferta nunca verificada.");
    else {
      const hours = (now.getTime() - new Date(offer.last_verified_at).getTime()) / 3_600_000;
      add("verifiedAt", "Última verificação", hours <= rules.maxVerificationAgeHours ? "ok" : "falha",
        hours <= rules.maxVerificationAgeHours ? `Verificada há ${Math.floor(hours)} h.` : `Verificação desatualizada (${Math.floor(hours)} h; máximo ${rules.maxVerificationAgeHours} h).`);
    }
  }
  if (rules.minHistoryConfidence) {
    const c = ctx.historyConfidence ?? "insuficiente";
    if (c === "insuficiente") add("history", "Confiança do histórico", "sem_dados", "Histórico insuficiente.");
    else add("history", "Confiança do histórico", CONFIDENCE_RANK[c] >= CONFIDENCE_RANK[rules.minHistoryConfidence] ? "ok" : "falha", `Confiança ${c}.`);
  }

  let decision: FilterDecision;
  if (checks.some((c) => c.status === "falha")) decision = "rejeitado";
  else if (checks.some((c) => c.status === "sem_dados")) decision = "aguardando_dados";
  else if (rules.requireHumanReview || checks.length === 0) decision = "revisao_humana";
  else decision = "aprovado";
  return { decision, checks };
}
