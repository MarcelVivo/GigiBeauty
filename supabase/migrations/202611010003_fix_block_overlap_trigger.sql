-- "Zeitraum sperren" schlug immer fehl mit: record "new" has no field
-- "status". prevent_cross_calendar_overlap() läuft auch auf blocked_times,
-- und PL/pgSQL wertet new.status in der kombinierten Bedingung
-- (tg_table_name = 'appointments' and new.status = 'booked' ...) trotzdem
-- aus -- blocked_times hat aber keine Spalte status. Lösung: verschachtelte
-- ifs, damit new.status nur für appointments angefasst wird.
create or replace function public.prevent_cross_calendar_overlap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_table_name = 'appointments' then
    if new.status = 'booked' and exists (
      select 1 from public.blocked_times b
      where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception 'Der Zeitraum wurde im Kalender gesperrt.';
    end if;
  elsif tg_table_name = 'blocked_times' then
    if exists (
      select 1 from public.appointments a
      where a.status = 'booked' and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception 'In diesem Zeitraum besteht bereits ein Termin.';
    end if;
  end if;
  return new;
end;
$$;
