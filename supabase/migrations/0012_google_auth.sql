alter table public.users
  add column if not exists google_subject text;

create unique index if not exists users_google_subject_unique
  on public.users (google_subject)
  where google_subject is not null;
