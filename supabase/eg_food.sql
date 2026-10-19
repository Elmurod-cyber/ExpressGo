-- Taom mijozlari, savati va buyurtma tarixi.
-- Ilova bu jadvallarga to'g'ridan-to'g'ri ulanmaydi.
-- Server faqat DATABASE_URL orqali yozadi. Bu kalitni EXPO_PUBLIC_ qilmang.
-- Supabase Auth (auth.users) ishlatilmaydi: mijoz telefon kodi bilan kiradi.
-- Taom va restoran id lari ilovadagi matn kalitlar (lavash, shahrixon). Alohida foods/restaurants jadvali yo'q.

create table if not exists public.eg_food_users (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  full_name text,
  avatar_url text,
  address text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.eg_food_cart (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.eg_food_users (id) on delete cascade,
  food_id text not null,
  quantity int not null default 1 check (quantity > 0),
  restaurant_id text not null,
  unique (user_id, restaurant_id, food_id)
);

create table if not exists public.eg_food_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.eg_food_users (id) on delete cascade,
  restaurant_id text not null,
  ticket_id text not null,
  body jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists eg_food_orders_ticket_id_uid on public.eg_food_orders (ticket_id);

alter table public.eg_food_users enable row level security;
alter table public.eg_food_cart enable row level security;
alter table public.eg_food_orders enable row level security;

alter table public.eg_food_users force row level security;
alter table public.eg_food_cart force row level security;
alter table public.eg_food_orders force row level security;

revoke all on table public.eg_food_users from public, anon, authenticated;
revoke all on table public.eg_food_cart from public, anon, authenticated;
revoke all on table public.eg_food_orders from public, anon, authenticated;

-- Siyosat yo'q. Anon kalit telefonni o'qiy olmaydi.
