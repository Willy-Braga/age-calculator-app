import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { App } from "@/App";
import { AppProvider } from "@/lib/auth/AppContext";
import { ConfirmProvider } from "@/components/ui/confirm";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DemoDataClient, MemoryStorage } from "@/lib/data/demo";

function setup(path: string, client = new DemoDataClient(new MemoryStorage(), false)) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppProvider testClient={client}>
          <TooltipProvider><ConfirmProvider><App /><Toaster /></ConfirmProvider></TooltipProvider>
        </AppProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, user: userEvent.setup() };
}

describe("Central de Ofertas (fluxo completo, banco local vazio)", () => {
  beforeEach(() => localStorage.clear());

  it("começa vazia, cadastra, edita, bloqueia aprovação sem verificação e exclui", async () => {
    const { client, user } = setup("/ofertas");
    expect(await screen.findByText("Nenhuma oferta cadastrada")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cadastrar primeira oferta" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nome do produto *"), "Fone Teste");
    await user.selectOptions(within(dialog).getByLabelText("Plataforma *"), "amazon");
    await user.type(within(dialog).getByLabelText("Preço atual (R$)"), "199,90");
    await user.type(within(dialog).getByLabelText("Link original"), "http://amazon.com.br/x");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar oferta" }));
    expect(await within(dialog).findByText("O link deve usar HTTPS.")).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Link original"));
    await user.type(within(dialog).getByLabelText("Link original"), "https://www.amazon.com.br/dp/B0TESTE");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar oferta" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Fone Teste")).toBeInTheDocument();
    const offers = await client.list<{ id: string; status: string; current_price: number; score: number | null }>("product_offers");
    expect(offers).toHaveLength(1);
    expect(offers[0].current_price).toBe(199.9);
    expect(offers[0].score).not.toBeNull(); // snapshot da pontuação persistido
    expect(await client.list("price_observations")).toHaveLength(1);

    // Mover para verificação e aguardando aprovação
    const openMenu = async () => user.click(screen.getByRole("button", { name: "Ações para Fone Teste" }));
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Mover para: Em verificação/ }));
    await waitFor(async () => expect((await client.list<{ status: string }>("product_offers"))[0].status).toBe("em_verificacao"));
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Mover para: Aguardando aprovação/ }));
    await waitFor(async () => expect((await client.list<{ status: string }>("product_offers"))[0].status).toBe("aguardando_aprovacao"));

    // Aprovação bloqueada: dados nunca verificados
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Aprovar/ }));
    expect(await screen.findByText("Aprovação bloqueada pela política")).toBeInTheDocument();
    expect((await client.list<{ status: string }>("product_offers"))[0].status).toBe("aguardando_aprovacao");

    // Revalidação manual registra verificação e libera aprovação
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Revalidar informações/ }));
    await user.click(await screen.findByRole("button", { name: /Conferi/ }));
    await waitFor(async () => expect((await client.list<{ last_verified_at: string | null }>("product_offers"))[0].last_verified_at).not.toBeNull());
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Aprovar/ }));
    await waitFor(async () => expect((await client.list<{ status: string }>("product_offers"))[0].status).toBe("aprovada"));

    // Exclusão com confirmação
    await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: /Excluir/ }));
    await user.click(await screen.findByRole("button", { name: "Excluir" }));
    await waitFor(async () => expect(await client.list("product_offers")).toHaveLength(0));
    expect(await client.list("products")).toHaveLength(0);
  }, 30_000);

  it("filtros da tela realmente alteram os resultados", async () => {
    const { user } = setup("/ofertas", new DemoDataClient(new MemoryStorage(), true));
    await screen.findByText("Fone Bluetooth Modelo DEMO A");
    await user.selectOptions(screen.getByLabelText("Plataforma"), "shopee");
    await waitFor(() => expect(screen.queryByText("Fone Bluetooth Modelo DEMO A")).not.toBeInTheDocument());
    expect(screen.getByText("Smartwatch DEMO S2")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar ofertas"), "inexistente");
    expect(await screen.findByText("Nenhuma oferta corresponde aos filtros")).toBeInTheDocument();
  }, 20_000);

  it("dashboard e módulos de fases futuras não exibem resultados simulados", async () => {
    setup("/", new DemoDataClient(new MemoryStorage(), true));
    expect(await screen.findByText("Ofertas aprovadas")).toBeInTheDocument();
    expect(screen.getAllByText("DEMO").length).toBeGreaterThan(0);
    expect(screen.getByText(/Nenhuma comissão importada/)).toBeInTheDocument();
  });

  it("módulo previsto mostra a fase, sem botões falsos", async () => {
    setup("/comissoes");
    expect(await screen.findByText("Módulo previsto para a Fase 4")).toBeInTheDocument();
  });
});
