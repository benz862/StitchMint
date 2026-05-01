-- StitchMint schema: run in Supabase SQL editor or via CLI
-- Requires pgcrypto for gen_random_uuid (enabled by default on Supabase)

create extension if not exists "pgcrypto";

-- Profiles mirror auth.users for admin flag and email cache
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  original_image_url text,
  preview_image_url text,
  zip_file_url text,
  title text not null default 'My Pattern',
  stitch_width int,
  stitch_height int,
  fabric_count int,
  color_count int,
  difficulty_mode text,
  total_stitches int,
  stitchability_score int,
  payment_status text not null default 'draft',
  stripe_session_id text,
  crop jsonb,
  detail_level text,
  stitch_width_setting int,
  generation_error text,
  grid_json jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists patterns_user_id_idx on public.patterns (user_id);
create index if not exists patterns_payment_status_idx on public.patterns (payment_status);
create index if not exists patterns_stripe_session_idx on public.patterns (stripe_session_id);

create table if not exists public.pattern_colors (
  id uuid primary key default gen_random_uuid(),
  pattern_id uuid not null references public.patterns (id) on delete cascade,
  dmc_number text not null,
  dmc_name text not null,
  hex text not null,
  symbol text not null,
  stitch_count int not null default 0,
  estimated_skeins int not null default 1
);

create index if not exists pattern_colors_pattern_id_idx on public.pattern_colors (pattern_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  pattern_id uuid references public.patterns (id) on delete set null,
  stripe_session_id text unique,
  stripe_payment_intent text,
  amount int not null,
  currency text not null default 'usd',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_pattern_id_idx on public.orders (pattern_id);

-- New user → profile row
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user ();

-- RLS
alter table public.profiles enable row level security;
alter table public.patterns enable row level security;
alter table public.pattern_colors enable row level security;
alter table public.orders enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "patterns_select_own"
  on public.patterns for select
  using (auth.uid() = user_id);

create policy "patterns_insert_own"
  on public.patterns for insert
  with check (auth.uid() = user_id);

create policy "patterns_update_own"
  on public.patterns for update
  using (auth.uid() = user_id);

create policy "pattern_colors_select_own"
  on public.pattern_colors for select
  using (
    exists (
      select 1 from public.patterns p
      where p.id = pattern_id and p.user_id = auth.uid()
    )
  );

create policy "pattern_colors_insert_own"
  on public.pattern_colors for insert
  with check (
    exists (
      select 1 from public.patterns p
      where p.id = pattern_id and p.user_id = auth.uid()
    )
  );

create policy "pattern_colors_update_own"
  on public.pattern_colors for update
  using (
    exists (
      select 1 from public.patterns p
      where p.id = pattern_id and p.user_id = auth.uid()
    )
  );

create policy "pattern_colors_delete_own"
  on public.pattern_colors for delete
  using (
    exists (
      select 1 from public.patterns p
      where p.id = pattern_id and p.user_id = auth.uid()
    )
  );

create policy "orders_select_own"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "orders_insert_own"
  on public.orders for insert
  with check (auth.uid() = user_id);

-- Storage buckets (create in dashboard): originals, previews, packages
-- Example policy for authenticated uploads to originals:
-- (Add via Supabase UI if SQL bucket API differs)

comment on table public.patterns is 'Cross-stitch pattern jobs and assets';
comment on table public.pattern_colors is 'Per-pattern DMC legend rows';
