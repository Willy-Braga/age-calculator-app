import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <div className="brand-gradient absolute inset-0 opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <div className="[&_span]:text-white"><Logo /></div>
          <div className="max-w-md space-y-5">
            <h2 className="text-3xl font-semibold leading-tight">Ofertas verdadeiras, decisões transparentes.</h2>
            <ul className="space-y-2.5 text-sm text-white/90">
              {[
                "Desconto calculado só com preço de referência verificável",
                "Filtros e pontuação explicáveis, configurados por você",
                "Integrações oficiais com credenciais protegidas no servidor",
                "Fluxo manual e seguro para divulgação no WhatsApp",
              ].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {t}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/70">OfertaHub AI · Marketing de afiliados com responsabilidade</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
