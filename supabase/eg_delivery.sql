-- Yetkazib berish buyurtmalari.
-- Ilova bu jadvallarga to'g'ridan-to'g'ri ulanmaydi.
-- Server faqat DATABASE_URL orqali yozadi. Bu kalitni EXPO_PUBLIC_ qilmang.
-- service_role va anon kalitini ilovaga yozmang.
-- Eski telefon xotirasi (AsyncStorage) avtomatik o'chirilmaydi va bu jadvalga ko'chirilmaydi.

create table if not exists public.eg_delivery_users (
  id text primary key,
  phone text not null,
  role text not null check (role in ('sender', 'courier')),
  is_admin boolean not null default false,
  body jsonb not null,
  unique (phone, role)
);

create table if not exists public.eg_delivery_sessions (
  token_hash text primary key,
  user_id text not null references public.eg_delivery_users (id),
  expires_at bigint not null
);

create table if not exists public.eg_delivery_otps (
  phone text not null,
  role text not null,
  code_hash text not null,
  expires_at bigint not null,
  tries integer not null default 0,
  primary key (phone, role)
);

create table if not exists public.eg_delivery_orders (
  id text primary key,
  sender_id text not null references public.eg_delivery_users (id),
  courier_id text,
  status text not null check (status in ('posted', 'accepted', 'picked_up', 'delivered', 'cancelled')),
  version integer not null,
  body jsonb not null
);

alter table public.eg_delivery_users enable row level security;
alter table public.eg_delivery_sessions enable row level security;
alter table public.eg_delivery_otps enable row level security;
alter table public.eg_delivery_orders enable row level security;

alter table public.eg_delivery_users force row level security;
alter table public.eg_delivery_sessions force row level security;
alter table public.eg_delivery_otps force row level security;
alter table public.eg_delivery_orders force row level security;

revoke all on table public.eg_delivery_users from public;
revoke all on table public.eg_delivery_sessions from public;
revoke all on table public.eg_delivery_otps from public;
revoke all on table public.eg_delivery_orders from public;

revoke all on table public.eg_delivery_users from anon;
revoke all on table public.eg_delivery_sessions from anon;
revoke all on table public.eg_delivery_otps from anon;
revoke all on table public.eg_delivery_orders from anon;

revoke all on table public.eg_delivery_users from authenticated;
revoke all on table public.eg_delivery_sessions from authenticated;
revoke all on table public.eg_delivery_otps from authenticated;
revoke all on table public.eg_delivery_orders from authenticated;

-- Siyosat yo'q. Anon va authenticated o'qiy olmaydi va yoza olmaydi.
-- Ochiq ruxsat qo'shmang.
-- Qabul qilish serverda bitta shart bilan yoziladi:
-- status = 'posted' and courier_id is null
