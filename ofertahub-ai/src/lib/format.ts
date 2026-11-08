const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR");
const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});

export const formatBRL = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : brl.format(v));
export const formatNumber = (v: number | null | undefined) => (v == null ? "—" : num.format(v));
export const formatPercent = (v: number | null | undefined) => (v == null ? "—" : `${pct.format(v)}%`);
export const formatDate = (v: string | Date | null | undefined) => (v ? dateFmt.format(new Date(v)) : "—");
export const formatDateTime = (v: string | Date | null | undefined) => (v ? dateTimeFmt.format(new Date(v)) : "—");

export function formatRelative(v: string | Date | null | undefined, now = new Date()): string {
  if (!v) return "nunca";
  const diff = (now.getTime() - new Date(v).getTime()) / 1000;
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `há ${Math.floor(diff / 86400)} dia(s)`;
  return formatDate(v);
}

/** Aceita "1.234,56", "1234.56", "R$ 99,90". Retorna null para vazio/ inválido. */
export function parseBRNumber(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = input.replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
