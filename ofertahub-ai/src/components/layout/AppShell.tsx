import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoadingRows } from "@/components/ui/states";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useApp } from "@/lib/auth/AppContext";
import { useUserPrefs } from "@/hooks/useSettings";
import { useApplyTheme } from "@/hooks/useTheme";
import { useConfirm } from "@/components/ui/confirm";

function DemoBanner() {
  const { mode, resetDemo, exitDemo } = useApp();
  const confirm = useConfirm();
  if (mode !== "demo") return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/15 px-4 py-1.5 text-center text-xs text-warning">
      <FlaskConical className="size-3.5" />
      <strong className="tracking-wide">MODO DEMO</strong>
      <span className="text-foreground/80">Todos os dados são fictícios, ficam apenas neste navegador e não representam informações de lojas.</span>
      <button
        className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
        onClick={async () => { if (await confirm({ title: "Restaurar dados DEMO?", description: "Todas as alterações feitas no modo DEMO serão descartadas.", confirmLabel: "Restaurar", destructive: true })) resetDemo(); }}
      >
        <RotateCcw className="size-3" /> Restaurar
      </button>
      <button className="font-medium underline-offset-2 hover:underline" onClick={exitDemo}>Sair do DEMO</button>
    </div>
  );
}

export function AppShell() {
  const { prefs, update } = useUserPrefs();
  useApplyTheme(prefs.theme);
  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={prefs.sidebarCollapsed} onToggle={() => update({ sidebarCollapsed: !prefs.sidebarCollapsed })} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <Header />
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-3 sm:p-5 lg:p-6">
          <Suspense fallback={<LoadingRows rows={6} />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
