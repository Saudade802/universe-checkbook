-- Run in Supabase SQL Editor. All temporary account/test rows are rolled back.
begin;
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  saved_id uuid := gen_random_uuid();
  r jsonb;
  i integer;
  valid jsonb := '{"date":"2026-10-14","payee":"测试","amount":"10000.50","goal":"验证提交次数","author":"测试"}'::jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (a,'checkbook-test-'||a||'@example.invalid','{"display_name":"quota-test"}'::jsonb),
    (b,'checkbook-test-'||b||'@example.invalid','{"display_name":"quota-test"}'::jsonb);
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  r := public.manifestation_status();
  if (r->>'used')::int <> 0 then raise exception 'Initial count failed'; end if;
  r := public.manifestation_submit(first_id,'{}'::jsonb);
  if (r->>'used')::int <> 1 or r->>'status' <> 'invalid' then raise exception 'Invalid attempt not counted'; end if;
  if (select count(*) from jsonb_object_keys(r->'errors')) <> 5 then raise exception 'Required fields failed'; end if;
  r := public.manifestation_submit(first_id,valid);
  if (r->>'used')::int <> 1 or r->>'status' <> 'invalid' then raise exception 'Deduplication failed'; end if;
  r := public.manifestation_submit(saved_id,valid);
  if (r->>'used')::int <> 2 or r->>'status' <> 'success' then raise exception 'Valid submission failed'; end if;
  r := public.manifestation_submit(gen_random_uuid(),valid || '{"date":"2026-02-29"}'::jsonb);
  if (r->>'used')::int <> 3 or not (r->'errors' ? 'date') then raise exception 'Calendar validation failed'; end if;
  for i in 1..47 loop perform public.manifestation_submit(gen_random_uuid(),'{}'::jsonb); end loop;
  r := public.manifestation_submit(gen_random_uuid(),valid);
  if r->>'status' <> 'limit' or (r->>'used')::int <> 50 then raise exception 'Quota limit failed'; end if;
  r := public.manifestation_submit(saved_id,valid);
  if not (r->>'success')::boolean or (r->>'used')::int <> 50 then raise exception 'Retry at limit failed'; end if;
  r := public.manifestation_status();
  if r->'latest'->'fields' <> valid then raise exception 'Latest saved data failed'; end if;
  begin
    insert into public.manifestation_quota(user_id,used) values(b,0);
    raise exception 'Authenticated user unexpectedly allowed to modify quota directly';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  r := public.manifestation_status();
  if (r->>'used')::int <> 0 or r->'latest' <> 'null'::jsonb then raise exception 'Account separation failed'; end if;
  if (select count(*) from public.manifestation_attempts where user_id=a) <> 0 then raise exception 'RLS isolation failed'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.manifestation_status();
    raise exception 'Anonymous access unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'set local role none';
end;
$$;
rollback;
