import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV } from "./nav";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
      {NAV.map((section) => (
        <div key={section.title}>
          {!collapsed && <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{section.title}</p>}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const link = (
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      isActive && "bg-primary/10 font-medium text-primary hover:bg-primary/15 hover:text-primary",
                      collapsed && "justify-center px-0 py-2",
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && !item.ready && <span className="rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground">F{item.phase}</span>}
                </NavLink>
              );
              return <li key={item.path}>{collapsed ? <Tooltip content={item.label} side="right">{link}</Tooltip> : link}</li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex", collapsed ? "w-[68px]" : "w-64")}>
      <div className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-0")}>
        <Logo collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className="border-t p-3">
        <button
          onClick={onToggle}
          className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground", collapsed && "justify-center")}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Recolher menu</>}
        </button>
      </div>
    </aside>
  );
}
