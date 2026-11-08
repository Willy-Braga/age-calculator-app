/**
 * Contrato dos adaptadores de plataformas (lado servidor).
 *
 * Um adaptador só deve existir aqui quando fizer chamadas REAIS a uma API
 * oficial e autorizada. Nenhum adaptador pode simular sucesso: `testConnection`
 * precisa executar uma requisição real e validar a resposta.
 */
export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface PlatformAdapter {
  code: string;
  /** Campos esperados no payload de credenciais. */
  credentialFields: string[];
  testConnection(credentials: Record<string, string>): Promise<ConnectionTestResult>;
}

/**
 * Hotmart: autenticação OAuth client_credentials documentada em developers.hotmart.com.
 * O teste solicita um token — se a Hotmart retornar access_token, as credenciais são válidas.
 */
const hotmart: PlatformAdapter = {
  code: "hotmart",
  credentialFields: ["client_id", "client_secret", "basic_token"],
  async testConnection(c) {
    const url = `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${encodeURIComponent(c.client_id)}&client_secret=${encodeURIComponent(c.client_secret)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${c.basic_token}`, "Content-Type": "application/json" },
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && typeof body.access_token === "string") {
      return { ok: true, message: "Token OAuth emitido pela Hotmart com sucesso.", details: { expires_in: body.expires_in } };
    }
    return { ok: false, message: `Hotmart recusou as credenciais (HTTP ${res.status}).`, details: { error: body.error ?? body.message } };
  },
};

export const adapters: Record<string, PlatformAdapter> = {
  hotmart,
};
