import { describe, expect, it } from "vitest";
import { DemoDataClient, MemoryStorage, DEMO_ORG_ID } from "@/lib/data/demo";

describe("cliente DEMO (emula gatilhos do banco)", () => {
  it("começa vazio quando sem seed e persiste no armazenamento", async () => {
    const storage = new MemoryStorage();
    const c = new DemoDataClient(storage, false);
    expect(await c.list("product_offers")).toEqual([]);
    const [p] = await c.insert<{ id: string }>("products", { organization_id: DEMO_ORG_ID, name: "Teste" });
    const again = new DemoDataClient(storage, false);
    expect((await again.list("products")).length).toBe(1);
    expect(p.id).toBeTruthy();
  });

  it("registra observação de preço e auditoria apenas quando o preço muda", async () => {
    const c = new DemoDataClient(new MemoryStorage(), false);
    const [p] = await c.insert<{ id: string }>("products", { organization_id: DEMO_ORG_ID, name: "P" });
    const [o] = await c.insert<{ id: string; is_demo: boolean }>("product_offers", { organization_id: DEMO_ORG_ID, product_id: p.id, platform_code: "manual", current_price: 10 });
    expect(o.is_demo).toBe(true);
    await c.update("product_offers", { id: o.id }, { status: "em_verificacao" });
    expect((await c.list("price_observations")).length).toBe(1);
    await c.update("product_offers", { id: o.id }, { current_price: 9 });
    expect((await c.list("price_observations")).length).toBe(2);
    const audit = await c.list<{ action: string; entity: string }>("audit_logs");
    expect(audit.filter((a) => a.entity === "product_offers").map((a) => a.action)).toEqual(["insert", "update", "update"]);
  });

  it("bloqueia ID externo duplicado e status 'conectada e validada' vindo do cliente", async () => {
    const c = new DemoDataClient(new MemoryStorage(), false);
    const [p] = await c.insert<{ id: string }>("products", { organization_id: DEMO_ORG_ID, name: "P" });
    await c.insert("product_offers", { organization_id: DEMO_ORG_ID, product_id: p.id, platform_code: "amazon", external_id: "X" });
    await expect(c.insert("product_offers", { organization_id: DEMO_ORG_ID, product_id: p.id, platform_code: "amazon", external_id: "X" })).rejects.toThrow(/duplicado/);
    const [i] = await c.list<{ id: string }>("integrations");
    await expect(c.update("integrations", { id: i.id }, { status: "conectada_validada" })).rejects.toThrow(/servidor/);
  });

  it("exclusão de produto remove ofertas e observações", async () => {
    const c = new DemoDataClient(new MemoryStorage(), false);
    const [p] = await c.insert<{ id: string }>("products", { organization_id: DEMO_ORG_ID, name: "P" });
    await c.insert("product_offers", { organization_id: DEMO_ORG_ID, product_id: p.id, platform_code: "manual", current_price: 5 });
    await c.remove("products", { id: p.id });
    expect(await c.list("product_offers")).toEqual([]);
    expect(await c.list("price_observations")).toEqual([]);
  });

  it("seed DEMO é inteiramente marcado como demonstrativo", async () => {
    const c = new DemoDataClient(new MemoryStorage(), true);
    const offers = await c.list<{ is_demo: boolean }>("product_offers");
    const products = await c.list<{ is_demo: boolean; name: string }>("products");
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.is_demo)).toBe(true);
    expect(products.every((p) => p.is_demo && p.name.includes("DEMO"))).toBe(true);
  });

  it("funções de servidor não são simuladas no DEMO", async () => {
    const r = await new DemoDataClient(new MemoryStorage(), false).invoke("integration-test");
    expect(r.ok).toBe(false);
  });
});
