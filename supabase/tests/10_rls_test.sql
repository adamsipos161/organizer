-- Lokálny test RLS (nespúšťať v Supabase)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','a@test.sk'),('00000000-0000-0000-0000-00000000000b','b@test.sk');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',false);
insert into projects (id,name) values ('10000000-0000-0000-0000-000000000001','A projekt');
insert into tasks (title, project_id) values ('úloha A','10000000-0000-0000-0000-000000000001');
insert into meetings (title, starts_at, ends_at) values ('st A', now(), now()+interval '1 hour');
insert into user_settings default values;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',false);
do $$ begin
  if (select count(*) from tasks) <> 0 or (select count(*) from projects) <> 0 or (select count(*) from meetings) <> 0 then raise exception 'FAIL: B vidí dáta A'; end if;
  raise notice 'OK B nevidí dáta A';
  begin
    insert into tasks (title, project_id) values ('cudzí projekt','10000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: B priradil úlohu do projektu A';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK cudzí projekt odmietnutý (%)', sqlerrm;
  end;
  begin
    insert into tasks (user_id, title) values ('00000000-0000-0000-0000-00000000000a','podvrh');
    raise exception 'FAIL: B zapísal za A';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK zápis za iného odmietnutý';
  end;
  update tasks set title='x'; delete from projects;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',false);
do $$ begin
  if (select count(*) from projects) <> 1 or (select title from tasks) <> 'úloha A' then raise exception 'FAIL: B zmenil dáta A'; end if;
  raise notice 'OK dáta A nedotknuté';
  delete from projects;
  if (select project_id from tasks) is not null then raise exception 'FAIL'; end if;
  raise notice 'OK zmazanie projektu ponechá úlohy (project_id = null)';
end $$;
reset role;
set role anon;
do $$ begin
  begin perform 1 from tasks; raise exception 'FAIL anon'; exception when insufficient_privilege then raise notice 'OK anon nemá prístup'; end;
end $$;
