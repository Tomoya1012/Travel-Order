SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE TABLE "public"."admin_users" (
  "id"         uuid                     NOT NULL,
  "email"      text                     NOT NULL,
  "full_name"  text                     NOT NULL,
  "role"       text                     NOT NULL DEFAULT 'HR_ADMIN'::text,
  "is_active"  boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_users_email_key" UNIQUE (email),
  CONSTRAINT "admin_users_pkey" PRIMARY KEY (id),
  CONSTRAINT "admin_users_role_check" CHECK ((role = ANY (ARRAY['HR_ADMIN'::text, 'SUPER_ADMIN'::text])))
);

ALTER TABLE "public"."admin_users"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."app_settings" (
  "id"                  integer                  NOT NULL DEFAULT 1,
  "mayor_name"          text                     NOT NULL DEFAULT 'JOGANIE C. RARANG'::text,
  "mayor_title"         text                     NOT NULL DEFAULT 'Municipal Mayor'::text,
  "vice_mayor_name"     text                     NOT NULL DEFAULT 'ERWIN C. CATABAY'::text,
  "vice_mayor_title"    text                     NOT NULL DEFAULT 'Municipal Vice Mayor'::text,
  "mayor_next_seq"      integer                  NOT NULL DEFAULT 1617,
  "vice_mayor_next_seq" integer                  NOT NULL DEFAULT 1551,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "app_settings_id_check" CHECK ((id = 1)),
  CONSTRAINT "app_settings_mayor_next_seq_check" CHECK ((mayor_next_seq >= 1)),
  CONSTRAINT "app_settings_pkey" PRIMARY KEY (id),
  CONSTRAINT "app_settings_vice_mayor_next_seq_check" CHECK ((vice_mayor_next_seq >= 1))
);

ALTER TABLE "public"."app_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."audit_logs" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "action"          text                     NOT NULL,
  "travel_order_id" uuid,
  "actor_id"        uuid,
  "actor_label"     text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "description"     text                     NOT NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."audit_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."travel_orders" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reference_number"         text                     NOT NULL,
  "tracking_token"           text                     NOT NULL,
  "travel_order_number"      text,
  "signing_authority"        text                     NOT NULL,
  "applicant_name"           text                     NOT NULL,
  "position"                 text                     NOT NULL,
  "destination"              text                     NOT NULL,
  "departure_date"           date                     NOT NULL,
  "return_date"              date                     NOT NULL,
  "purpose"                  text                     NOT NULL,
  "transportation"           text                     NOT NULL,
  "accommodation_type"       text                     NOT NULL,
  "persons_contacted"        text                     NOT NULL,
  "department_head"          text                     NOT NULL,
  "status"                   text                     NOT NULL DEFAULT 'PENDING_REVIEW'::text,
  "submission_date"          timestamp with time zone NOT NULL DEFAULT now(),
  "review_started_at"        timestamp with time zone,
  "verification_date"        timestamp with time zone,
  "approval_date"            timestamp with time zone,
  "verified_by"              uuid,
  "verified_by_email"        text,
  "approved_by"              uuid,
  "approved_by_email"        text,
  "signatory_name_snapshot"  text,
  "signatory_title_snapshot" text,
  "remarks"                  text,
  "print_count"              integer                  NOT NULL DEFAULT 0,
  "last_printed_at"          timestamp with time zone,
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "travel_orders_authority_to_number_unique" UNIQUE (signing_authority, travel_order_number),
  CONSTRAINT "travel_orders_dates_valid" CHECK ((return_date >= departure_date)),
  CONSTRAINT "travel_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "travel_orders_reference_number_key" UNIQUE (reference_number),
  CONSTRAINT "travel_orders_signing_authority_check" CHECK ((signing_authority = ANY (ARRAY['MAYOR'::text, 'VICE_MAYOR'::text]))),
  CONSTRAINT "travel_orders_status_check"
    CHECK ((status = ANY (ARRAY['PENDING_REVIEW'::text, 'FOR_VERIFICATION'::text, 'VERIFIED'::text, 'APPROVED'::text, 'CORRECTION_REQUESTED'::text, 'REJECTED'::text]))),
  CONSTRAINT "travel_orders_tracking_token_key" UNIQUE (tracking_token)
);

ALTER TABLE "public"."travel_orders"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_approve_order (
  p_order_id uuid,
  p_remarks  text DEFAULT NULL::text
)
  RETURNS public.travel_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."admin_approve_order"(uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.admin_reject_order (
  p_order_id uuid,
  p_remarks  text
)
  RETURNS public.travel_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."admin_reject_order"(uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.admin_request_correction (
  p_order_id uuid,
  p_remarks  text
)
  RETURNS public.travel_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."admin_request_correction"(uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.admin_start_review (
  p_order_id uuid,
  p_remarks  text DEFAULT NULL::text
)
  RETURNS public.travel_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."admin_start_review"(uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.admin_update_settings (
  p_mayor_name          text,
  p_mayor_title         text,
  p_vice_mayor_name     text,
  p_vice_mayor_title    text,
  p_mayor_next_seq      integer,
  p_vice_mayor_next_seq integer
)
  RETURNS public.app_settings
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."admin_update_settings"(text, text, text, text, integer, integer) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.admin_verify_order (
  p_order_id uuid,
  p_remarks  text DEFAULT NULL::text
)
  RETURNS public.travel_orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."admin_verify_order"(uuid, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_approved_travel_order_for_name_print (
  p_reference_number text,
  p_applicant_name   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_order public.travel_orders%rowtype;
  v_settings public.app_settings%rowtype;
begin
  if length(trim(coalesce(p_reference_number, ''))) = 0
     or length(trim(p_reference_number)) > 50 then
    raise exception 'A valid application reference is required.';
  end if;

  if length(trim(coalesce(p_applicant_name, ''))) = 0
     or length(trim(p_applicant_name)) > 150 then
    raise exception 'A valid applicant name is required.';
  end if;

  select * into v_order
  from public.travel_orders
  where reference_number = trim(p_reference_number)
    and lower(trim(applicant_name)) = lower(trim(p_applicant_name))
    and status = 'APPROVED'
  for update;

  if not found then
    raise exception 'Approved Travel Order not found for the provided name and reference.';
  end if;

  select * into v_settings from public.app_settings where id = 1;

  update public.travel_orders
  set
    print_count = print_count + 1,
    last_printed_at = now(),
    updated_at = now()
  where id = v_order.id;

  insert into public.audit_logs (action, travel_order_id, actor_id, actor_label, description)
  values (
    'TRAVEL_ORDER_PRINTED',
    v_order.id,
    null,
    v_order.applicant_name || ' (Name search)',
    'Printed approved Travel Order #' || v_order.travel_order_number || ' from name search.'
  );

  return jsonb_build_object(
    'travel_order_number', v_order.travel_order_number,
    'order_date', coalesce(v_order.approval_date, v_order.submission_date),
    'signing_authority', v_order.signing_authority,
    'signatory_name', coalesce(
      v_order.signatory_name_snapshot,
      case when v_order.signing_authority = 'MAYOR' then v_settings.mayor_name else v_settings.vice_mayor_name end
    ),
    'signatory_title', coalesce(
      v_order.signatory_title_snapshot,
      case when v_order.signing_authority = 'MAYOR' then v_settings.mayor_title else v_settings.vice_mayor_title end
    ),
    'applicant_name', v_order.applicant_name,
    'position', v_order.position,
    'destination', v_order.destination,
    'departure_date', v_order.departure_date,
    'return_date', v_order.return_date,
    'purpose', v_order.purpose,
    'transportation', v_order.transportation,
    'accommodation_type', v_order.accommodation_type,
    'persons_contacted', v_order.persons_contacted,
    'department_head', v_order.department_head,
    'reference_number', v_order.reference_number
  );
end;
$function$;

REVOKE ALL ON FUNCTION "public"."get_approved_travel_order_for_name_print"(text, text) FROM PUBLIC, "service_role";

CREATE OR REPLACE FUNCTION public.get_travel_order_by_token (
  p_token text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."get_travel_order_by_token"(text) FROM PUBLIC, "service_role";

CREATE OR REPLACE FUNCTION public.is_active_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.admin_users
    where id = auth.uid()
      and is_active = true
  );
$function$;

REVOKE ALL ON FUNCTION "public"."is_active_admin"() FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.record_travel_order_print (
  p_order_id       uuid,
  p_tracking_token text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."record_travel_order_print"(uuid, text) FROM PUBLIC, "service_role";

CREATE OR REPLACE FUNCTION public.resubmit_corrected_travel_order (
  p_token              text,
  p_signing_authority  text,
  p_applicant_name     text,
  p_position           text,
  p_destination        text,
  p_departure_date     date,
  p_return_date        date,
  p_purpose            text,
  p_transportation     text,
  p_accommodation_type text,
  p_persons_contacted  text,
  p_department_head    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."resubmit_corrected_travel_order"(text, text, text, text, text, date, date, text, text, text, text, text) FROM PUBLIC, "service_role";

CREATE OR REPLACE FUNCTION public.search_travel_orders_by_name (
  p_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
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
        'reference_number', t.reference_number,
        'applicant_name', t.applicant_name,
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
$function$;

REVOKE ALL ON FUNCTION "public"."search_travel_orders_by_name"(text) FROM PUBLIC, "service_role";

CREATE OR REPLACE FUNCTION public.submit_travel_order (
  p_signing_authority  text,
  p_applicant_name     text,
  p_position           text,
  p_destination        text,
  p_departure_date     date,
  p_return_date        date,
  p_purpose            text,
  p_transportation     text,
  p_accommodation_type text,
  p_persons_contacted  text,
  p_department_head    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."submit_travel_order"(text, text, text, text, date, date, text, text, text, text, text) FROM PUBLIC, "service_role";

ALTER TABLE "public"."admin_users"
  ADD CONSTRAINT "admin_users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."audit_logs"
  ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE "public"."travel_orders"
  ADD CONSTRAINT "travel_orders_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE "public"."audit_logs"
  ADD CONSTRAINT "audit_logs_travel_order_id_fkey" FOREIGN KEY (travel_order_id) REFERENCES public.travel_orders(id) ON DELETE SET NULL;

ALTER TABLE "public"."travel_orders"
  ADD CONSTRAINT "travel_orders_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES auth.users(id);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_order_id ON public.audit_logs USING btree (travel_order_id);

CREATE INDEX idx_travel_orders_status ON public.travel_orders USING btree (status);

CREATE INDEX idx_travel_orders_submission_date ON public.travel_orders USING btree (submission_date DESC);

CREATE INDEX idx_travel_orders_tracking_token ON public.travel_orders USING btree (tracking_token);

CREATE POLICY "admin_users_select_admin" ON "public"."admin_users"
  FOR SELECT
  TO "authenticated"
  USING (((id = auth.uid()) OR public.is_active_admin()));

CREATE POLICY "app_settings_select_all" ON "public"."app_settings"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

CREATE POLICY "app_settings_update_admin" ON "public"."app_settings"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "audit_logs_select_admin" ON "public"."audit_logs"
  FOR SELECT
  TO "authenticated"
  USING (public.is_active_admin());

CREATE POLICY "travel_orders_select_admin" ON "public"."travel_orders"
  FOR SELECT
  TO "authenticated"
  USING (public.is_active_admin());

CREATE POLICY "travel_orders_update_admin" ON "public"."travel_orders"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

GRANT EXECUTE ON FUNCTION "public"."admin_approve_order"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_approve_order"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_approve_order"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_reject_order"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_reject_order"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_reject_order"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_request_correction"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_request_correction"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_request_correction"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_start_review"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_start_review"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_start_review"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_update_settings"(text, text, text, text, integer, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_update_settings"(text, text, text, text, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_update_settings"(text, text, text, text, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_verify_order"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_verify_order"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_verify_order"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_approved_travel_order_for_name_print"(text, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_approved_travel_order_for_name_print"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_approved_travel_order_for_name_print"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_travel_order_by_token"(text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_travel_order_by_token"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_travel_order_by_token"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_active_admin"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."is_active_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_active_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_travel_order_print"(uuid, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."record_travel_order_print"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_travel_order_print"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."resubmit_corrected_travel_order"(text, text, text, text, text, date, date, text, text, text, text, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."resubmit_corrected_travel_order"(text, text, text, text, text, date, date, text, text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resubmit_corrected_travel_order"(text, text, text, text, text, date, date, text, text, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_travel_orders_by_name"(text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."search_travel_orders_by_name"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_travel_orders_by_name"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_travel_order"(text, text, text, text, date, date, text, text, text, text, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."submit_travel_order"(text, text, text, text, date, date, text, text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_travel_order"(text, text, text, text, date, date, text, text, text, text, text) TO "postgres";

REVOKE ALL ON TABLE "public"."admin_users" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."admin_users" TO "anon";

REVOKE ALL ON TABLE "public"."admin_users" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."admin_users" TO "authenticated";

REVOKE ALL ON TABLE "public"."admin_users" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_users" TO "postgres";

REVOKE ALL ON TABLE "public"."admin_users" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."admin_users" TO "service_role";

REVOKE ALL ON TABLE "public"."app_settings" FROM "anon";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."app_settings" TO "anon";

REVOKE ALL ON TABLE "public"."app_settings" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_settings" TO "authenticated";

REVOKE ALL ON TABLE "public"."app_settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_settings" TO "postgres";

REVOKE ALL ON TABLE "public"."app_settings" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."app_settings" TO "service_role";

REVOKE ALL ON TABLE "public"."audit_logs" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."audit_logs" TO "anon";

REVOKE ALL ON TABLE "public"."audit_logs" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."audit_logs" TO "authenticated";

REVOKE ALL ON TABLE "public"."audit_logs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_logs" TO "postgres";

REVOKE ALL ON TABLE "public"."audit_logs" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."audit_logs" TO "service_role";

REVOKE ALL ON TABLE "public"."travel_orders" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."travel_orders" TO "anon";

REVOKE ALL ON TABLE "public"."travel_orders" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."travel_orders" TO "authenticated";

REVOKE ALL ON TABLE "public"."travel_orders" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."travel_orders" TO "postgres";

REVOKE ALL ON TABLE "public"."travel_orders" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."travel_orders" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

