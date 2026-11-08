import { Link, useLocation } from "react-router-dom";
import { CalendarClock, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findNavItem } from "@/components/layout/nav";

const DETAILS: Record<string, string[]> = {
  "/descoberta": ["Arquitetura de adaptadores por plataforma (contrato já definido no servidor).", "Importação de produtos por CSV.", "Busca por API oficial somente após credenciais validadas.", "Sem scraping não autorizado, bypass de CAPTCHA ou evasão de bloqueios."],
  "/verificador": ["Verificação de preço contra o histórico do mesmo produto/variante.", "Frete com CEP de referência, vendedor, cupom e link.", "Resultado Aprovado / Atenção / Rejeitado / Dados insuficientes com motivos."],
  "/historico-precos": ["Gráficos de 7, 30, 90, 180 dias, 1 ano e todo o histórico.", "As observações já estão sendo registradas desde a Fase 1 a cada preço informado.", "Alertas de redução, retorno ao estoque e preço-alvo."],
  "/comparador": ["Preço, frete, total, cupom, prazo, avaliações e confiança dos dados.", "Prioriza custo-benefício ao consumidor — comissão não é critério principal.", "Preços desatualizados não são exibidos como atuais."],
  "/conteudos": ["Formatos: WhatsApp, Canal, Instagram, Reels, TikTok, Telegram e descrição.", "Templates determinísticos gratuitos; IA opcional com credenciais autorizadas.", "Identificação publicitária (#publi) automática."],
  "/midias": ["Upload para o Storage com licença, titular, validade e plataformas permitidas.", "Bloqueio de publicação sem autorização confirmada."],
  "/publicacoes": ["Fila com aprovação e status completos.", "Fluxo manual de cópia/compartilhamento para WhatsApp (sem automação não oficial)."],
  "/canais": ["Cadastro de Comunidades, Grupos, Canais, Telegram, Instagram e TikTok.", "Frequência máxima e prevenção de conteúdo duplicado."],
  "/links": ["Cadastro de link original/afiliado, campanhas e sub-IDs suportados.", "Verificação estrutural (já disponível no cadastro de ofertas)."],
  "/cliques": ["Importação CSV dos relatórios oficiais.", "Sincronização por API oficial quando configurada.", "Dados internos × relatórios das plataformas separados."],
  "/comissoes": ["Estimado, confirmado e pago separados (o banco já impede comissão confirmada sem origem oficial).", "Gráficos mensais e filtros por período."],
  "/automacoes": ["Jobs com frequência, histórico e logs.", "Trava contra execução duplicada (índice único já no banco).", "Execuções com custo exigem aprovação explícita."],
};

export function PlannedModulePage() {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  if (!item) return null;
  return (
    <div className="animate-fade-in">
      <PageHeader title={item.label} description={item.summary} />
      <Card className="max-w-3xl">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-violet/12 text-violet"><CalendarClock className="size-5" /></div>
            <div>
              <p className="font-medium">Módulo previsto para a Fase {item.phase}</p>
              <p className="text-xs text-muted-foreground">O desenvolvimento é incremental para evitar regressões. As tabelas deste módulo já existem no banco de dados.</p>
            </div>
            <Badge variant="violet" className="ml-auto">Fase {item.phase}</Badge>
          </div>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {(DETAILS[pathname] ?? []).map((d) => <li key={d}>{d}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground">Nenhum resultado é simulado aqui: o módulo só será exibido como ativo quando estiver funcional.</p>
          <Button asChild variant="outline" size="sm"><Link to="/ofertas">Ir para a Central de Ofertas <ArrowRight /></Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
