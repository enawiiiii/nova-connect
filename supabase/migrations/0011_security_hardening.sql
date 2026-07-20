-- Prevent case-only username impersonation and enforce report integrity at the database layer.
create unique index if not exists users_username_lower_unique
  on public.users (lower(username));

alter table public.user_reports
  drop constraint if exists no_self_report;

alter table public.user_reports
  add constraint no_self_report check (reporter_id <> reported_id);

alter table public.user_reports
  drop constraint if exists report_reason_allowed;

alter table public.user_reports
  add constraint report_reason_allowed check (reason in ('spam', 'harassment', 'impersonation', 'unsafe', 'other'));

alter table public.user_reports
  drop constraint if exists report_status_allowed;

alter table public.user_reports
  add constraint report_status_allowed check (status in ('open', 'reviewing', 'resolved', 'dismissed'));
