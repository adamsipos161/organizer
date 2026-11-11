-- Organizér – schéma databázy (spustite raz v Supabase → SQL Editor)
-- Každý riadok patrí jednému používateľovi (user_id); RLS povolí prístup iba k vlastným dátam.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  color text not null default '#4F86C6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived boolean not null default false,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (length(title) between 1 and 500),
  note text not null default '' check (length(note) <= 20000),
  due_date date,
  priority smallint not null default 0 check (priority between 0 and 3),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  -- podúlohy (iba jedna úroveň): [{ "id", "title", "done", "due" }]
  subtasks jsonb not null default '[]'::jsonb check (jsonb_typeof(subtasks) = 'array'),
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (length(title) between 1 and 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '' check (length(location) <= 500),
  note text not null default '' check (length(note) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  default_meeting_minutes integer not null default 60 check (default_meeting_minutes between 5 and 720),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_idx on public.tasks (user_id);
create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists meetings_user_start_idx on public.meetings (user_id, starts_at);
create index if not exists projects_user_idx on public.projects (user_id);

-- Projekt úlohy/stretnutia musí patriť tomu istému používateľovi
create or replace function public.check_project_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id
  ) then
    raise exception 'Projekt nepatrí používateľovi';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists tasks_project_owner on public.tasks;
create trigger tasks_project_owner before insert or update on public.tasks
  for each row execute function public.check_project_owner();
drop trigger if exists meetings_project_owner on public.meetings;
create trigger meetings_project_owner before insert or update on public.meetings
  for each row execute function public.check_project_owner();
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.user_settings;
create trigger settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- RLS: každý vidí a mení iba svoje riadky
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists own_projects on public.projects;
create policy own_projects on public.projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_tasks on public.tasks;
create policy own_tasks on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_meetings on public.meetings;
create policy own_meetings on public.meetings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_settings on public.user_settings;
create policy own_settings on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Anonymný prístup nemá k dátam nič
revoke all on public.projects, public.tasks, public.meetings, public.user_settings from anon;
grant select, insert, update, delete on public.projects, public.tasks, public.meetings, public.user_settings to authenticated;
