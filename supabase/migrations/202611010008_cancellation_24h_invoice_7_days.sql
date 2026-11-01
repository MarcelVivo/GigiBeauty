-- AGB-Änderung 2026-11-01: kostenlose Stornierung bis 24 Stunden (statt 12)
-- vor Termin, No-Show-/Spätstorno-Rechnungen innert 7 Tagen (statt 14)
-- zahlbar.

update public.business_settings set cancellation_hours = 24 where id = true;
alter table public.business_settings alter column cancellation_hours set default 24;

alter table public.invoices alter column due_at set default (current_date + 7);

-- Fehlermeldung nennt die tatsächlich eingestellte Frist statt fix "12".
create or replace function public.cancel_own_appointment(appointment_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  a public.appointments;
  cancellation_limit integer;
begin
  select * into a from public.appointments where id = appointment_id and customer_id = auth.uid() for update;
  if a.id is null then raise exception 'Termin nicht gefunden.'; end if;
  if a.status <> 'booked' then raise exception 'Dieser Termin kann nicht mehr storniert werden.'; end if;
  select cancellation_hours into cancellation_limit from public.business_settings where id = true;
  if a.starts_at < now() + make_interval(hours => cancellation_limit) then
    raise exception 'Online-Stornierungen sind nur bis % Stunden vor dem Termin möglich. Bitte GiGi Beauty direkt kontaktieren.', cancellation_limit;
  end if;
  update public.appointments set status = 'cancelled', cancelled_at = now() where id = a.id;
end;
$$;
