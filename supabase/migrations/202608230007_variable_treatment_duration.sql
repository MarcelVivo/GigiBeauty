-- Manche Behandlungen dauern nicht die pauschalen 90 Minuten (z. B. einzelne
-- Permanent-Make-up-Positionen brauchen bis zu 3 Stunden). Die Dauer hängt an
-- der einzelnen Preisposition, nicht an der Behandlungskategorie, da sich
-- Positionen innerhalb derselben Kategorie stark unterscheiden können.

-- services.duration_minutes diente bisher nur als Startwert für die feste
-- 90-Minuten-Regel; jetzt ist es der Fallback, falls eine Position keine
-- eigene Dauer hat. Der alte "= 90"-Zwang wird gelockert.
do $$
declare
  fixed_service_duration_constraint text;
begin
  select conname into fixed_service_duration_constraint
  from pg_constraint
  where conrelid = 'public.services'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%duration_minutes%90%';

  if fixed_service_duration_constraint is not null then
    execute format('alter table public.services drop constraint %I', fixed_service_duration_constraint);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.services'::regclass and conname = 'services_duration_minutes_check'
  ) then
    alter table public.services
      add constraint services_duration_minutes_check check (duration_minutes > 0);
  end if;
end $$;

alter table public.service_price_items
  add column if not exists duration_minutes integer
  check (duration_minutes is null or duration_minutes > 0);

comment on column public.service_price_items.duration_minutes is
  'Eigene Termin-Dauer in Minuten für diese Position. NULL = Dauer der Behandlungskategorie (services.duration_minutes) gilt.';

-- Termine merken sich künftig, für welche genaue Position sie gebucht
-- wurden, damit die richtige Dauer und der richtige Preis ermittelt werden
-- können (appointments.service_id kennt bisher nur die grobe Kategorie).
alter table public.appointments
  add column if not exists price_item_id uuid references public.service_price_items(id) on delete set null;

create index if not exists appointments_price_item_idx on public.appointments(price_item_id);

-- Permanent-Make-up-Positionen erhalten vorerst pauschal 3 Stunden als
-- Startwert. Die genaue Dauer pro Position lässt sich im Dashboard
-- ("Website-Inhalte") jederzeit feiner anpassen.
update public.service_price_items
set duration_minutes = 180
where service_id = (select id from public.services where slug = 'permanent-make-up')
  and duration_minutes is null;

-- book_appointment() bekommt einen neuen, optionalen Parameter für die
-- gewählte Position; die alte 4-Parameter-Signatur wird ersetzt.
drop function if exists public.book_appointment(uuid, timestamptz, text, text);

create or replace function public.book_appointment(
  requested_service_id uuid,
  requested_start timestamptz,
  requested_phone text default null,
  requested_notes text default null,
  requested_price_item_id uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles;
  s public.services;
  pi public.service_price_items;
  settings public.business_settings;
  treatment_minutes integer;
  requested_end timestamptz;
  local_start timestamp;
  local_end timestamp;
  weekday text;
  hours jsonb;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Profil nicht gefunden.'; end if;
  select * into s from public.services where id = requested_service_id and active;
  if s.id is null then raise exception 'Behandlung nicht verfügbar.'; end if;

  treatment_minutes := s.duration_minutes;
  if requested_price_item_id is not null then
    select * into pi from public.service_price_items
      where id = requested_price_item_id and service_id = s.id and active;
    if pi.id is null then raise exception 'Ausgewählte Position nicht verfügbar.'; end if;
    treatment_minutes := coalesce(pi.duration_minutes, s.duration_minutes);
  end if;

  requested_end := requested_start + make_interval(mins => treatment_minutes);

  select * into settings from public.business_settings where id = true;
  if requested_start <= now() then raise exception 'Der Termin muss in der Zukunft liegen.'; end if;

  local_start := requested_start at time zone settings.timezone;
  local_end := requested_end at time zone settings.timezone;
  weekday := extract(isodow from local_start)::integer::text;
  hours := settings.opening_hours -> weekday;
  if hours is null
     or local_start::date <> local_end::date
     or local_start::time < (hours ->> 0)::time
     or local_end::time > (hours ->> 1)::time
     or mod(extract(epoch from (local_start::time - (hours ->> 0)::time))::integer, settings.slot_minutes * 60) <> 0
  then
    raise exception 'Dieser Termin liegt ausserhalb der Buchungszeiten.';
  end if;

  perform pg_advisory_xact_lock(hashtext(requested_start::text));
  if exists (
    select 1 from public.appointments
    where status = 'booked' and tstzrange(starts_at, ends_at, '[)') && tstzrange(requested_start, requested_end, '[)')
  ) or exists (
    select 1 from public.blocked_times
    where tstzrange(starts_at, ends_at, '[)') && tstzrange(requested_start, requested_end, '[)')
  ) then
    raise exception 'Dieser Termin ist bereits vergeben.';
  end if;

  insert into public.appointments (
    customer_id, service_id, price_item_id, customer_name, customer_email, customer_phone,
    starts_at, ends_at, created_by, notes
  ) values (
    p.id, s.id, requested_price_item_id, p.full_name, p.email, coalesce(nullif(trim(requested_phone), ''), p.phone),
    requested_start, requested_end, p.id, nullif(trim(requested_notes), '')
  ) returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.book_appointment(uuid, timestamptz, text, text, uuid) to authenticated;
