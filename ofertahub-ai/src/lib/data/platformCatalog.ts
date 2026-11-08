import type { AffiliatePlatform } from "./types";

/**
 * Cópia do catálogo de supabase/migrations/20261108000200_platform_catalog.sql.
 * Usada no modo DEMO (sem banco). No modo real os dados vêm da tabela affiliate_platforms.
 */
export const PLATFORM_CATALOG: AffiliatePlatform[] = [
  {
    code: "amazon", name: "Amazon Associados", website: "https://associados.amazon.com.br", kind: "marketplace",
    connection_methods: ["api_oficial", "manual", "csv"], supported_features: ["busca_produtos", "preco_atual", "link_afiliado", "relatorio_csv"],
    required_credentials: ["Access Key", "Secret Key", "Partner Tag (tag de associado)"],
    known_limits: "A API de produtos da Amazon só é liberada para contas de Associados aprovadas e com vendas qualificadas recentes; possui cotas de requisições por segundo/dia vinculadas à receita. Exibição de preços exige atualização frequente e regras de exibição.",
    official_docs_url: "https://webservices.amazon.com.br/paapi5/documentation/", availability: "requer_aprovacao",
    notes: "Enquanto a API não for liberada, use links do SiteStripe (inclusão manual) e importação dos relatórios CSV do painel de Associados.", sort_order: 10,
  },
  {
    code: "shopee", name: "Shopee Afiliados", website: "https://affiliate.shopee.com.br", kind: "marketplace",
    connection_methods: ["api_oficial", "manual", "csv"], supported_features: ["busca_produtos", "link_afiliado", "relatorio_conversoes", "relatorio_csv"],
    required_credentials: ["App ID", "Secret (Open API de Afiliados)"],
    known_limits: "A Open API de afiliados depende de aprovação da Shopee para a conta. Possui limites de requisições. Sem aprovação, utilize o painel oficial e a exportação de relatórios.",
    official_docs_url: "https://affiliate.shopee.com.br/open_api", availability: "requer_aprovacao", notes: null, sort_order: 20,
  },
  {
    code: "mercadolivre", name: "Mercado Livre", website: "https://www.mercadolivre.com.br/afiliados", kind: "marketplace",
    connection_methods: ["api_oficial", "manual", "csv"], supported_features: ["dados_item", "reputacao_vendedor", "relatorio_csv"],
    required_credentials: ["Client ID", "Client Secret", "Autorização OAuth do usuário"],
    known_limits: "A API pública do Mercado Livre exige aplicativo registrado e OAuth; vários endpoints (como busca) possuem restrições. A geração de links de afiliado é feita pelo portal de afiliados — não há API pública documentada para isso.",
    official_docs_url: "https://developers.mercadolivre.com.br", availability: "limitada", notes: null, sort_order: 30,
  },
  {
    code: "magalu", name: "Magalu (Parceiro Magalu)", website: "https://www.parceiromagalu.com.br", kind: "marketplace",
    connection_methods: ["manual", "csv"], supported_features: ["link_afiliado_manual"], required_credentials: [],
    known_limits: "Não há API pública documentada para afiliados do Parceiro Magalu. Utilize inclusão manual de ofertas e links.",
    official_docs_url: null, availability: "manual", notes: null, sort_order: 40,
  },
  {
    code: "hotmart", name: "Hotmart", website: "https://hotmart.com", kind: "infoproduto",
    connection_methods: ["api_oficial", "manual", "csv"], supported_features: ["historico_vendas", "comissoes", "relatorio_csv"],
    required_credentials: ["Client ID", "Client Secret", "Basic Token (credenciais de desenvolvedor da sua conta)"],
    known_limits: "A API da Hotmart usa credenciais geradas na própria conta (Ferramentas > Credenciais). Escopo restrito aos dados da conta; limites de requisições se aplicam.",
    official_docs_url: "https://developers.hotmart.com", availability: "disponivel", notes: null, sort_order: 50,
  },
  {
    code: "kiwify", name: "Kiwify", website: "https://kiwify.com.br", kind: "infoproduto",
    connection_methods: ["api_oficial", "manual", "csv"], supported_features: ["vendas", "relatorio_csv"],
    required_credentials: ["Client ID", "Client Secret", "Account ID"],
    known_limits: "A API pública da Kiwify é voltada principalmente a produtores; recursos para afiliados são limitados. Verifique disponibilidade na sua conta.",
    official_docs_url: "https://docs.kiwify.com.br", availability: "limitada", notes: null, sort_order: 60,
  },
  {
    code: "manual", name: "Cadastro manual / Outra loja", website: null, kind: "outro",
    connection_methods: ["manual", "csv"], supported_features: ["cadastro_manual", "importacao_csv"], required_credentials: [],
    known_limits: "Sem integração externa. Os dados são informados pelo administrador e identificados como tal.",
    official_docs_url: null, availability: "manual", notes: null, sort_order: 900,
  },
];

/** Cor fixa por ENTIDADE (plataforma), nunca por posição no gráfico. Paleta categórica validada (CVD). */
export const PLATFORM_COLORS: Record<string, string> = {
  amazon: "var(--series-1)", shopee: "var(--series-2)", mercadolivre: "var(--series-3)", magalu: "var(--series-4)",
  hotmart: "var(--series-5)", kiwify: "var(--series-6)", manual: "var(--series-7)",
};

/** Campos de credencial (chaves) aceitos pela Edge Function, por plataforma. */
export const CREDENTIAL_FIELDS: Record<string, { key: string; label: string }[]> = {
  amazon: [{ key: "access_key", label: "Access Key" }, { key: "secret_key", label: "Secret Key" }, { key: "partner_tag", label: "Partner Tag" }],
  shopee: [{ key: "app_id", label: "App ID" }, { key: "secret", label: "Secret" }],
  mercadolivre: [{ key: "client_id", label: "Client ID" }, { key: "client_secret", label: "Client Secret" }],
  hotmart: [{ key: "client_id", label: "Client ID" }, { key: "client_secret", label: "Client Secret" }, { key: "basic_token", label: "Basic Token" }],
  kiwify: [{ key: "client_id", label: "Client ID" }, { key: "client_secret", label: "Client Secret" }, { key: "account_id", label: "Account ID" }],
};

export const platformName = (code: string, list: AffiliatePlatform[] = PLATFORM_CATALOG) =>
  list.find((p) => p.code === code)?.name ?? code;
