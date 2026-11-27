-- Incremental migration for the private admin notification feed.
-- Move into supabase/migrations/ with a timestamp after the hosted schema baseline.

create or replace function public.broadcast_new_travel_order_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('reference_number', new.reference_number),
    'new_travel_order',
    'admin:new-travel-order-submissions',
    true
  );
  return new;
exception when others then
  raise warning 'Unable to publish a new travel order notification.';
  return new;
end;
$$;

drop trigger if exists travel_order_submission_notification on public.travel_orders;
create trigger travel_order_submission_notification
after insert on public.travel_orders
for each row execute function public.broadcast_new_travel_order_notification();

drop policy if exists "active_admin_receive_travel_order_notifications" on realtime.messages;
create policy "active_admin_receive_travel_order_notifications"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) = 'admin:new-travel-order-submissions'
  and (select public.is_active_admin())
);

revoke execute on function public.broadcast_new_travel_order_notification() from public, anon, authenticated;
