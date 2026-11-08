import { z } from "zod";

export const SCORE_COMPONENTS = [
  { key: "economia", label: "Economia real", default: 30, help: "Desconto VERIFICADO sobre preço de referência confiável (nunca preço riscado)." },
  { key: "confiabilidade", label: "Confiabilidade do produto e vendedor", default: 25, help: "Avaliação, quantidade de avaliações e reputação do vendedor." },
  { key: "frete", label: "Frete e condições", default: 15, help: "Frete conhecido e baixo, estoque confirmado." },
  { key: "dados", label: "Qualidade do histórico e dos dados", default: 15, help: "Completude dos dados e confiança do histórico de preços." },
  { key: "audiencia", label: "Interesse da audiência", default: 10, help: "Categoria entre as categorias favoritas configuradas." },
  { key: "comissao", label: "Comissão estimada", default: 5, help: "Peso deliberadamente baixo: comissão não é o principal critério." },
] as const;

export type ScoreComponentKey = (typeof SCORE_COMPONENTS)[number]["key"];
export type ScoreWeights = Record<ScoreComponentKey, number>;

export const DEFAULT_WEIGHTS: ScoreWeights = Object.fromEntries(SCORE_COMPONENTS.map((c) => [c.key, c.default])) as ScoreWeights;

export const weightsSchema = z
  .object(Object.fromEntries(SCORE_COMPONENTS.map((c) => [c.key, z.number().int().min(0).max(100)])) as Record<ScoreComponentKey, z.ZodNumber>)
  .refine((w) => Object.values(w).reduce((s, v) => s + v, 0) === 100, { message: "A soma dos pesos deve ser exatamente 100." });

export const orgSettingsSchema = z.object({
  scoringWeights: weightsSchema,
  favoriteCategories: z.array(z.string().min(1).max(60)).max(50),
  approvalPolicy: z.object({
    mode: z.enum(["manual", "sugerir_alta_prioridade"]),
    requireLinkCheck: z.boolean(),
    requireVerifiedPrice: z.boolean(),
  }),
  authorizedPlatforms: z.array(z.string()),
  verificationFrequencyHours: z.number().int().min(1).max(720),
  maxVerificationAgeHours: z.number().int().min(1).max(2160),
  referenceZipCode: z.string().regex(/^(\d{5}-?\d{3})?$/, "CEP inválido").optional().default(""),
  defaultFilterProfileId: z.string().nullable(),
  notifications: z.object({
    highScore: z.boolean(), targetPrice: z.boolean(), outOfStock: z.boolean(), expired: z.boolean(),
    integrationFailure: z.boolean(), publicationPending: z.boolean(), automationError: z.boolean(), commissionImported: z.boolean(),
  }),
  ai: z.object({ provider: z.enum(["nenhum", "lovable_ai", "openai", "anthropic", "google"]), useTemplatesFallback: z.boolean() }),
  disclosureText: z.string().max(200),
});
export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  scoringWeights: DEFAULT_WEIGHTS,
  favoriteCategories: [],
  approvalPolicy: { mode: "manual", requireLinkCheck: true, requireVerifiedPrice: true },
  authorizedPlatforms: ["amazon", "shopee", "mercadolivre", "magalu", "hotmart", "kiwify", "manual"],
  verificationFrequencyHours: 24,
  maxVerificationAgeHours: 72,
  referenceZipCode: "",
  defaultFilterProfileId: null,
  notifications: {
    highScore: true, targetPrice: true, outOfStock: true, expired: true,
    integrationFailure: true, publicationPending: true, automationError: true, commissionImported: true,
  },
  ai: { provider: "nenhum", useTemplatesFallback: true },
  disclosureText: "#publi • Contém link de afiliado",
};

export type ThemePref = "dark" | "light" | "system";
export type DashboardWidgetPref = { id: string; visible: boolean; size: 1 | 2 };

export interface UserPreferences {
  theme: ThemePref;
  sidebarCollapsed: boolean;
  offersView: "cards" | "tabela";
  density: "confortavel" | "compacta";
  dashboardWidgets: DashboardWidgetPref[];
}

export const DEFAULT_USER_PREFS: UserPreferences = {
  theme: "dark",
  sidebarCollapsed: false,
  offersView: "cards",
  density: "confortavel",
  dashboardWidgets: [],
};

/** Mescla parcial salvo no banco com padrões (configurações novas ganham valor padrão). */
export function mergeOrgSettings(partial: Partial<OrgSettings> | null | undefined): OrgSettings {
  const p = partial ?? {};
  return {
    ...DEFAULT_ORG_SETTINGS,
    ...p,
    scoringWeights: { ...DEFAULT_WEIGHTS, ...(p.scoringWeights ?? {}) },
    approvalPolicy: { ...DEFAULT_ORG_SETTINGS.approvalPolicy, ...(p.approvalPolicy ?? {}) },
    notifications: { ...DEFAULT_ORG_SETTINGS.notifications, ...(p.notifications ?? {}) },
    ai: { ...DEFAULT_ORG_SETTINGS.ai, ...(p.ai ?? {}) },
  };
}
