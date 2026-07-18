alter table public.users
  add column if not exists show_last_seen boolean not null default true,
  add column if not exists show_avatar boolean not null default true,
  add column if not exists allow_friend_requests boolean not null default true;
