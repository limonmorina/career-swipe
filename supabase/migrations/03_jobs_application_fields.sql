-- Phase 4: application tracking fields
alter table public.jobs
  add column if not exists resume_url text,
  add column if not exists applied_at timestamptz,
  add column if not exists error_message text,
  add column if not exists last_error_at timestamptz;

create index if not exists jobs_applied_at_idx on public.jobs (applied_at desc);
