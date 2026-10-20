-- System Formy: minimalny schemat dla strefy klienta.
-- Uruchom w Supabase SQL Editor. Nie tworzy zamówień ani płatności.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'processing', 'fulfilled', 'canceled', 'refunded')),
  total_amount numeric(10,2) not null default 0 check (total_amount >= 0),
  currency text not null default 'PLN' check (char_length(currency) = 3),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_title text not null,
  product_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_amount numeric(10,2) not null default 0 check (unit_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  product_title text not null,
  product_type text not null,
  access_status text not null default 'active'
    check (access_status in ('active', 'expired', 'revoked', 'pending')),
  created_at timestamptz not null default now()
);

create table if not exists public.individual_plan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null default 'awaiting_questionnaire'
    check (status in ('awaiting_questionnaire', 'in_preparation', 'ready', 'canceled', 'refunded')),
  questionnaire jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists entitlements_user_created_idx on public.user_entitlements (user_id, created_at desc);
create index if not exists plan_requests_user_created_idx on public.individual_plan_requests (user_id, created_at desc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.individual_plan_requests enable row level security;

-- Właściciel konta może tylko odczytywać swoje zamówienia.
drop policy if exists "Read own orders" on public.orders;
create policy "Read own orders" on public.orders for select to authenticated
  using (user_id = auth.uid());

-- Pozycje zamówienia widoczne wyłącznie właścicielowi zamówienia.
drop policy if exists "Read own order items" on public.order_items;
create policy "Read own order items" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Uprawnienia do produktów są tylko do odczytu przez ich właściciela.
drop policy if exists "Read own entitlements" on public.user_entitlements;
create policy "Read own entitlements" on public.user_entitlements for select to authenticated
  using (user_id = auth.uid());

-- Klient może przeglądać własne zgłoszenia planów.
drop policy if exists "Read own plan requests" on public.individual_plan_requests;
create policy "Read own plan requests" on public.individual_plan_requests for select to authenticated
  using (user_id = auth.uid());

-- Klient może zainicjować prośbę wyłącznie dla własnego opłaconego zamówienia.
-- Brak polityki UPDATE: klient nie może sam ustawić statusu "ready" ani zmienić statusu płatności.
drop policy if exists "Create plan request for own paid order" on public.individual_plan_requests;
create policy "Create plan request for own paid order" on public.individual_plan_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'awaiting_questionnaire'
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.user_id = auth.uid()
        and o.status in ('paid', 'processing')
    )
  );

grant select on public.orders, public.order_items, public.user_entitlements, public.individual_plan_requests to authenticated;
grant insert on public.individual_plan_requests to authenticated;

-- Celowo nie ma uprawnień klienta do INSERT/UPDATE/DELETE zamówień, pozycji lub uprawnień.
-- Tymi rekordami musi zarządzać zaufany backend z kluczem service_role przechowywanym wyłącznie po stronie serwera.
