# OfertaHub AI

Central para gerenciar ofertas, marketing de afiliados e conteúdo promocional.
Stack: React + TypeScript, Tailwind CSS (componentes no estilo shadcn/ui sobre Radix), Lucide, TanStack Query, Recharts, Zod, Supabase (Auth, PostgreSQL com RLS, Edge Functions).

> **Princípio do produto:** nenhum dado é inventado. Desconto só conta quando o preço de referência é verificável, a falta de dados nunca vira aprovação, e uma integração só aparece como “conectada” depois de um teste real feito no servidor.

## Como executar

```bash
cd ofertahub-ai
npm install
cp .env.example .env.local   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

Sem as variáveis do Supabase, a tela de login explica o que falta configurar e oferece o **modo DEMO**: dados fictícios, marcados como DEMO, guardados só no navegador.

### Backend (Supabase / Lovable Cloud)

1. Crie o projeto e aplique as migrações: `supabase link` e depois `supabase db push` (ou rode os arquivos de `supabase/migrations` em ordem no SQL Editor).
2. Publique as Edge Functions: `supabase functions deploy integration-credentials integration-test`.
3. Em Auth → URL Configuration, adicione `http://localhost:5173/redefinir-senha` (e a URL de produção) nas URLs de redirecionamento.

Cada novo usuário recebe, por gatilho: perfil, uma organização própria (como dono), configurações padrão e as integrações no estado “Não configurada”.

### Testes

| Comando | O que cobre |
|---|---|
| `npm test` | 36 testes: filtros, pontuação, histórico, links, transições de status, cliente DEMO e fluxo de UI (cadastrar → verificar → aprovar → excluir) |
| `npm run test:db` | Migrações + RLS num PostgreSQL local: isolamento entre organizações, credenciais ilegíveis pelo cliente, gatilhos de histórico e auditoria, bloqueio de “conectada” vindo do cliente, comissão confirmada exige origem oficial |
| `npm run typecheck` / `npm run build` | Tipos e build de produção |

## Arquitetura

```
src/
  lib/data/       DataClient (contrato único) → SupabaseDataClient | DemoDataClient
  lib/domain/     Regras puras e testadas: filters, scoring, history, links, offers, settings
  lib/auth/       Sessão, modo (real/DEMO) e organização ativa
  components/     ui/ (design system), layout/ (sidebar, header, breadcrumbs)
  pages/          Um módulo por pasta
supabase/
  migrations/     Esquema completo (todas as fases), RLS, gatilhos, catálogo de plataformas
  functions/      Edge Functions + adaptadores de plataformas (_shared/adapters.ts)
  tests/          Stub do schema auth + testes de RLS
```

- **Multi-organização:** toda tabela de negócio tem `organization_id`. O RLS usa `is_org_member`/`can_write_org` (papéis owner/admin/editor/viewer).
- **Credenciais:** ficam em `integration_credentials`, com RLS ativo, sem políticas e com `REVOKE` para os papéis do cliente. Só as Edge Functions (service role) leem ou gravam. O navegador nunca recebe os valores de volta.
- **Histórico de preços:** um gatilho registra uma `price_observation` sempre que o preço de uma oferta é informado ou alterado.
- **Auditoria:** um gatilho genérico grava as diferenças campo a campo em `audit_logs`.
- **Adaptadores:** para adicionar uma plataforma, implemente `PlatformAdapter.testConnection` com uma chamada real. Sem adaptador, o teste responde “adaptador indisponível” e o status não muda.

## Status por fase

### ✅ Fase 1: Base funcional (entregue)

| Item | Situação |
|---|---|
| Design system (tema escuro e claro, azul/violeta, cores de status) | ✅ |
| Layout responsivo: sidebar recolhível, menu mobile, busca global (Ctrl K), notificações, perfil, breadcrumbs | ✅ |
| Autenticação: login, cadastro, recuperação e redefinição de senha, logout, rotas protegidas | ✅ (precisa de um projeto Supabase para uso real) |
| Banco de dados: esquema completo com RLS, índices, gatilhos e auditoria | ✅ testado em PostgreSQL 16 |
| Dashboard: 8 indicadores e 15 widgets personalizáveis (exibir, ordenar, largura) | ✅ widgets das fases 3 e 4 mostram “sem dados” |
| Central de Ofertas: CRUD, cards e tabela, filtros persistentes, ordenação, paginação, ciclo de status, aprovar/rejeitar com política, favoritos, monitoramento, revalidação manual, link manual, detalhes com pontuação, filtros, histórico e comparação | ✅ |
| Filtros Inteligentes: perfis por categoria, todas as regras pedidas, modelo “Perfil Tecnologia”, simulação, perfil padrão | ✅ |
| Pontuação 0–100 explicável, pesos configuráveis (soma = 100), bloqueios obrigatórios | ✅ (adiantada da Fase 2) |
| Plataformas e Integrações: estados reais, credenciais no servidor, teste de conexão, logs, página de viabilidade | ✅ |
| Configurações (perfil, aparência, categorias, pontuação, aprovação, plataformas, notificações, IA, segurança, exportação JSON/CSV) | ✅ salvas no banco |
| Notificações e Auditoria | ✅ |
| Modo DEMO isolado e identificado | ✅ |

### ⏳ Pendente (próximas fases)

- **Fase 2:** importação de produtos por CSV, Verificador (frete por CEP, vendedor, cupom), página de Histórico de Preços com períodos e alertas, Comparador completo, Descoberta com conectores.
- **Fase 3:** Gerador de Conteúdos (templates + IA opcional), Biblioteca de Mídias com licenças (Storage), Links de Afiliados e campanhas, Canais, Fila de Publicações com fluxo manual para WhatsApp.
- **Fase 4:** adaptadores de APIs aprovadas, automações agendadas (pg_cron), importação e sincronização de cliques, conversões e comissões, métricas.

As tabelas dessas fases já existem no banco. Na interface, cada módulo mostra em qual fase será entregue e não exibe resultados simulados.

## Viabilidade das integrações

| Plataforma | Situação real | Credenciais | Enquanto isso |
|---|---|---|---|
| Amazon Associados | API de produtos só para contas aprovadas e com vendas qualificadas; cotas atreladas à receita | Access Key, Secret Key, Partner Tag | Links do SiteStripe (manual) e relatórios CSV |
| Shopee Afiliados | Open API de afiliados depende de aprovação | App ID, Secret | Painel oficial e exportação de relatórios |
| Mercado Livre | API exige app + OAuth; busca restrita; **sem API pública de links de afiliado** | Client ID, Client Secret, OAuth | Links pelo portal de afiliados |
| Magalu (Parceiro Magalu) | Sem API pública documentada para afiliados | — | Manual |
| Hotmart | API disponível com credenciais da própria conta | Client ID, Client Secret, Basic Token | **Adaptador real já implementado** (emissão de token OAuth); ainda não testado com credenciais reais |
| Kiwify | API voltada a produtores; limitada para afiliados | Client ID, Client Secret, Account ID | Manual/CSV |
| WhatsApp | Publicação **manual** (copiar e compartilhar). A API oficial do WhatsApp Business não deve ser presumida para grupos ou Comunidades | — | — |

Confirme sempre na documentação oficial de cada programa, porque as políticas mudam. Nenhum scraping não autorizado, contorno de CAPTCHA ou evasão de bloqueios será implementado.
