/**
 * Verificação ESTRUTURAL de links (formato, protocolo, domínio esperado).
 * Isto NÃO confirma a atribuição de cliques/vendas — apenas a plataforma pode fazê-lo.
 */
export const PLATFORM_DOMAINS: Record<string, string[]> = {
  amazon: ["amazon.com.br", "amzn.to", "amazon.com"],
  shopee: ["shopee.com.br", "shope.ee", "s.shopee.com.br"],
  mercadolivre: ["mercadolivre.com.br", "mercadolivre.com", "mercadolibre.com", "meli.la"],
  magalu: ["magazineluiza.com.br", "magazinevoce.com.br", "magalu.com", "divulgador.magalu.com"],
  hotmart: ["hotmart.com", "go.hotmart.com", "pay.hotmart.com"],
  kiwify: ["kiwify.com.br", "pay.kiwify.com.br", "kiwify.app"],
};

export interface LinkCheck {
  valid: boolean;
  level: "valido" | "atencao" | "invalido";
  messages: string[];
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function checkLink(url: string | null | undefined, platform: string, kind: "original" | "afiliado" = "original"): LinkCheck {
  if (!url || !url.trim()) return { valid: false, level: "invalido", messages: ["Link não informado."] };
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, level: "invalido", messages: ["Formato de URL inválido."] };
  }
  const messages: string[] = [];
  if (parsed.protocol !== "https:") return { valid: false, level: "invalido", messages: ["O link deve usar HTTPS."] };
  const host = parsed.hostname.toLowerCase();
  const domains = PLATFORM_DOMAINS[platform];
  if (domains && !domains.some((d) => hostMatches(host, d))) {
    return { valid: false, level: "invalido", messages: [`Domínio "${host}" não pertence à plataforma selecionada.`] };
  }
  let level: LinkCheck["level"] = "valido";
  if (!domains) {
    messages.push("Plataforma sem domínios conhecidos: domínio não verificado.");
    level = "atencao";
  }
  if (kind === "afiliado" && platform === "amazon" && host.endsWith("amazon.com.br") && !parsed.searchParams.get("tag")) {
    messages.push("Link da Amazon sem parâmetro de associado (tag).");
    level = "atencao";
  }
  messages.push("Estrutura válida. A atribuição só é confirmada pelos relatórios da plataforma.");
  return { valid: true, level, messages };
}
