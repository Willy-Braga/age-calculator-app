-- Testes de RLS, gatilhos e regras de negócio do banco. Executar após auth_stub.sql + migrações.
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com', '{"full_name":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com', '{"full_name":"Bruno"}');

do $$ begin
  assert (select count(*) from public.organizations) = 2, 'cada usuário deve ganhar uma organização';
  assert (select count(*) from public.integrations) = 14, 'integrações criadas por organização';
end $$;

-- Usuário A
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
declare org uuid; prod uuid; offer uuid;
begin
  select default_organization_id into org from public.profiles;
  assert (select count(*) from public.organizations) = 1, 'A só vê a própria organização';
  insert into public.products (organization_id, name) values (org, 'Fone XYZ') returning id into prod;
  insert into public.product_offers (organization_id, product_id, platform_code, current_price, reference_price, reference_price_source)
    values (org, prod, 'manual', 100, 150, 'manual_verificado') returning id into offer;
  assert (select count(*) from public.price_observations where offer_id = offer) = 1, 'observação criada no insert';
  update public.product_offers set current_price = 90 where id = offer;
  update public.product_offers set status = 'aprovada' where id = offer;
  assert (select count(*) from public.price_observations where offer_id = offer) = 2, 'observação só quando preço muda';
  assert (select count(*) from public.audit_logs where entity = 'product_offers') >= 3, 'auditoria registrada';
  assert (select public.offer_verified_discount(o) from public.product_offers o where id = offer) = 40, 'desconto verificado';
  update public.product_offers set reference_price_source = 'preco_riscado_vendedor' where id = offer;
  assert (select public.offer_verified_discount(o) from public.product_offers o where id = offer) is null, 'preço riscado não é prova';
  -- Não pode ler credenciais
  begin
    perform * from public.integration_credentials;
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Cliente não pode se autodeclarar "conectada e validada"
do $$ begin
  begin
    update public.integrations set status = 'conectada_validada' where platform_code = 'amazon';
    raise exception 'deveria bloquear';
  exception when raise_exception then
    if sqlerrm = 'deveria bloquear' then raise; end if;
  end;
end $$;

-- Comissão confirmada exige origem oficial
do $$
declare org uuid;
begin
  select default_organization_id into org from public.profiles;
  begin
    insert into public.commissions (organization_id, platform_code, amount, status, origin) values (org, 'amazon', 10, 'confirmada', 'interno');
    raise exception 'deveria bloquear';
  exception when check_violation then null;
  end;
end $$;

-- Usuário B não enxerga nada de A e não consegue escrever na org de A
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
declare org_a uuid;
begin
  assert (select count(*) from public.products) = 0, 'B não vê produtos de A';
  assert (select count(*) from public.price_observations) = 0, 'B não vê histórico de A';
  assert (select count(*) from public.audit_logs) = (select count(*) from public.audit_logs where organization_id in (select organization_id from public.organization_members where user_id = auth.uid())), 'B só vê auditoria própria';
  reset role;
  select id into org_a from public.organizations where created_by = '11111111-1111-1111-1111-111111111111';
  set role authenticated;
  begin
    insert into public.products (organization_id, name) values (org_a, 'Invasão');
    raise exception 'deveria bloquear';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'RLS OK' as resultado;
