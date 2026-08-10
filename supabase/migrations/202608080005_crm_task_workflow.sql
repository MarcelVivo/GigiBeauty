-- GiGi Beauty: eindeutiger Smart-CRM-Aufgabenworkflow.
-- Nach 202608080004_customer_registration_invites.sql ausführen.

alter table public.crm_tasks
  add column if not exists snoozed_until timestamptz,
  add column if not exists snooze_note text,
  add column if not exists dismissed_reason text;

create or replace function public.snooze_crm_task(
  requested_task_id uuid,
  requested_until timestamptz,
  requested_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  if requested_until <= now() then raise exception 'Der Erinnerungszeitpunkt muss in der Zukunft liegen.'; end if;
  update public.crm_tasks set
    status = 'open',
    due_at = requested_until,
    snoozed_until = requested_until,
    snooze_note = nullif(trim(requested_note), ''),
    completed_at = null,
    completed_by = null
  where id = requested_task_id;
  if not found then raise exception 'Aufgabe nicht gefunden.'; end if;
end;
$$;

create or replace function public.dismiss_crm_task(
  requested_task_id uuid,
  requested_reason text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  if nullif(trim(requested_reason), '') is null then raise exception 'Bitte eine Begründung angeben.'; end if;
  update public.crm_tasks set
    status = 'dismissed',
    dismissed_reason = trim(requested_reason),
    completed_at = now(),
    completed_by = auth.uid(),
    snoozed_until = null
  where id = requested_task_id;
  if not found then raise exception 'Aufgabe nicht gefunden.'; end if;
end;
$$;

create or replace function public.complete_crm_task(requested_task_id uuid, requested_status text default 'done')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  if requested_status <> 'done' then raise exception 'Für nicht relevante Aufgaben bitte eine Begründung erfassen.'; end if;
  update public.crm_tasks set
    status = 'done', completed_at = now(), completed_by = auth.uid(),
    snoozed_until = null, dismissed_reason = null
  where id = requested_task_id;
  if not found then raise exception 'Aufgabe nicht gefunden.'; end if;
end;
$$;

grant execute on function public.snooze_crm_task(uuid, timestamptz, text) to authenticated;
grant execute on function public.dismiss_crm_task(uuid, text) to authenticated;

