-- Start annual Travel Order numbering at 0001 using the Asia/Manila calendar year.
create or replace function public.admin_approve_order(p_order_id uuid, p_remarks text default null)
returns public.travel_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.travel_orders%rowtype;
  v_admin public.admin_users%rowtype;
  v_settings public.app_settings%rowtype;
  v_seq integer;
  v_year text := extract(year from (now() at time zone 'Asia/Manila'))::int::text;
  v_to_number text;
  v_sig_name text;
  v_sig_title text;
begin
  if not public.is_active_admin() then
    raise exception 'Unauthorized: HR/Admin access required.';
  end if;

  select * into v_admin from public.admin_users where id = auth.uid();
  select * into v_row from public.travel_orders where id = p_order_id for update;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_row.status <> 'VERIFIED' then
    raise exception 'Only verified applications can be approved.';
  end if;

  -- Lock settings row atomically to prevent duplicate Travel Order Numbers.
  -- Mayor and Vice Mayor share one synced sequence.
  select * into v_settings from public.app_settings where id = 1 for update;

  if not exists (
    select 1
    from public.travel_orders
    where travel_order_number like '%-' || v_year
  ) then
    v_seq := 1;
  else
    v_seq := greatest(v_settings.mayor_next_seq, v_settings.vice_mayor_next_seq);
  end if;

  if v_row.signing_authority = 'MAYOR' then
    v_sig_name := v_settings.mayor_name;
    v_sig_title := v_settings.mayor_title;
  else
    v_sig_name := v_settings.vice_mayor_name;
    v_sig_title := v_settings.vice_mayor_title;
  end if;

  update public.app_settings
  set
    mayor_next_seq = v_seq + 1,
    vice_mayor_next_seq = v_seq + 1,
    updated_at = now()
  where id = 1;

  v_to_number := lpad(v_seq::text, 4, '0') || '-' || v_year;

  update public.travel_orders
  set
    status = 'APPROVED',
    travel_order_number = v_to_number,
    approval_date = now(),
    approved_by = auth.uid(),
    approved_by_email = v_admin.email,
    signatory_name_snapshot = v_sig_name,
    signatory_title_snapshot = v_sig_title,
    remarks = coalesce(nullif(trim(p_remarks), ''), remarks),
    updated_at = now()
  where id = p_order_id
  returning * into v_row;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'APPLICATION_APPROVED',
    v_row.id,
    auth.uid(),
    v_admin.email,
    'Approved ' || v_row.reference_number || ' and generated Travel Order #' || v_to_number ||
      ' (' || v_sig_title || ': ' || v_sig_name || ').'
  );

  return v_row;
end;
$$;

revoke execute on function public.admin_approve_order(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_approve_order(uuid, text) to authenticated;
