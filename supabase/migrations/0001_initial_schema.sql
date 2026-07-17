create extension if not exists "pgcrypto";

create type public.user_status as enum ('online', 'away', 'busy', 'offline');
create type public.friend_status as enum ('pending', 'accepted', 'rejected');
create type public.message_status as enum ('sent', 'delivered', 'seen');
create type public.call_type as enum ('voice', 'video', 'group');
create type public.call_status as enum ('ringing', 'answered', 'declined', 'missed', 'ended');

create table public.users (
  id uuid primary key default gen_random_uuid(),
  username varchar(32) not null unique,
  email text not null unique,
  password_hash text not null,
  avatar text,
  bio varchar(280),
  status public.user_status not null default 'offline',
  last_seen timestamptz default now(),
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,32}$')
);

create table public.friends (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  status public.friend_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint no_self_friend check (requester_id <> receiver_id),
  constraint unique_friend_request unique (requester_id, receiver_id)
);

create unique index unique_friend_pair on public.friends
  (least(requester_id, receiver_id), greatest(requester_id, receiver_id))
  where status in ('pending', 'accepted');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  message_text varchar(4000) not null,
  status public.message_status not null default 'sent',
  created_at timestamptz not null default now(),
  constraint non_empty_message check (length(trim(message_text)) > 0)
);

create index messages_conversation_idx on public.messages (sender_id, receiver_id, created_at desc);
create index messages_receiver_unread_idx on public.messages (receiver_id, status) where status <> 'seen';

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid references public.users(id) on delete set null,
  room_id uuid not null default gen_random_uuid(),
  call_type public.call_type not null,
  duration integer not null default 0 check (duration >= 0),
  status public.call_status not null default 'ringing',
  created_at timestamptz not null default now()
);

create table public.call_participants (
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  primary key (call_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type varchar(40) not null,
  content varchar(500) not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

create table public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.friends enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;
alter table public.call_participants enable row level security;
alter table public.notifications enable row level security;
alter table public.refresh_tokens enable row level security;
alter table public.email_verification_tokens enable row level security;

-- The API connects with SUPABASE_SERVICE_ROLE_KEY and performs authorization.
-- RLS intentionally denies direct anonymous/client access to sensitive tables.

