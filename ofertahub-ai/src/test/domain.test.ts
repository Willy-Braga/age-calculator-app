import { describe, expect, it } from "vitest";
import { makeOffer } from "./fixtures";
import { evaluateFilters, EMPTY_RULES, TECH_PRESET, filterRulesSchema } from "@/lib/domain/filters";
import { scoreOffer } from "@/lib/domain/scoring";
import { computeHistoryStats } from "@/lib/domain/history";
import { checkLink } from "@/lib/domain/links";
import { canTransition, dataQuality, verifiedDiscount, totalPrice } from "@/lib/domain/offers";
import { DEFAULT_WEIGHTS, weightsSchema, mergeOrgSettings } from "@/lib/domain/settings";
import { parseBRNumber, formatBRL } from "@/lib/format";

describe("desconto verificado", () => {
  it("calcula com referência verificável", () => {
    expect(verifiedDiscount(makeOffer())).toBeCloseTo(33.33, 1);
  });
  it("NÃO aceita preço riscado do vendedor como prova", () => {
    expect(verifiedDiscount(makeOffer({ reference_price_source: "preco_riscado_vendedor" }))).toBeNull();
    expect(verifiedDiscount(makeOffer({ reference_price_source: null }))).toBeNull();
  });
  it("total exige frete conhecido", () => {
    expect(totalPrice(makeOffer({ shipping_cost: 10 }))).toBe(110);
    expect(totalPrice(makeOffer({ shipping_cost: null }))).toBeNull();
  });
});

describe("motor de filtros", () => {
  const rules = TECH_PRESET.rules;
  it("aprova/encaminha para revisão quando todos os dados passam", () => {
    const r = evaluateFilters(makeOffer(), { ...rules, requireHumanReview: false });
    expect(r.decision).toBe("aprovado");
    expect(evaluateFilters(makeOffer(), rules).decision).toBe("revisao_humana");
  });
  it("rejeita quando uma regra falha", () => {
    const r = evaluateFilters(makeOffer({ current_price: 600, reference_price: 1000 }), rules);
    expect(r.decision).toBe("rejeitado");
    expect(r.checks.find((c) => c.key === "price")?.status).toBe("falha");
  });
  it("ausência de dados NUNCA é aprovação", () => {
    const r = evaluateFilters(makeOffer({ rating: null, rating_count: null }), { ...rules, requireHumanReview: false });
    expect(r.decision).toBe("aguardando_dados");
  });
  it("estoque desconhecido gera aguardando dados", () => {
    expect(evaluateFilters(makeOffer({ stock_status: "desconhecido" }), { ...rules, requireHumanReview: false }).decision).toBe("aguardando_dados");
  });
  it("preço riscado não satisfaz desconto mínimo", () => {
    const r = evaluateFilters(makeOffer({ reference_price_source: "preco_riscado_vendedor" }), { ...EMPTY_RULES, minDiscount: 10, requireHumanReview: false });
    expect(r.decision).toBe("aguardando_dados");
  });
  it("termos proibidos rejeitam (sem acento/maiúsculas)", () => {
    const r = evaluateFilters(makeOffer({}, { name: "Fone RÉPLICA premium" }), { ...EMPTY_RULES, blockedTerms: ["replica"] });
    expect(r.decision).toBe("rejeitado");
  });
  it("plataforma e categoria", () => {
    expect(evaluateFilters(makeOffer(), { ...EMPTY_RULES, allowedPlatforms: ["shopee"] }).decision).toBe("rejeitado");
    expect(evaluateFilters(makeOffer({}, { category: null }), { ...EMPTY_RULES, allowedCategories: ["Tecnologia"] }).decision).toBe("aguardando_dados");
  });
  it("valida faixas incoerentes", () => {
    expect(filterRulesSchema.safeParse({ ...EMPTY_RULES, minPrice: 500, maxPrice: 100 }).success).toBe(false);
  });
  it("perfil sem regras exige revisão humana", () => {
    expect(evaluateFilters(makeOffer(), { ...EMPTY_RULES, requireHumanReview: false }).decision).toBe("revisao_humana");
  });
});

describe("pontuação", () => {
  it("respeita os pesos e explica cada componente", () => {
    const r = scoreOffer(makeOffer(), DEFAULT_WEIGHTS, { historyConfidence: "alta", sellerReputation: 100, favoriteCategories: ["Tecnologia"] });
    expect(r.components).toHaveLength(6);
    expect(r.components.every((c) => c.explanation.length > 0)).toBe(true);
    expect(r.components.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    const economia = r.components.find((c) => c.key === "economia")!;
    expect(economia.points).toBeCloseTo(30 * (33.33 / 50), 0);
  });
  it("oferta excelente atinge alta prioridade", () => {
    const r = scoreOffer(makeOffer({ reference_price: 250, commission_rate: 10, rating: 5, rating_count: 1000 }), DEFAULT_WEIGHTS, { historyConfidence: "alta", sellerReputation: 100, favoriteCategories: ["Tecnologia"] });
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.classification).toBe("alta");
  });
  it("bloqueios prevalecem sobre a nota", () => {
    const r = scoreOffer(makeOffer({ affiliate_url: "https://evil.example.com/x" }), DEFAULT_WEIGHTS);
    expect(r.classification).toBe("bloqueada");
    expect(scoreOffer(makeOffer({ current_price: null }), DEFAULT_WEIGHTS).blockers).toContain("Preço não confirmado.");
  });
  it("alterar pesos altera a nota", () => {
    const o = makeOffer();
    const a = scoreOffer(o, DEFAULT_WEIGHTS).score;
    const b = scoreOffer(o, { economia: 100, confiabilidade: 0, frete: 0, dados: 0, audiencia: 0, comissao: 0 }).score;
    expect(a).not.toBe(b);
    expect(b).toBe(67);
  });
  it("pesos precisam somar 100", () => {
    expect(weightsSchema.safeParse(DEFAULT_WEIGHTS).success).toBe(true);
    expect(weightsSchema.safeParse({ ...DEFAULT_WEIGHTS, economia: 31 }).success).toBe(false);
  });
});

describe("histórico de preços", () => {
  it("sem observações = insuficiente, sem inventar valores", () => {
    const s = computeHistoryStats([]);
    expect(s.confidence).toBe("insuficiente");
    expect(s.min).toBeNull();
  });
  it("calcula min, max, média, mediana e variação", () => {
    const d = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
    const s = computeHistoryStats([{ price: 100, observed_at: d(0) }, { price: 80, observed_at: d(10) }, { price: 90, observed_at: d(5) }]);
    expect(s).toMatchObject({ count: 3, min: 80, max: 100, avg: 90, median: 90, variationPercent: -20, confidence: "baixa" });
    expect(s.lastChangeAt).toBe(d(10));
  });
});

describe("links", () => {
  it("valida domínio da plataforma e https", () => {
    expect(checkLink("https://www.amazon.com.br/dp/X?tag=abc-20", "amazon", "afiliado").level).toBe("valido");
    expect(checkLink("http://www.amazon.com.br/dp/X", "amazon").valid).toBe(false);
    expect(checkLink("https://amazon.com.br.fake.io/x", "amazon").valid).toBe(false);
    expect(checkLink("não é url", "shopee").valid).toBe(false);
  });
  it("alerta sobre link Amazon sem tag", () => {
    expect(checkLink("https://www.amazon.com.br/dp/X", "amazon", "afiliado").level).toBe("atencao");
  });
  it("nunca afirma atribuição", () => {
    expect(checkLink("https://shopee.com.br/x", "shopee").messages.join(" ")).toMatch(/atribuição só é confirmada/);
  });
});

describe("utilitários", () => {
  it("transições de status", () => {
    expect(canTransition("encontrada", "em_verificacao")).toBe(true);
    expect(canTransition("rejeitada", "publicada")).toBe(false);
  });
  it("qualidade dos dados", () => {
    expect(dataQuality(makeOffer()).score).toBe(100);
    expect(dataQuality(makeOffer({ rating: null, stock_status: "desconhecido" })).missing).toEqual(["Avaliação", "Estoque"]);
  });
  it("números e moeda pt-BR", () => {
    expect(parseBRNumber("1.234,56")).toBe(1234.56);
    expect(parseBRNumber("R$ 99,90")).toBe(99.9);
    expect(parseBRNumber("")).toBeNull();
    expect(formatBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });
  it("configurações mescladas com padrões", () => {
    expect(mergeOrgSettings({ favoriteCategories: ["A"] }).scoringWeights).toEqual(DEFAULT_WEIGHTS);
  });
});
