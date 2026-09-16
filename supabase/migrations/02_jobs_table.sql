-- Phase 2: LinkedIn discovered jobs
create extension if not exists "pgcrypto";

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null unique,
  title text not null,
  company text,
  location text,
  url text,
  description text,
  is_easy_apply boolean default false,
  status text not null default 'discovered',
  created_at timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);

alter table public.jobs enable row level security;

-- Authenticated users can read discovered jobs
drop policy if exists "Authenticated users can read jobs" on public.jobs;
create policy "Authenticated users can read jobs"
  on public.jobs
  for select
  to authenticated
  using (true);

-- Authenticated users can insert jobs (client-side tooling / service role bypasses RLS)
drop policy if exists "Authenticated users can insert jobs" on public.jobs;
create policy "Authenticated users can insert jobs"
  on public.jobs
  for insert
  to authenticated
  with check (true);

-- Authenticated users can update job status / fields
drop policy if exists "Authenticated users can update jobs" on public.jobs;
create policy "Authenticated users can update jobs"
  on public.jobs
  for update
  to authenticated
  using (true)
  with check (true);

-- Service role used by backend workers bypasses RLS by default.
grant select, insert, update on public.jobs to authenticated;
grant all on public.jobs to service_role;
