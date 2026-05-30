create table if not exists public.subjects (
  id text primary key,
  name text not null unique,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  "subjectId" text not null references public.subjects(id) on delete cascade,
  content text not null,
  answer text not null,
  tags text[] not null default '{}',
  "createdAt" timestamptz not null default now(),
  "sourceId" bigint,
  "sourceSlot" integer
);

create index if not exists questions_subject_id_idx on public.questions("subjectId");
create index if not exists questions_created_at_idx on public.questions("createdAt");

alter table public.subjects enable row level security;
alter table public.questions enable row level security;

create policy "Public read subjects"
  on public.subjects
  for select
  using (true);

create policy "Public read questions"
  on public.questions
  for select
  using (true);
create table if not exists public.api_daily_stats (
  date date primary key,
  total_requests integer not null default 0,
  unique_users text[] not null default '{}',
  method_counts jsonb not null default '{}',
  status_counts jsonb not null default '{}',
  endpoint_counts jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.api_daily_stats enable row level security;
