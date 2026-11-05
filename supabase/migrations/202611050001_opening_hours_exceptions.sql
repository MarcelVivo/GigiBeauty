-- Abweichende Öffnungszeiten für einzelne Tage (Sonderöffnung oder
-- zusätzlich geschlossen): { "YYYY-MM-DD": ["12:00","18:00"] }, ein Wert
-- null bedeutet an diesem Tag geschlossen. Gilt vor opening_hours und
-- opening_hours_schedule; book_appointment() nutzt opening_hours_on().

alter table public.business_settings
  add column if not exists opening_hours_exceptions jsonb not null default '{}'::jsonb;

create or replace function public.opening_hours_on(day date)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  with base as (
    select coalesce(
      (select entry -> 'hours'
       from public.business_settings bs, jsonb_array_elements(bs.opening_hours_schedule) entry
       where bs.id = true and (entry ->> 'from')::date <= day
       order by (entry ->> 'from')::date desc limit 1),
      (select opening_hours from public.business_settings where id = true)
    ) as hours
  ), ex as (
    select opening_hours_exceptions -> day::text as value,
           opening_hours_exceptions ? day::text as present
    from public.business_settings where id = true
  )
  select case
    when not ex.present then base.hours
    when ex.value is null or jsonb_typeof(ex.value) = 'null' then base.hours - extract(isodow from day)::integer::text
    else base.hours || jsonb_build_object(extract(isodow from day)::integer::text, ex.value)
  end
  from base, ex;
$$;

-- Sonntag, 20. Dezember 2026: Sonderöffnung 12:00–18:00.
update public.business_settings
set opening_hours_exceptions = opening_hours_exceptions || '{"2026-12-20": ["12:00", "18:00"]}'::jsonb
where id = true;
