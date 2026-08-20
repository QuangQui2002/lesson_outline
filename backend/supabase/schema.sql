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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 8388608, array['image/*'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists questions_subject_id_idx on public.questions("subjectId");
create index if not exists questions_quiz_name_idx on public.questions("quizName");
create index if not exists questions_created_at_idx on public.questions("createdAt");
create index if not exists questions_subject_created_idx
  on public.questions("subjectId", "createdAt" desc);
create index if not exists questions_subject_quiz_created_idx
  on public.questions("subjectId", "quizName", "createdAt" desc);

create extension if not exists pg_trgm;
create extension if not exists unaccent;
create index if not exists questions_content_trgm_idx
  on public.questions using gin (content gin_trgm_ops);
create index if not exists questions_answer_trgm_idx
  on public.questions using gin (answer gin_trgm_ops);
create index if not exists questions_quiz_name_trgm_idx
  on public.questions using gin ("quizName" gin_trgm_ops);

create or replace function public.normalize_question_search_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select trim(regexp_replace(
    unaccent(lower(regexp_replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(coalesce(value, ''), '&nbsp;', ' '),
                '&amp;', '&'
              ),
              '&lt;', '<'
            ),
            '&gt;', '>'
          ),
          '&quot;', '"'
        ),
        '&#39;', ''''
      ),
      '<[^>]+>', ' ', 'g'
    ))),
    '[^[:alnum:]]+', ' ', 'g' 
  ));
$$;

create index if not exists questions_content_search_trgm_idx
  on public.questions using gin (public.normalize_question_search_text(content) gin_trgm_ops);
create index if not exists questions_answer_search_trgm_idx
  on public.questions using gin (public.normalize_question_search_text(answer) gin_trgm_ops);
create or replace function public.search_questions_v2(
  p_subject_id text default null,
  p_quiz_name text default null,
  p_search text default null
)
returns setof public.questions
language sql
stable
as $$
  select question.*
  from public.questions as question
  where (p_subject_id is null or question."subjectId" = p_subject_id)
    and (p_quiz_name is null or question."quizName" = p_quiz_name)
    and (
      p_search is null
      or public.normalize_question_search_text(question.content)
        like '%' || public.normalize_question_search_text(p_search) || '%'
      or public.normalize_question_search_text(question.answer)
        like '%' || public.normalize_question_search_text(p_search) || '%'
    )
  order by question."createdAt" desc;
$$;

create or replace function public.get_subjects_with_question_counts()
returns table (
  id text,
  name text,
  "createdAt" timestamptz,
  "questionCount" bigint
)
language sql
stable
as $$
  select subject.id, subject.name, subject."createdAt", count(question.id) as "questionCount"
  from public.subjects as subject
  left join public.questions as question on question."subjectId" = subject.id
  group by subject.id, subject.name, subject."createdAt"
  order by subject."createdAt" asc;
$$;

create or replace function public.get_question_stats()
returns jsonb
language sql
stable
as $$
  with subject_stats as (
    select
      question."subjectId" as subject_id,
      count(*) as question_count,
      jsonb_agg(distinct coalesce(nullif(trim(question."quizName"), ''), 'Khac')) as quiz_names
    from public.questions as question
    group by question."subjectId"
  )
  select jsonb_build_object(
    'total', (select count(*) from public.questions),
    'countsBySubject', coalesce(
      (select jsonb_object_agg(subject_id, question_count) from subject_stats),
      '{}'::jsonb
    ),
    'quizNamesBySubject', coalesce(
      (select jsonb_object_agg(subject_id, quiz_names) from subject_stats),
      '{}'::jsonb
    )
  );
$$;

alter table public.subjects enable row level security;
alter table public.questions enable row level security;

drop policy if exists "Public read subjects" on public.subjects;
create policy "Public read subjects"
  on public.subjects
  for select
  using (true);

drop policy if exists "Public read questions" on public.questions;
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

