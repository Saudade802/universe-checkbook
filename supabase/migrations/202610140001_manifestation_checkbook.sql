-- Independent tables: existing application tables are unchanged.
create table public.manifestation_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used integer not null default 0 check (used between 0 and 50)
);
create table public.manifestation_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  successful boolean not null,
  data jsonb,
  errors jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  ordinal bigint generated always as identity,
  primary key (user_id, request_id)
);
create index manifestation_latest on public.manifestation_attempts(user_id, ordinal desc) where successful;
alter table public.manifestation_quota enable row level security;
alter table public.manifestation_attempts enable row level security;
revoke all on public.manifestation_quota, public.manifestation_attempts from anon, authenticated;
grant select on public.manifestation_quota, public.manifestation_attempts to authenticated;
create policy manifestation_own_quota on public.manifestation_quota for select to authenticated using ((select auth.uid()) = user_id);
create policy manifestation_own_attempts on public.manifestation_attempts for select to authenticated using ((select auth.uid()) = user_id);

create function public.manifestation_status() returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_used integer;
  v_latest jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select coalesce(q.used,0), (
    select jsonb_build_object('requestId',a.request_id,'fields',a.data,'createdAt',a.created_at)
    from public.manifestation_attempts a where a.user_id=v_user and a.successful
    order by a.ordinal desc limit 1
  ) into v_used,v_latest from (select 1) s left join public.manifestation_quota q on q.user_id=v_user;
  return jsonb_build_object('used',v_used,'remaining',50-v_used,'latest',v_latest);
end;
$$;

create function public.manifestation_submit(p_request_id uuid, p_fields jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_used integer;
  v_row public.manifestation_attempts%rowtype;
  v_fields jsonb := '{}'::jsonb;
  v_errors jsonb := '{}'::jsonb;
  v_key text;
  v_label text;
  v_max integer;
  v_value text;
  v_date text;
  v_amount text;
  v_valid boolean;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'Request ID required' using errcode = '22023'; end if;
  insert into public.manifestation_quota(user_id) values(v_user) on conflict do nothing;
  -- Serialize all writes for this account. Quota and the saved attempt commit
  -- atomically, including concurrent requests and retries across devices.
  select used into v_used from public.manifestation_quota where user_id=v_user for update;
  select * into v_row from public.manifestation_attempts where user_id=v_user and request_id=p_request_id;
  if found then
    return jsonb_build_object('used',v_used,'remaining',50-v_used,'success',v_row.successful,'errors',v_row.errors,
      'status',case when v_row.successful then 'success' else 'invalid' end,
      'check',case when v_row.successful then jsonb_build_object('requestId',v_row.request_id,'fields',v_row.data,'createdAt',v_row.created_at) else null end);
  end if;
  if v_used >= 50 then return jsonb_build_object('used',50,'remaining',0,'success',false,'errors','{}'::jsonb,'check',null,'status','limit'); end if;

  foreach v_key in array array['date','payee','amount','goal','author'] loop
    v_value := case when jsonb_typeof(p_fields->v_key) = 'string' then regexp_replace(p_fields->>v_key,'^[[:space:]]+|[[:space:]]+$','','g') else '' end;
    v_fields := v_fields || jsonb_build_object(v_key,coalesce(v_value,''));
  end loop;
  foreach v_key in array array['payee','goal','author'] loop
    v_label := case v_key when 'payee' then '收款人' when 'goal' then '用于/目标' else '填写人' end;
    v_max := case v_key when 'goal' then 80 else 30 end;
    v_value := v_fields->>v_key;
    if v_value = '' then v_errors := v_errors || jsonb_build_object(v_key,'请填写'||v_label);
    elsif char_length(v_value) > v_max then v_errors := v_errors || jsonb_build_object(v_key,v_label||'最多'||v_max||'个字');
    elsif v_value ~ '[[:cntrl:]]' then v_errors := v_errors || jsonb_build_object(v_key,v_label||'请使用单行文字'); end if;
  end loop;
  v_date := v_fields->>'date';
  if v_date = '' then v_errors := v_errors || jsonb_build_object('date','请选择日期');
  else
    v_valid := false;
    if v_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_date >= '1900-01-01' and v_date <= '9999-12-31' then
      begin v_valid := to_char(v_date::date,'YYYY-MM-DD') = v_date; exception when others then v_valid := false; end;
    end if;
    if not v_valid then v_errors := v_errors || jsonb_build_object('date','请选择有效日期（1900—9999年）'); end if;
  end if;
  v_amount := v_fields->>'amount';
  if v_amount = '' then v_errors := v_errors || jsonb_build_object('amount','请填写金额');
  elsif v_amount !~ '^[0-9]{1,15}(\.[0-9]{1,2})?$' then v_errors := v_errors || jsonb_build_object('amount','请输入大于0的金额，最多15位整数、2位小数');
  elsif v_amount::numeric <= 0 then v_errors := v_errors || jsonb_build_object('amount','请输入大于0的金额，最多15位整数、2位小数'); end if;
  v_valid := v_errors = '{}'::jsonb;
  insert into public.manifestation_attempts(user_id,request_id,successful,data,errors)
    values(v_user,p_request_id,v_valid,case when v_valid then v_fields else null end,v_errors)
    returning * into v_row;
  v_used := v_used + 1;
  update public.manifestation_quota set used=v_used where user_id=v_user;
  return jsonb_build_object('used',v_used,'remaining',50-v_used,'success',v_valid,'errors',v_errors,
    'status',case when v_valid then 'success' else 'invalid' end,
    'check',case when v_valid then jsonb_build_object('requestId',v_row.request_id,'fields',v_row.data,'createdAt',v_row.created_at) else null end);
end;
$$;
revoke all on function public.manifestation_status(), public.manifestation_submit(uuid,jsonb) from public, anon;
grant execute on function public.manifestation_status(), public.manifestation_submit(uuid,jsonb) to authenticated;
