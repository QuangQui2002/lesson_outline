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
  "quizName" text not null default 'Khác',
  tags text[] not null default '{}',
  "createdAt" timestamptz not null default now(),
  "sourceId" bigint,
  "sourceSlot" integer
);

alter table public.questions add column if not exists "quizName" text not null default 'Khác';

create index if not exists questions_subject_id_idx on public.questions("subjectId");
create index if not exists questions_quiz_name_idx on public.questions("quizName");
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

create table if not exists public.lesson_videos (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects(id) on delete cascade,
  course_id bigint,
  course_name text,
  week_name text,
  lesson_name text not null,
  module_id bigint not null,
  cmid bigint,
  module_type text not null default 'L',
  page_url text,
  video_url text,
  external_urls jsonb not null default '[]',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_id, module_id)
);

create index if not exists lesson_videos_subject_id_idx on public.lesson_videos(subject_id);
create index if not exists lesson_videos_module_id_idx on public.lesson_videos(module_id);
create index if not exists lesson_videos_week_name_idx on public.lesson_videos(week_name);


alter table public.lesson_videos enable row level security;

create policy "Public read lesson videos"
  on public.lesson_videos
  for select
  using (true);


