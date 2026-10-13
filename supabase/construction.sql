-- Qurilish: ish e'lonlari va usta obunasi.
-- Supabase SQL Editor da bir marta ishga tushiring.
-- Ilova bu jadvallarni anon kalit bilan ochmaydi.
-- Telefon va aniq manzil faqat serverdagi DATABASE_URL ulanishida ochiladi.
-- EXPO_PUBLIC_SUPABASE_ANON_KEY va service_role kalitini ilovaga yozmang.
-- user_id Supabase Auth uchun qoldirilgan. Ilova odamni telefon raqami bilan tanidi,
-- shuning uchun e'lon egasi phone_number, usta esa master_phone.

create table if not exists public.construction_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  category text,
  district text default 'Shahrixon',
  address text,
  phone_number text not null,
  images text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'filled')),
  created_at timestamptz not null default now(),
  region text not null default '',
  area text not null default '',
  price integer,
  pay_kind text not null default '',
  term text not null default '',
  workers integer not null default 1
);

create index if not exists construction_jobs_open_idx
  on public.construction_jobs (status, created_at desc);

create table if not exists public.master_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  master_phone text not null unique,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_active boolean not null default true,
  check (expires_at > starts_at)
);

alter table public.construction_jobs enable row level security;
alter table public.master_subscriptions enable row level security;

alter table public.construction_jobs force row level security;
alter table public.master_subscriptions force row level security;

revoke all on table public.construction_jobs from public;
revoke all on table public.master_subscriptions from public;

revoke all on table public.construction_jobs from anon;
revoke all on table public.master_subscriptions from anon;

revoke all on table public.construction_jobs from authenticated;
revoke all on table public.master_subscriptions from authenticated;

-- Siyosat yo'q. RLS yoqilganda anon va authenticated uchun bu rad etishdir.
-- Ochiq ruxsat qo'shmang.
-- Obuna qatori to'lov tasdiqlangandan keyin shu yerda yoziladi. Ilova uni bepul ochmaydi.
-- insert into public.master_subscriptions (master_phone, expires_at)
-- values ('998900000000', now() + interval '7 days');
