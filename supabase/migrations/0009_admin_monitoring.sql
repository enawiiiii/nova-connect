alter table public.users
  add column if not exists is_admin boolean not null default false;

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  level varchar(20) not null default 'error' check (level in ('info', 'warning', 'error')),
  source varchar(40) not null,
  message varchar(1000) not null,
  details jsonb,
  path varchar(500),
  user_agent varchar(500),
  created_at timestamptz not null default now()
);

create index if not exists app_events_created_idx on public.app_events (created_at desc);
create index if not exists app_events_level_idx on public.app_events (level, created_at desc);
alter table public.app_events enable row level security;
