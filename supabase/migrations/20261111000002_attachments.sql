-- Organizér – prílohy k úlohám (spustite raz v Supabase → SQL Editor, po prvom SQL)
-- Súbory sú v súkromnom úložisku „attachments“ v priečinku <id používateľa>/<id úlohy>/.

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  name text not null check (length(name) between 1 and 300),
  path text not null unique,
  size bigint not null default 0,
  mime text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists attachments_task_idx on public.attachments (task_id);

alter table public.attachments enable row level security;
drop policy if exists own_attachments on public.attachments;
create policy own_attachments on public.attachments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.attachments from anon;
grant select, insert, update, delete on public.attachments to authenticated;

-- Súkromný bucket, max. 50 MB na súbor (limit bezplatného plánu)
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Prístup k súborom: iba vo vlastnom priečinku (prvá časť cesty = id používateľa)
drop policy if exists "organizer attachments read" on storage.objects;
drop policy if exists "organizer attachments insert" on storage.objects;
drop policy if exists "organizer attachments delete" on storage.objects;
create policy "organizer attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "organizer attachments insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "organizer attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
