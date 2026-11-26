-- ============================================================================
-- Municipality of Anda, Pangasinan — Online Travel Order Management System
-- Supabase PostgreSQL Schema, Row Level Security (RLS), and Atomic RPCs
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. Admin / HR Users (linked to Supabase Auth users; NO public self-registration)
create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'HR_ADMIN' check (role in ('HR_ADMIN', 'SUPER_ADMIN')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Application Settings (signatories & sequential Travel Order numbering)
create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  mayor_name text not null default 'JOGANIE C. RARANG',
  mayor_title text not null default 'Municipal Mayor',
  vice_mayor_name text not null default 'ERWIN C. CATABAY',
  vice_mayor_title text not null default 'Municipal Vice Mayor',
  mayor_next_seq integer not null default 1617 check (mayor_next_seq >= 1),
  vice_mayor_next_seq integer not null default 1551 check (vice_mayor_next_seq >= 1),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

-- 3. Travel Orders
create table if not exists public.travel_orders (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  tracking_token text not null unique,
  travel_order_number text,
  signing_authority text not null check (signing_authority in ('MAYOR', 'VICE_MAYOR')),
  applicant_name text not null,
  position text not null,
  destination text not null,
  departure_date date not null,
  return_date date not null,
  purpose text not null,
  transportation text not null,
  accommodation_type text not null,
  persons_contacted text not null,
  department_head text not null,
  status text not null default 'PENDING_REVIEW' check (
    status in (
      'PENDING_REVIEW',
      'FOR_VERIFICATION',
      'VERIFIED',
      'APPROVED',
      'CORRECTION_REQUESTED',
      'REJECTED'
    )
  ),
  submission_date timestamptz not null default now(),
  review_started_at timestamptz,
  verification_date timestamptz,
  approval_date timestamptz,
  verified_by uuid references auth.users(id),
  verified_by_email text,
  approved_by uuid references auth.users(id),
  approved_by_email text,
  signatory_name_snapshot text,
  signatory_title_snapshot text,
  remarks text,
  print_count integer not null default 0,
  last_printed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint travel_orders_dates_valid check (return_date >= departure_date),
  constraint travel_orders_authority_to_number_unique unique (signing_authority, travel_order_number)
);

-- Ensure separate per-authority Travel Order Number uniqueness if upgrading an existing table
alter table public.travel_orders drop constraint if exists travel_orders_travel_order_number_key;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'travel_orders_authority_to_number_unique'
      and conrelid = 'public.travel_orders'::regclass
  ) then
    alter table public.travel_orders
      add constraint travel_orders_authority_to_number_unique unique (signing_authority, travel_order_number);
  end if;
end $$;

create index if not exists idx_travel_orders_status on public.travel_orders(status);
create index if not exists idx_travel_orders_submission_date on public.travel_orders(submission_date desc);
create index if not exists idx_travel_orders_tracking_token on public.travel_orders(tracking_token);

-- 4. Immutable Audit Logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  travel_order_id uuid references public.travel_orders(id) on delete set null,
  actor_id uuid references auth.users(id),
  actor_label text not null,
  created_at timestamptz not null default now(),
  description text not null
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_order_id on public.audit_logs(travel_order_id);

-- ============================================================================
-- Helper: Check if current authenticated user is an active HR/Admin
-- ============================================================================
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where id = auth.uid()
      and is_active = true
  );
$$;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
alter table public.admin_users enable row level security;
alter table public.app_settings enable row level security;
alter table public.travel_orders enable row level security;
alter table public.audit_logs enable row level security;

-- admin_users: admins can read their own row or all admins; no public write access
drop policy if exists "admin_users_select_admin" on public.admin_users;
create policy "admin_users_select_admin"
on public.admin_users
for select
to authenticated
using (id = auth.uid() or public.is_active_admin());

-- app_settings: public can read signatory names/titles; only active admins can update
drop policy if exists "app_settings_select_all" on public.app_settings;
create policy "app_settings_select_all"
on public.app_settings
for select
to anon, authenticated
using (true);

drop policy if exists "app_settings_update_admin" on public.app_settings;
create policy "app_settings_update_admin"
on public.app_settings
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- travel_orders: ONLY active admins can select/update directly; public uses secure RPCs
drop policy if exists "travel_orders_select_admin" on public.travel_orders;
create policy "travel_orders_select_admin"
on public.travel_orders
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "travel_orders_update_admin" on public.travel_orders;
create policy "travel_orders_update_admin"
on public.travel_orders
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- audit_logs: ONLY active admins can read; immutable (no update/delete policies)
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
on public.audit_logs
for select
to authenticated
using (public.is_active_admin());

-- ============================================================================
-- Secure RPCs
-- ============================================================================

-- A. Public submission (returns reference_number + unguessable tracking_token)
create or replace function public.submit_travel_order(
  p_signing_authority text,
  p_applicant_name text,
  p_position text,
  p_destination text,
  p_departure_date date,
  p_return_date date,
  p_purpose text,
  p_transportation text,
  p_accommodation_type text,
  p_persons_contacted text,
  p_department_head text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_ref text;
  v_token text;
  v_submitted timestamptz;
  v_year text := extract(year from (now() at time zone 'Asia/Manila'))::int::text;
begin
  if p_signing_authority not in ('MAYOR', 'VICE_MAYOR') then
    raise exception 'Invalid signing authority.';
  end if;

  if length(trim(coalesce(p_applicant_name, ''))) = 0
     or length(trim(coalesce(p_position, ''))) = 0
     or length(trim(coalesce(p_destination, ''))) = 0
     or length(trim(coalesce(p_purpose, ''))) = 0
     or length(trim(coalesce(p_transportation, ''))) = 0
     or length(trim(coalesce(p_accommodation_type, ''))) = 0
     or length(trim(coalesce(p_persons_contacted, ''))) = 0
     or length(trim(coalesce(p_department_head, ''))) = 0 then
    raise exception 'All required fields must be completed.';
  end if;

  if length(trim(p_applicant_name)) > 150
     or length(trim(p_position)) > 150
     or length(trim(p_destination)) > 250
     or length(trim(p_purpose)) > 1000
     or length(trim(p_transportation)) > 150
     or length(trim(p_accommodation_type)) > 150
     or length(trim(p_persons_contacted)) > 250
     or length(trim(p_department_head)) > 150 then
    raise exception 'One or more fields exceed the maximum allowed length.';
  end if;

  if p_departure_date is null or p_return_date is null then
    raise exception 'Departure and return dates are required.';
  end if;

  if p_return_date < p_departure_date then
    raise exception 'Expected Date of Return cannot be earlier than Expected Date of Departure.';
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_ref := 'ANDA-' || v_year || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  insert into public.travel_orders (
    reference_number,
    tracking_token,
    signing_authority,
    applicant_name,
    position,
    destination,
    departure_date,
    return_date,
    purpose,
    transportation,
    accommodation_type,
    persons_contacted,
    department_head,
    status
  )
  values (
    v_ref,
    v_token,
    p_signing_authority,
    trim(p_applicant_name),
    trim(p_position),
    trim(p_destination),
    p_departure_date,
    p_return_date,
    trim(p_purpose),
    trim(p_transportation),
    trim(p_accommodation_type),
    trim(p_persons_contacted),
    trim(p_department_head),
    'PENDING_REVIEW'
  )
  returning id, submission_date into v_id, v_submitted;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'APPLICATION_SUBMITTED',
    v_id,
    null,
    trim(p_applicant_name),
    'Application ' || v_ref || ' submitted for ' ||
      case when p_signing_authority = 'MAYOR' then 'Municipal Mayor' else 'Municipal Vice Mayor' end ||
      ' approval.'
  );

  return jsonb_build_object(
    'id', v_id,
    'reference_number', v_ref,
    'tracking_token', v_token,
    'signing_authority', p_signing_authority,
    'submission_date', v_submitted,
    'status', 'PENDING_REVIEW'
  );
end;
$$;

-- B. Private tracking lookup by unguessable tracking_token
create or replace function public.get_travel_order_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.travel_orders%rowtype;
  v_settings public.app_settings%rowtype;
begin
  if length(trim(coalesce(p_token, ''))) < 16 then
    return null;
  end if;

  select * into v_row
  from public.travel_orders
  where tracking_token = trim(p_token);

  if not found then
    return null;
  end if;

  select * into v_settings from public.app_settings where id = 1;

  return jsonb_build_object(
    'id', v_row.id,
    'reference_number', v_row.reference_number,
    'tracking_token', v_row.tracking_token,
    'travel_order_number', case when v_row.status = 'APPROVED' then v_row.travel_order_number else null end,
    'signing_authority', v_row.signing_authority,
    'applicant_name', v_row.applicant_name,
    'position', v_row.position,
    'destination', v_row.destination,
    'departure_date', v_row.departure_date,
    'return_date', v_row.return_date,
    'purpose', v_row.purpose,
    'transportation', v_row.transportation,
    'accommodation_type', v_row.accommodation_type,
    'persons_contacted', v_row.persons_contacted,
    'department_head', v_row.department_head,
    'status', v_row.status,
    'submission_date', v_row.submission_date,
    'review_started_at', v_row.review_started_at,
    'verification_date', v_row.verification_date,
    'approval_date', v_row.approval_date,
    'remarks', v_row.remarks,
    'print_count', v_row.print_count,
    'signatory_name', coalesce(
      v_row.signatory_name_snapshot,
      case when v_row.signing_authority = 'MAYOR' then v_settings.mayor_name else v_settings.vice_mayor_name end
    ),
    'signatory_title', coalesce(
      v_row.signatory_title_snapshot,
      case when v_row.signing_authority = 'MAYOR' then v_settings.mayor_title else v_settings.vice_mayor_title end
    )
  );
end;
$$;

-- B2. Public tracking search by applicant name
create or replace function public.search_travel_orders_by_name(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_query text := left(trim(coalesce(p_name, '')), 120);
  v_escaped text;
  v_results jsonb;
begin
  if length(trim(translate(v_query, '%_\', ''))) < 2 then
    return '[]'::jsonb;
  end if;

  v_escaped := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'reference_number', t.reference_number,
        'tracking_token', t.tracking_token,
        'travel_order_number', case when t.status = 'APPROVED' then t.travel_order_number else null end,
        'signing_authority', t.signing_authority,
        'applicant_name', t.applicant_name,
        'position', t.position,
        'destination', t.destination,
        'departure_date', t.departure_date,
        'return_date', t.return_date,
        'status', t.status,
        'submission_date', t.submission_date
      )
      order by t.submission_date desc
    ),
    '[]'::jsonb
  )
  into v_results
  from (
    select *
    from public.travel_orders
    where applicant_name ilike '%' || v_escaped || '%' escape '\'
    order by submission_date desc
    limit 20
  ) t;

  return v_results;
end;
$$;

-- C. Applicant resubmit after CORRECTION_REQUESTED
create or replace function public.resubmit_corrected_travel_order(
  p_token text,
  p_signing_authority text,
  p_applicant_name text,
  p_position text,
  p_destination text,
  p_departure_date date,
  p_return_date date,
  p_purpose text,
  p_transportation text,
  p_accommodation_type text,
  p_persons_contacted text,
  p_department_head text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.travel_orders%rowtype;
begin
  if length(trim(coalesce(p_token, ''))) < 16 then
    raise exception 'Invalid tracking token.';
  end if;

  if p_signing_authority not in ('MAYOR', 'VICE_MAYOR') then
    raise exception 'Invalid signing authority.';
  end if;

  if length(trim(coalesce(p_applicant_name, ''))) = 0
     or length(trim(coalesce(p_position, ''))) = 0
     or length(trim(coalesce(p_destination, ''))) = 0
     or length(trim(coalesce(p_purpose, ''))) = 0
     or length(trim(coalesce(p_transportation, ''))) = 0
     or length(trim(coalesce(p_accommodation_type, ''))) = 0
     or length(trim(coalesce(p_persons_contacted, ''))) = 0
     or length(trim(coalesce(p_department_head, ''))) = 0 then
    raise exception 'All required fields must be completed.';
  end if;

  if length(trim(p_applicant_name)) > 150
     or length(trim(p_position)) > 150
     or length(trim(p_destination)) > 250
     or length(trim(p_purpose)) > 1000
     or length(trim(p_transportation)) > 150
     or length(trim(p_accommodation_type)) > 150
     or length(trim(p_persons_contacted)) > 250
     or length(trim(p_department_head)) > 150 then
    raise exception 'One or more fields exceed the maximum allowed length.';
  end if;

  if p_departure_date is null or p_return_date is null then
    raise exception 'Departure and return dates are required.';
  end if;

  select * into v_row
  from public.travel_orders
  where tracking_token = trim(coalesce(p_token, ''))
  for update;

  if not found then
    raise exception 'Tracking record not found.';
  end if;

  if v_row.status <> 'CORRECTION_REQUESTED' then
    raise exception 'Only applications marked for correction can be resubmitted.';
  end if;

  if p_return_date < p_departure_date then
    raise exception 'Expected Date of Return cannot be earlier than Expected Date of Departure.';
  end if;

  update public.travel_orders
  set
    signing_authority = p_signing_authority,
    applicant_name = trim(p_applicant_name),
    position = trim(p_position),
    destination = trim(p_destination),
    departure_date = p_departure_date,
    return_date = p_return_date,
    purpose = trim(p_purpose),
    transportation = trim(p_transportation),
    accommodation_type = trim(p_accommodation_type),
    persons_contacted = trim(p_persons_contacted),
    department_head = trim(p_department_head),
    status = 'PENDING_REVIEW',
    remarks = null,
    updated_at = now()
  where id = v_row.id;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'APPLICATION_UPDATED',
    v_row.id,
    null,
    trim(p_applicant_name),
    'Applicant updated and resubmitted ' || v_row.reference_number || ' after correction request.'
  );

  return public.get_travel_order_by_token(p_token);
end;
$$;

-- D. Record Travel Order Print (by approved applicant token OR active admin)
create or replace function public.record_travel_order_print(
  p_order_id uuid,
  p_tracking_token text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.travel_orders%rowtype;
  v_actor text;
  v_actor_id uuid := null;
begin
  select * into v_row
  from public.travel_orders
  where id = p_order_id;

  if not found then
    raise exception 'Travel order not found.';
  end if;

  if v_row.status <> 'APPROVED' then
    raise exception 'Only approved Travel Orders can be printed.';
  end if;

  if public.is_active_admin() then
    select coalesce(email, full_name) into v_actor from public.admin_users where id = auth.uid();
    v_actor_id := auth.uid();
  elsif p_tracking_token is not null and trim(p_tracking_token) = v_row.tracking_token then
    v_actor := v_row.applicant_name || ' (Applicant)';
  else
    raise exception 'Unauthorized print action.';
  end if;

  update public.travel_orders
  set
    print_count = print_count + 1,
    last_printed_at = now(),
    updated_at = now()
  where id = v_row.id;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'TRAVEL_ORDER_PRINTED',
    v_row.id,
    v_actor_id,
    coalesce(v_actor, 'System'),
    'Printed Travel Order #' || coalesce(v_row.travel_order_number, v_row.reference_number)
  );
end;
$$;

-- ============================================================================
-- Admin-Only Workflow RPCs
-- ============================================================================

-- 1. START REVIEW
create or replace function public.admin_start_review(p_order_id uuid, p_remarks text default null)
returns public.travel_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.travel_orders%rowtype;
  v_admin public.admin_users%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'Unauthorized: HR/Admin access required.';
  end if;

  select * into v_admin from public.admin_users where id = auth.uid();
  select * into v_row from public.travel_orders where id = p_order_id for update;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_row.status not in ('PENDING_REVIEW', 'CORRECTION_REQUESTED') then
    raise exception 'Review can only be started for pending applications.';
  end if;

  update public.travel_orders
  set
    status = 'FOR_VERIFICATION',
    review_started_at = coalesce(review_started_at, now()),
    remarks = coalesce(nullif(trim(p_remarks), ''), remarks),
    updated_at = now()
  where id = p_order_id
  returning * into v_row;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'REVIEW_STARTED',
    v_row.id,
    auth.uid(),
    v_admin.email,
    'Started HR/Admin review for ' || v_row.reference_number || '.'
  );

  return v_row;
end;
$$;

-- 2. MARK AS VERIFIED
create or replace function public.admin_verify_order(p_order_id uuid, p_remarks text default null)
returns public.travel_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.travel_orders%rowtype;
  v_admin public.admin_users%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'Unauthorized: HR/Admin access required.';
  end if;

  select * into v_admin from public.admin_users where id = auth.uid();
  select * into v_row from public.travel_orders where id = p_order_id for update;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_row.status not in ('FOR_VERIFICATION', 'PENDING_REVIEW') then
    raise exception 'Only applications under review can be marked as verified.';
  end if;

  update public.travel_orders
  set
    status = 'VERIFIED',
    review_started_at = coalesce(review_started_at, now()),
    verification_date = now(),
    verified_by = auth.uid(),
    verified_by_email = v_admin.email,
    remarks = nullif(trim(p_remarks), ''),
    updated_at = now()
  where id = p_order_id
  returning * into v_row;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'APPLICATION_VERIFIED',
    v_row.id,
    auth.uid(),
    v_admin.email,
    'Verified travel details for ' || v_row.reference_number ||
      case when length(trim(coalesce(p_remarks, ''))) > 0 then ' — Remarks: ' || trim(p_remarks) else '.' end
  );

  return v_row;
end;
$$;

-- 3. APPROVE (requires VERIFIED; atomically generates SEQUENCE-YEAR per authority)
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
  v_year text := extract(year from now())::int::text;
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

  -- Lock settings row atomically to prevent duplicate Travel Order Numbers
  -- Mayor and Vice Mayor share one synced Travel Order sequence
  select * into v_settings from public.app_settings where id = 1 for update;

  v_seq := greatest(v_settings.mayor_next_seq, v_settings.vice_mayor_next_seq);

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

-- 4. REQUEST CORRECTION
create or replace function public.admin_request_correction(p_order_id uuid, p_remarks text)
returns public.travel_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.travel_orders%rowtype;
  v_admin public.admin_users%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'Unauthorized: HR/Admin access required.';
  end if;

  if length(trim(coalesce(p_remarks, ''))) = 0 then
    raise exception 'Remarks explaining what needs to be corrected are required.';
  end if;

  select * into v_admin from public.admin_users where id = auth.uid();
  select * into v_row from public.travel_orders where id = p_order_id for update;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_row.status in ('APPROVED', 'REJECTED') then
    raise exception 'Approved or rejected applications cannot be sent for correction.';
  end if;

  update public.travel_orders
  set
    status = 'CORRECTION_REQUESTED',
    remarks = trim(p_remarks),
    updated_at = now()
  where id = p_order_id
  returning * into v_row;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'CORRECTION_REQUESTED',
    v_row.id,
    auth.uid(),
    v_admin.email,
    'Requested correction for ' || v_row.reference_number || ': ' || trim(p_remarks)
  );

  return v_row;
end;
$$;

-- 5. REJECT (requires reason; never assigns Travel Order number)
create or replace function public.admin_reject_order(p_order_id uuid, p_remarks text)
returns public.travel_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.travel_orders%rowtype;
  v_admin public.admin_users%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'Unauthorized: HR/Admin access required.';
  end if;

  if length(trim(coalesce(p_remarks, ''))) = 0 then
    raise exception 'Rejection reason is required.';
  end if;

  select * into v_admin from public.admin_users where id = auth.uid();
  select * into v_row from public.travel_orders where id = p_order_id for update;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_row.status = 'APPROVED' then
    raise exception 'Approved Travel Orders cannot be rejected.';
  end if;

  update public.travel_orders
  set
    status = 'REJECTED',
    travel_order_number = null,
    remarks = trim(p_remarks),
    updated_at = now()
  where id = p_order_id
  returning * into v_row;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'APPLICATION_REJECTED',
    v_row.id,
    auth.uid(),
    v_admin.email,
    'Rejected ' || v_row.reference_number || ' — Reason: ' || trim(p_remarks)
  );

  return v_row;
end;
$$;

-- 6. Admin Update Settings (Signatories & Numbering Sequences)
create or replace function public.admin_update_settings(
  p_mayor_name text,
  p_mayor_title text,
  p_vice_mayor_name text,
  p_vice_mayor_title text,
  p_mayor_next_seq integer,
  p_vice_mayor_next_seq integer
)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admin_users%rowtype;
  v_settings public.app_settings%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'Unauthorized: HR/Admin access required.';
  end if;

  if p_mayor_next_seq < 1 or p_vice_mayor_next_seq < 1 then
    raise exception 'Sequence numbers must be at least 1.';
  end if;

  select * into v_admin from public.admin_users where id = auth.uid();

  update public.app_settings
  set
    mayor_name = trim(p_mayor_name),
    mayor_title = trim(p_mayor_title),
    vice_mayor_name = trim(p_vice_mayor_name),
    vice_mayor_title = trim(p_vice_mayor_title),
    mayor_next_seq = p_mayor_next_seq,
    vice_mayor_next_seq = p_mayor_next_seq,
    updated_at = now()
  where id = 1
  returning * into v_settings;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'SETTINGS_UPDATED',
    null,
    auth.uid(),
    v_admin.email,
    'Updated signatory/numbering settings (Mayor Seq: ' || p_mayor_next_seq || ', Vice Mayor Seq: ' || p_vice_mayor_next_seq || ').'
  );

  return v_settings;
end;
$$;

-- ============================================================================
-- Table Grants (RLS enforces row-level access on all tables)
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;

grant select on public.admin_users to authenticated;
grant select on public.travel_orders to authenticated;
grant select on public.audit_logs to authenticated;

-- ============================================================================
-- Function Execute Grants
-- ============================================================================
grant execute on function public.submit_travel_order(text,text,text,text,date,date,text,text,text,text,text) to anon, authenticated;
grant execute on function public.get_travel_order_by_token(text) to anon, authenticated;
grant execute on function public.search_travel_orders_by_name(text) to anon, authenticated;
grant execute on function public.resubmit_corrected_travel_order(text,text,text,text,text,date,date,text,text,text,text,text) to anon, authenticated;
grant execute on function public.record_travel_order_print(uuid,text) to anon, authenticated;

grant execute on function public.admin_start_review(uuid,text) to authenticated;
grant execute on function public.admin_verify_order(uuid,text) to authenticated;
grant execute on function public.admin_approve_order(uuid,text) to authenticated;
grant execute on function public.admin_request_correction(uuid,text) to authenticated;
grant execute on function public.admin_reject_order(uuid,text) to authenticated;
grant execute on function public.admin_update_settings(text,text,text,text,integer,integer) to authenticated;
