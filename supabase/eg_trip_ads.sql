-- Shaharlararo yo'lovchi e'lonlari.
-- Supabase SQL Editor da bir marta ishga tushiring.
-- Bu jadval eg_users / eg_orders kabi ochiq emas.
-- Anonim va oddiy kirgan mijoz o'qiy olmaydi va yoza olmaydi.
-- To'liq telefon faqat serverdagi DATABASE_URL ulanishida turadi.
-- EXPO_PUBLIC_SUPABASE_ANON_KEY va service_role kalitini ilovaga yozmang.

create table if not exists public.eg_trip_ads (
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
  seats integer not null,
  price integer not null,
  note text not null default '',
  created_at bigint not null,
  offer text not null default 'rider',
  vehicle text not null default '',
  photo text not null default ''
);

alter table public.eg_trip_ads enable row level security;
alter table public.eg_trip_ads force row level security;

revoke all on table public.eg_trip_ads from public;
revoke all on table public.eg_trip_ads from anon;
revoke all on table public.eg_trip_ads from authenticated;

-- Siyosat yo'q. RLS yoqilganda anon va authenticated uchun bu rad etishdir.
-- using (true) turidagi ochiq siyosat qo'shmang.
