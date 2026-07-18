alter table public.users
  add column if not exists totp_secret text,
  add column if not exists totp_enabled boolean not null default false;

alter table public.refresh_tokens
  add column if not exists user_agent varchar(500),
  add column if not exists ip_address varchar(64),
  add column if not exists last_used_at timestamptz not null default now();

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  reported_id uuid not null references public.users(id) on delete cascade,
  reason varchar(40) not null,
  details varchar(1000),
  status varchar(20) not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;
