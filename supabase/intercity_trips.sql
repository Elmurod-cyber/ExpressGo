-- Shaharlararo e'lon va haydovchi obunasi.
-- Supabase SQL Editor da bir marta ishga tushiring.
-- Ilova bu jadvallarga to'g'ridan-to'g'ri ulanmaydi.
-- To'liq telefon faqat serverdagi DATABASE_URL ulanishida o'qiladi.
-- EXPO_PUBLIC_SUPABASE_ANON_KEY va service_role kalitini ilovaga yozmang.
-- Eski eg_trip_ads jadvali va telefon xotirasidagi obuna bu fayl bilan o'chirilmaydi.

create table if not exists public.intercity_trips (
  id text primary key,
  owner_phone text not null,
  passenger_name text not null,
  from_place text not null,
  to_place text not null,
  from_lat double precision,
  from_lng double precision,
  to_lat double precision,
  to_lng double precision,
  when_label text not null,
  seats integer not null check (seats > 0 and seats <= 8),
  price integer not null check (price >= 0),
  note text not null default '',
  created_at bigint not null
);

create index if not exists intercity_trips_route_idx
  on public.intercity_trips (from_place, to_place, created_at desc);

create table if not exists public.driver_subscriptions (
  driver_phone text primary key,
  starts_at bigint not null,
  ends_at bigint not null,
  price_som integer not null default 30000 check (price_som >= 0),
  days integer not null default 7 check (days > 0 and days <= 31),
  created_at bigint not null,
  check (ends_at > starts_at)
);

alter table public.intercity_trips enable row level security;
alter table public.driver_subscriptions enable row level security;

alter table public.intercity_trips force row level security;
alter table public.driver_subscriptions force row level security;

revoke all on table public.intercity_trips from public;
revoke all on table public.driver_subscriptions from public;

revoke all on table public.intercity_trips from anon;
revoke all on table public.driver_subscriptions from anon;

revoke all on table public.intercity_trips from authenticated;
revoke all on table public.driver_subscriptions from authenticated;

drop policy if exists intercity_trips_deny_anon on public.intercity_trips;
drop policy if exists intercity_trips_deny_authenticated on public.intercity_trips;
drop policy if exists driver_subscriptions_deny_anon on public.driver_subscriptions;
drop policy if exists driver_subscriptions_deny_authenticated on public.driver_subscriptions;

create policy intercity_trips_deny_anon
  on public.intercity_trips
  for all
  to anon
  using (false)
  with check (false);

create policy intercity_trips_deny_authenticated
  on public.intercity_trips
  for all
  to authenticated
  using (false)
  with check (false);

create policy driver_subscriptions_deny_anon
  on public.driver_subscriptions
  for all
  to anon
  using (false)
  with check (false);

create policy driver_subscriptions_deny_authenticated
  on public.driver_subscriptions
  for all
  to authenticated
  using (false)
  with check (false);
