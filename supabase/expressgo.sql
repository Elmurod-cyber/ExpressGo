-- Bu fayl endi yetkazib berish uchun ishlatilmaydi.
-- Eski eg_users / eg_orders / eg_chats / eg_notes jadvallari anonim mijozga ochiq edi.
-- Quyidagi buyruqlar mavjud qatorlarni o'chirmaydi.
-- Ular anon va authenticated uchun o'qish va yozishni yopadi.
-- Yetkazib berish buyurtmasi: supabase/eg_delivery.sql va serverdagi DATABASE_URL.

create table if not exists public.eg_users (
  id text primary key,
  updated_at bigint not null,
  body jsonb not null
);

create table if not exists public.eg_orders (
  id text primary key,
  updated_at bigint not null,
  body jsonb not null
);

create table if not exists public.eg_chats (
  id text primary key,
  updated_at bigint not null,
  body jsonb not null
);

create table if not exists public.eg_notes (
  id text primary key,
  updated_at bigint not null,
  body jsonb not null
);

alter table public.eg_users enable row level security;
alter table public.eg_orders enable row level security;
alter table public.eg_chats enable row level security;
alter table public.eg_notes enable row level security;

alter table public.eg_users force row level security;
alter table public.eg_orders force row level security;
alter table public.eg_chats force row level security;
alter table public.eg_notes force row level security;

drop policy if exists eg_users_read on public.eg_users;
drop policy if exists eg_users_insert on public.eg_users;
drop policy if exists eg_users_update on public.eg_users;
drop policy if exists eg_orders_read on public.eg_orders;
drop policy if exists eg_orders_insert on public.eg_orders;
drop policy if exists eg_orders_update on public.eg_orders;
drop policy if exists eg_chats_read on public.eg_chats;
drop policy if exists eg_chats_insert on public.eg_chats;
drop policy if exists eg_chats_update on public.eg_chats;
drop policy if exists eg_notes_read on public.eg_notes;
drop policy if exists eg_notes_insert on public.eg_notes;
drop policy if exists eg_notes_update on public.eg_notes;

revoke all on table public.eg_users from public;
revoke all on table public.eg_orders from public;
revoke all on table public.eg_chats from public;
revoke all on table public.eg_notes from public;

revoke all on table public.eg_users from anon;
revoke all on table public.eg_orders from anon;
revoke all on table public.eg_chats from anon;
revoke all on table public.eg_notes from anon;

revoke all on table public.eg_users from authenticated;
revoke all on table public.eg_orders from authenticated;
revoke all on table public.eg_chats from authenticated;
revoke all on table public.eg_notes from authenticated;

-- Siyosat yo'q. Ochiq ruxsat qaytarmang.
