import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, LogOut, Menu, Moon, Search, Settings, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Badge } from "@/components/ui/badge";
import { useApp, useSession } from "@/lib/auth/AppContext";
import { useList, useTableMutation } from "@/hooks/useData";
import { useUserPrefs } from "@/hooks/useSettings";
import type { Notification } from "@/lib/data/types";
import { formatRelative } from "@/lib/format";
import { findNavItem } from "./nav";
import { SidebarNav } from "./Sidebar";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

function Breadcrumbs() {
  const { pathname } = useLocation();
  const base = "/" + (pathname.split("/")[1] ?? "");
  const item = findNavItem(base);
  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
      <Link to="/" className="hover:text-foreground">OfertaHub</Link>
      <ChevronRight className="size-3" />
      <span className="font-medium text-foreground">{item?.label ?? "Página"}</span>
    </nav>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="relative w-full max-w-sm"
      onSubmit={(e) => { e.preventDefault(); navigate(`/ofertas?q=${encodeURIComponent(q.trim())}`); }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar ofertas, produtos, marcas…"
        aria-label="Pesquisa global"
        className="h-9 w-full rounded-lg border bg-muted/50 pl-8 pr-12 text-sm placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-card px-1.5 text-[10px] text-muted-foreground sm:block">Ctrl K</kbd>
    </form>
  );
}

function NotificationsMenu() {
  const { user } = useSession();
  const navigate = useNavigate();
  const { data = [] } = useList<Notification>("notifications", { orderBy: { column: "created_at", ascending: false }, limit: 30 });
  const visible = data.filter((n) => !n.user_id || n.user_id === user.id);
  const unread = visible.filter((n) => !n.read_at);
  const mark = useTableMutation("notifications", "update");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notificações (${unread.length} não lidas)`} className="relative">
          <Bell />
          {unread.length > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{unread.length > 9 ? "9+" : unread.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notificações
          {unread.length > 0 && (
            <button className="text-primary hover:underline" onClick={() => unread.forEach((n) => mark.mutate({ match: { id: n.id }, patch: { read_at: new Date().toISOString() } }))}>
              Marcar todas como lidas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visible.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma notificação.</p>}
        <div className="max-h-80 overflow-y-auto">
          {visible.slice(0, 8).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex-col items-start gap-0.5"
              onSelect={() => {
                if (!n.read_at) mark.mutate({ match: { id: n.id }, patch: { read_at: new Date().toISOString() } });
                if (n.link) navigate(n.link);
              }}
            >
              <span className={cn("flex w-full items-center gap-2 text-[13px]", !n.read_at && "font-semibold")}>
                {!n.read_at && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                <span className="flex-1 truncate">{n.title}</span>
                {n.is_demo && <Badge variant="demo">DEMO</Badge>}
              </span>
              <span className="text-[11px] text-muted-foreground">{formatRelative(n.created_at)}</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/notificacoes")} className="justify-center text-primary">Ver todas</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const { user, signOut, mode } = useApp();
  const { prefs, update } = useUserPrefs();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur sm:px-5">
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Trigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu"><Menu /></Button>
        </DialogPrimitive.Trigger>
        <SheetContent className="flex flex-col">
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <div className="flex h-14 items-center border-b px-4"><Logo /></div>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Dialog>
      <Breadcrumbs />
      <div className="flex flex-1 justify-center md:justify-end"><GlobalSearch /></div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Alternar tema"
        onClick={() => update({ theme: prefs.theme === "dark" || (prefs.theme === "system" && isDark) ? "light" : "dark" })}
      >
        {isDark ? <Sun /> : <Moon />}
      </Button>
      <NotificationsMenu />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="brand-gradient grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" aria-label="Menu do perfil">
            {(user?.name ?? user?.email ?? "U").slice(0, 1).toUpperCase()}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <span className="block text-sm font-medium text-foreground">{user?.name ?? "Administrador"}</span>
            <span className="block truncate font-normal">{user?.email}</span>
            {mode === "demo" && <Badge variant="demo" className="mt-1">MODO DEMO</Badge>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/configuracoes?aba=perfil")}><User /> Perfil</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/configuracoes")}><Settings /> Configurações</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => signOut().then(() => navigate("/entrar"))}><LogOut /> {mode === "demo" ? "Sair do modo DEMO" : "Sair"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
