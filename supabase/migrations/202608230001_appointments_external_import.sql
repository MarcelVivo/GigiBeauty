-- Erlaubt den Import historischer Treatwell-Termine mit echter Dauer
-- (60/75/90 Min. usw.) statt der starren 90-Minuten-Onlinebuchung, und
-- macht Termine über eine externe Referenz (Treatwell-UID) idempotent
-- importierbar (Upsert statt Dubletten bei jedem erneuten Export).

-- The original constraint was declared unnamed at table-creation time, so
-- Postgres auto-assigned it a name (appointments_check or similar). Find and
-- drop it by its definition instead of guessing that name.
do $$
declare
  fixed_duration_constraint text;
begin
  select conname into fixed_duration_constraint
  from pg_constraint
  where conrelid = 'public.appointments'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%ends_at%90 minutes%';

  if fixed_duration_constraint is not null then
    execute format('alter table public.appointments drop constraint %I', fixed_duration_constraint);
  end if;
end $$;

alter table public.appointments
  add constraint appointments_duration_check
  check (ends_at > starts_at and ends_at <= starts_at + interval '4 hours');

alter table public.appointments
  add column if not exists external_reference text unique;

comment on column public.appointments.external_reference is
  'Externe Terminreferenz (z. B. Treatwell-UID) für idempotenten Import. NULL für online gebuchte Termine.';
