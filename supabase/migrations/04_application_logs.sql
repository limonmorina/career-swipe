-- Phase 5: application diagnostics + match score analytics
create extension if not exists "pgcrypto";

create table if not exists public.application_logs (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  error_message text,
  screenshot_url text,
  created_at timestamptz not null default now()
);

create index if not exists application_logs_job_id_idx
  on public.application_logs (job_id);

create index if not exists application_logs_created_at_idx
  on public.application_logs (created_at desc);

alter table public.application_logs enable row level security;

drop policy if exists "Authenticated users can read application logs" on public.application_logs;
create policy "Authenticated users can read application logs"
  on public.application_logs
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert application logs" on public.application_logs;
create policy "Authenticated users can insert application logs"
  on public.application_logs
  for insert
  to authenticated
  with check (true);

grant select, insert on public.application_logs to authenticated;
grant all on public.application_logs to service_role;

-- Optional analytics field for Gemini match scores
alter table public.jobs
  add column if not exists match_score integer;
