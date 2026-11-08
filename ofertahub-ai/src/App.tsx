import { lazy } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useApp } from "@/lib/auth/AppContext";
import { AppShell } from "@/components/layout/AppShell";
import { ALL_NAV_ITEMS } from "@/components/layout/nav";
import { LoginPage } from "@/pages/auth/LoginPage";
import { ForgotPasswordPage, ResetPasswordPage } from "@/pages/auth/PasswordPages";
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const OffersPage = lazy(() => import("@/pages/offers/OffersPage").then((m) => ({ default: m.OffersPage })));
const FiltersPage = lazy(() => import("@/pages/filters/FiltersPage").then((m) => ({ default: m.FiltersPage })));
const IntegrationsPage = lazy(() => import("@/pages/integrations/IntegrationsPage").then((m) => ({ default: m.IntegrationsPage })));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const NotificationsPage = lazy(() => import("@/pages/system/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const AuditPage = lazy(() => import("@/pages/system/AuditPage").then((m) => ({ default: m.AuditPage })));
import { PlannedModulePage } from "@/pages/PlannedModulePage";

function FullScreenLoader() {
  return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-primary" aria-label="Carregando" /></div>;
}

function RequireSession() {
  const { ready, mode, client, orgId } = useApp();
  const location = useLocation();
  if (!ready) return <FullScreenLoader />;
  if (!mode) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (!client || !orgId) return (
    <div className="grid min-h-screen place-items-center p-6 text-center text-sm text-muted-foreground">
      Não foi possível carregar sua organização. Verifique se as migrações do banco foram aplicadas.
    </div>
  );
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="ofertas" element={<OffersPage />} />
          <Route path="filtros" element={<FiltersPage />} />
          <Route path="integracoes" element={<IntegrationsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="notificacoes" element={<NotificationsPage />} />
          <Route path="auditoria" element={<AuditPage />} />
          {ALL_NAV_ITEMS.filter((i) => !i.ready).map((i) => <Route key={i.path} path={i.path.slice(1)} element={<PlannedModulePage />} />)}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
