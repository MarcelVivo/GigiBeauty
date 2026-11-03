-- Geplante Öffnungszeiten mit Startdatum: Online-Buchungen sind bis zu 180
-- Tage im Voraus möglich, deshalb müssen neue Zeiten schon vor dem Stichtag
-- für alle Termine ab diesem Datum gelten. opening_hours bleibt die aktuelle
-- Regel; opening_hours_schedule enthält künftige Änderungen
-- [{ "from": "YYYY-MM-DD", "hours": { "1": ["09:00","17:30"], ... } }]
-- (Schlüssel 1 = Montag … 7 = Sonntag, fehlender Tag = geschlossen).
-- Ein stündlicher Job übernimmt fällige Einträge in opening_hours.

alter table public.business_settings
  add column if not exists opening_hours_schedule jsonb not null default '[]'::jsonb;

update public.business_settings set opening_hours_schedule = '[
  { "from": "2027-01-01", "hours": {
      "1": ["09:00", "17:30"], "2": ["09:00", "19:15"], "3": ["09:00", "13:15"],
      "4": ["09:00", "17:30"], "5": ["09:00", "19:15"], "6": ["09:00", "17:30"] } }
]'::jsonb where id = true;

-- Öffnungszeiten, die an einem bestimmten Tag gelten.
create or replace function public.opening_hours_on(day date)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce(
    (select entry -> 'hours'
     from public.business_settings bs, jsonb_array_elements(bs.opening_hours_schedule) entry
     where bs.id = true and (entry ->> 'from')::date <= day
     order by (entry ->> 'from')::date desc limit 1),
    (select opening_hours from public.business_settings where id = true)
  );
$$;

-- book_appointment(): Buchungszeiten nach dem Tag des Termins prüfen.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.book_appointment'::regproc);
  if position('opening_hours_on' in def) = 0 then
    def := replace(def, 'hours := settings.opening_hours -> weekday;', 'hours := public.opening_hours_on(local_start::date) -> weekday;');
    if position('opening_hours_on' in def) = 0 then raise exception 'book_appointment: Öffnungszeiten-Zeile nicht gefunden'; end if;
    execute def;
  end if;
end $$;

-- Fällige Einträge übernehmen (läuft stündlich, idempotent).
create or replace function public.apply_opening_hours_schedule()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  today date;
  due jsonb;
begin
  select (now() at time zone timezone)::date into today from public.business_settings where id = true;
  select entry into due
  from public.business_settings bs, jsonb_array_elements(bs.opening_hours_schedule) entry
  where bs.id = true and (entry ->> 'from')::date <= today
  order by (entry ->> 'from')::date desc limit 1;
  if due is null then return; end if;
  update public.business_settings set
    opening_hours = due -> 'hours',
    opening_hours_schedule = coalesce((
      select jsonb_agg(entry order by entry ->> 'from')
      from jsonb_array_elements(opening_hours_schedule) entry
      where (entry ->> 'from')::date > today), '[]'::jsonb)
  where id = true;
end;
$$;

revoke execute on function public.apply_opening_hours_schedule() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'apply-opening-hours-schedule';
select cron.schedule('apply-opening-hours-schedule', '7 * * * *', 'select public.apply_opening_hours_schedule()');
