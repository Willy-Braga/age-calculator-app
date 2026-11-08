import {
  LayoutDashboard, Tags, Compass, SlidersHorizontal, ShieldCheck, LineChart, GitCompare, Sparkles, Images, Send, Users,
  Plug, Link2, MousePointerClick, Wallet, Workflow, Bell, History, Settings, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Fase do plano em que o módulo é entregue. */
  phase: 1 | 2 | 3 | 4;
  ready: boolean;
  summary: string;
}
export interface NavSection { title: string; items: NavItem[] }

export const NAV: NavSection[] = [
  {
    title: "Visão geral",
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard, phase: 1, ready: true, summary: "Indicadores e widgets personalizáveis." },
      { path: "/ofertas", label: "Central de Ofertas", icon: Tags, phase: 1, ready: true, summary: "Cadastro, revisão e ciclo de vida das ofertas." },
      { path: "/descoberta", label: "Descoberta de Produtos", icon: Compass, phase: 2, ready: false, summary: "Conectores independentes, importação CSV e busca por API autorizada." },
    ],
  },
  {
    title: "Inteligência",
    items: [
      { path: "/filtros", label: "Filtros Inteligentes", icon: SlidersHorizontal, phase: 1, ready: true, summary: "Perfis de filtros por categoria e simulação." },
      { path: "/verificador", label: "Verificador de Ofertas", icon: ShieldCheck, phase: 2, ready: false, summary: "Verificação de preço, histórico, frete, vendedor, cupom e link com motivos." },
      { path: "/historico-precos", label: "Histórico de Preços", icon: LineChart, phase: 2, ready: false, summary: "Gráficos por período e alertas de preço-alvo, baseados apenas em observações registradas." },
      { path: "/comparador", label: "Comparador de Produtos", icon: GitCompare, phase: 2, ready: false, summary: "Mesmo produto em plataformas diferentes, priorizando custo-benefício ao consumidor." },
    ],
  },
  {
    title: "Marketing",
    items: [
      { path: "/conteudos", label: "Gerador de Conteúdos", icon: Sparkles, phase: 3, ready: false, summary: "Templates determinísticos gratuitos e IA opcional, com identificação publicitária." },
      { path: "/midias", label: "Biblioteca de Mídias", icon: Images, phase: 3, ready: false, summary: "Upload com controle de licença e bloqueio de mídia não autorizada." },
      { path: "/publicacoes", label: "Publicações", icon: Send, phase: 3, ready: false, summary: "Fila com aprovação e fluxo manual de compartilhamento (WhatsApp)." },
      { path: "/canais", label: "Comunidades e Canais", icon: Users, phase: 3, ready: false, summary: "Cadastro de canais, frequência máxima e prevenção de duplicidade." },
    ],
  },
  {
    title: "Afiliados",
    items: [
      { path: "/integracoes", label: "Plataformas e Integrações", icon: Plug, phase: 1, ready: true, summary: "Estado real de cada integração, credenciais no servidor e logs." },
      { path: "/links", label: "Links de Afiliados", icon: Link2, phase: 3, ready: false, summary: "Gerenciador de links, campanhas e verificação estrutural." },
      { path: "/cliques", label: "Cliques e Conversões", icon: MousePointerClick, phase: 4, ready: false, summary: "Importação de relatórios oficiais e sincronização por API." },
      { path: "/comissoes", label: "Comissões e Resultados", icon: Wallet, phase: 4, ready: false, summary: "Estimado × confirmado × pago, separados explicitamente." },
    ],
  },
  {
    title: "Sistema",
    items: [
      { path: "/automacoes", label: "Automações", icon: Workflow, phase: 4, ready: false, summary: "Jobs agendados com logs, trava contra duplicidade e aprovação de custos." },
      { path: "/notificacoes", label: "Notificações", icon: Bell, phase: 1, ready: true, summary: "Central de notificações do aplicativo." },
      { path: "/auditoria", label: "Histórico e Auditoria", icon: History, phase: 1, ready: true, summary: "Registro automático de alterações." },
      { path: "/configuracoes", label: "Configurações", icon: Settings, phase: 1, ready: true, summary: "Perfil, aparência, pontuação, aprovação e mais." },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items);
export const findNavItem = (path: string) => ALL_NAV_ITEMS.find((i) => i.path === path);
