-- Organizér – poznámky a prílohy k projektu (spustite raz v Supabase → SQL Editor, po predchádzajúcich SQL)

alter table public.projects add column if not exists note text not null default '';
do $$ begin
  alter table public.projects add constraint projects_note_len check (length(note) <= 50000);
exception when duplicate_object then null; end $$;

-- Príloha patrí buď úlohe, alebo projektu
alter table public.attachments alter column task_id drop not null;
alter table public.attachments add column if not exists project_id uuid references public.projects(id) on delete cascade;
create index if not exists attachments_project_idx on public.attachments (project_id);
do $$ begin
  alter table public.attachments add constraint attachments_one_owner
    check ((task_id is not null and project_id is null) or (task_id is null and project_id is not null));
exception when duplicate_object then null; end $$;

-- Príloha smie odkazovať iba na vlastnú úlohu / vlastný projekt
create or replace function public.check_attachment_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.task_id is not null and not exists (select 1 from public.tasks t where t.id = new.task_id and t.user_id = new.user_id) then
    raise exception 'Úloha nepatrí používateľovi';
  end if;
  if new.project_id is not null and not exists (select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id) then
    raise exception 'Projekt nepatrí používateľovi';
  end if;
  return new;
end $$;
drop trigger if exists attachments_owner on public.attachments;
create trigger attachments_owner before insert or update on public.attachments
  for each row execute function public.check_attachment_owner();
