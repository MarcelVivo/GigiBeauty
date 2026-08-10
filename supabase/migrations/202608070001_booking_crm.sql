-- GiGi Beauty: booking, CRM, ERP and marketing foundation
-- Run with `supabase db push` or paste once into the Supabase SQL editor.

create extension if not exists btree_gist;

create type public.user_role as enum ('customer', 'admin');
create type public.appointment_status as enum ('booked', 'completed', 'cancelled', 'no_show');
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');
create type public.campaign_status as enum ('draft', 'scheduled', 'sent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) >= 2),
  email text not null,
  phone text,
  role public.user_role not null default 'customer',
  marketing_consent boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  duration_minutes integer not null default 90 check (duration_minutes = 90),
  price_chf numeric(10,2) check (price_chf is null or price_chf >= 0),
  image_path text,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.business_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'Europe/Zurich',
  slot_minutes integer not null default 90 check (slot_minutes = 90),
  cancellation_hours integer not null default 12 check (cancellation_hours >= 0),
  reminder_hours integer not null default 4 check (reminder_hours >= 1),
  admin_email text not null default 'info@gigibeauty.ch',
  opening_hours jsonb not null default '{"1":["09:00","20:30"],"2":["09:00","20:30"],"3":["09:00","20:30"],"4":["09:00","20:30"],"5":["09:00","20:30"],"6":["09:00","18:00"]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  service_id uuid references public.services(id) on delete restrict,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'booked',
  is_private boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at = starts_at + interval '90 minutes'),
  check (not is_private or customer_id is null)
);

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'booked');

create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default 'Nicht verfügbar',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.blocked_times
  add constraint blocked_times_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint generated always as identity unique,
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_email text,
  amount_chf numeric(10,2) not null check (amount_chf >= 0),
  reason text not null,
  status public.invoice_status not null default 'draft',
  due_at date not null default (current_date + 14),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  content text not null,
  audience text not null default 'marketing_consent',
  status public.campaign_status not null default 'draft',
  scheduled_at timestamptz,
  queued_at timestamptz,
  sent_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('confirmation', 'reminder', 'cancellation', 'rescheduled', 'invoice', 'campaign')),
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  processing_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  email text not null unique,
  phone text,
  notes text,
  gender text,
  language text,
  birth_date date,
  source text not null default 'Website',
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_starts_at_idx on public.appointments(starts_at);
create index appointments_customer_idx on public.appointments(customer_id);
create index blocked_times_range_idx on public.blocked_times(starts_at, ends_at);
create index email_outbox_pending_idx on public.email_outbox(scheduled_for) where processed_at is null;

insert into public.services (slug, name, description, price_chf, image_path, sort_order) values
  ('gel-acryl-nails', 'Gel & Acryl Nails', 'Gel- und Acryl-Nagelbehandlung', 90, '/public/images/services/Gel&AcrylNails.png', 1),
  ('permanent-make-up', 'Permanent Make Up', 'Permanent Make-up Behandlung', 400, '/public/images/services/PermanentMakeUp.png', 2),
  ('fillers', 'Fillers', 'Beratung und Filler-Behandlung', 50, '/public/images/services/Filler.png', 3),
  ('lashes', 'Lashes', 'Wimpernverlängerung und Lash Styling', 90, '/public/images/services/Lashes.png', 4),
  ('kosmetische-pedicure', 'Kosmetische Pedicure', 'Professionelle kosmetische Pedicure', 90, '/public/images/services/KosmetischePedicure.png', 5),
  ('korean-cosmetics', 'Korean Cosmetics', 'Koreanische Gesichtsbehandlung', 140, '/public/images/services/KoreanCosmetics.png', 6),
  ('natural-make-up', 'Natural Make Up', 'Natürliches Make-up für jeden Anlass', 100, '/public/images/services/NaturalMakeUp.png', 7)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_chf = excluded.price_chf,
  image_path = excluded.image_path,
  sort_order = excluded.sort_order;

insert into public.business_settings (id) values (true) on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.marketing_campaigns
for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();

create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
     and (new.role is distinct from old.role or new.email is distinct from old.email) then
    raise exception 'Rolle und Login-E-Mail können nicht selbst geändert werden.';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_identity
before update on public.profiles
for each row execute function public.protect_profile_identity();

create or replace function public.sync_profile_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role = 'customer' then
    insert into public.customers(profile_id, full_name, email, phone, marketing_consent)
    values(new.id, new.full_name, lower(new.email), new.phone, new.marketing_consent)
    on conflict (email) do update set
      profile_id = excluded.profile_id,
      full_name = excluded.full_name,
      phone = coalesce(excluded.phone, customers.phone),
      marketing_consent = excluded.marketing_consent;
  end if;
  return new;
end;
$$;

create trigger profile_syncs_customer
after insert or update of full_name, email, phone, marketing_consent, role on public.profiles
for each row execute function public.sync_profile_customer();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, marketing_consent)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.get_unavailable_slots(range_start timestamptz, range_end timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, source text)
language sql
stable
security definer set search_path = public
as $$
  select a.starts_at, a.ends_at, 'appointment'::text
  from public.appointments a
  where a.status = 'booked' and a.starts_at < range_end and a.ends_at > range_start
  union all
  select b.starts_at, b.ends_at, 'blocked'::text
  from public.blocked_times b
  where b.starts_at < range_end and b.ends_at > range_start;
$$;

create or replace function public.book_appointment(
  requested_service_id uuid,
  requested_start timestamptz,
  requested_phone text default null,
  requested_notes text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  p public.profiles;
  s public.services;
  settings public.business_settings;
  requested_end timestamptz := requested_start + interval '90 minutes';
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
    customer_id, service_id, customer_name, customer_email, customer_phone,
    starts_at, ends_at, created_by, notes
  ) values (
    p.id, s.id, p.full_name, p.email, coalesce(nullif(trim(requested_phone), ''), p.phone),
    requested_start, requested_end, p.id, nullif(trim(requested_notes), '')
  ) returning id into new_id;
  return new_id;
end;
$$;

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
    raise exception 'Online-Stornierungen sind nur bis 12 Stunden vor dem Termin möglich. Bitte GiGi Beauty direkt kontaktieren.';
  end if;
  update public.appointments set status = 'cancelled', cancelled_at = now() where id = a.id;
end;
$$;

create or replace function public.queue_appointment_emails()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  service_name text;
  reminder_hours integer;
begin
  select name into service_name from public.services where id = new.service_id;
  select bs.reminder_hours into reminder_hours from public.business_settings bs where id = true;

  if tg_op = 'INSERT' and not new.is_private and new.customer_email is not null then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values ('confirmation', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty ist bestätigt',
      jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at));
    if new.starts_at - make_interval(hours => reminder_hours) > now() then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values ('reminder', new.customer_email, new.customer_name, 'Erinnerung: Dein Termin bei GiGi Beauty',
        jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at),
        new.starts_at - make_interval(hours => reminder_hours));
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'booked' and new.status = 'cancelled' and new.customer_email is not null then
    delete from public.email_outbox where payload ->> 'appointment_id' = new.id::text and kind = 'reminder' and processed_at is null;
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values ('cancellation', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty wurde storniert',
      jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at));
  elsif tg_op = 'UPDATE' and old.starts_at is distinct from new.starts_at and new.status = 'booked' and new.customer_email is not null then
    delete from public.email_outbox where payload ->> 'appointment_id' = new.id::text and kind = 'reminder' and processed_at is null;
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
    values ('rescheduled', new.customer_email, new.customer_name, 'Dein Termin bei GiGi Beauty wurde verschoben',
      jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at));
    if new.starts_at - make_interval(hours => reminder_hours) > now() then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values ('reminder', new.customer_email, new.customer_name, 'Erinnerung: Dein Termin bei GiGi Beauty',
        jsonb_build_object('appointment_id', new.id, 'service', service_name, 'starts_at', new.starts_at),
        new.starts_at - make_interval(hours => reminder_hours));
    end if;
  end if;
  return new;
end;
$$;

create trigger appointment_email_events
after insert or update on public.appointments
for each row execute function public.queue_appointment_emails();

create or replace function public.sync_appointment_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not new.is_private and new.customer_email is not null then
    insert into public.customers(profile_id, full_name, email, phone)
    values(new.customer_id, new.customer_name, lower(new.customer_email), new.customer_phone)
    on conflict (email) do update set
      profile_id = coalesce(excluded.profile_id, customers.profile_id),
      full_name = excluded.full_name,
      phone = coalesce(excluded.phone, customers.phone);
  end if;
  return new;
end;
$$;

create trigger appointment_syncs_customer
after insert or update of customer_id, customer_name, customer_email, customer_phone on public.appointments
for each row execute function public.sync_appointment_customer();

create or replace function public.create_no_show_invoice()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  service_price numeric(10,2);
  new_invoice_id uuid;
  new_invoice_number bigint;
  new_due_at date;
begin
  if new.status = 'no_show' and old.status is distinct from new.status and not new.is_private then
    select coalesce(price_chf, 0) into service_price from public.services where id = new.service_id;
    insert into public.invoices (
      appointment_id, customer_id, customer_name, customer_email, amount_chf, reason
    ) values (
      new.id, new.customer_id, new.customer_name, new.customer_email, service_price,
      'Nichterscheinen ohne rechtzeitige Abmeldung (mindestens 12 Stunden vorher)'
    ) on conflict (appointment_id) do nothing returning id, invoice_number, due_at into new_invoice_id, new_invoice_number, new_due_at;
    if new_invoice_id is not null and new.customer_email is not null then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
      values ('invoice', new.customer_email, new.customer_name, 'Rechnung von GiGi Beauty',
        jsonb_build_object('invoice_id', new_invoice_id, 'invoice_number', new_invoice_number, 'appointment_id', new.id, 'starts_at', new.starts_at, 'amount_chf', service_price, 'due_at', new_due_at));
    end if;
  end if;
  return new;
end;
$$;

create trigger appointment_no_show_invoice
after update of status on public.appointments
for each row execute function public.create_no_show_invoice();

create or replace function public.prevent_cross_calendar_overlap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_table_name = 'appointments' and new.status = 'booked' and exists (
    select 1 from public.blocked_times b
    where tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'Der Zeitraum wurde im Kalender gesperrt.';
  elsif tg_table_name = 'blocked_times' and exists (
    select 1 from public.appointments a
    where a.status = 'booked' and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'In diesem Zeitraum besteht bereits ein Termin.';
  end if;
  return new;
end;
$$;

create trigger appointments_check_blocks
before insert or update of starts_at, ends_at, status on public.appointments
for each row execute function public.prevent_cross_calendar_overlap();
create trigger blocks_check_appointments
before insert or update of starts_at, ends_at on public.blocked_times
for each row execute function public.prevent_cross_calendar_overlap();

create or replace function public.queue_marketing_campaign(requested_campaign_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  campaign public.marketing_campaigns;
  recipient_count integer;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  select * into campaign from public.marketing_campaigns where id = requested_campaign_id for update;
  if campaign.id is null then raise exception 'Kampagne nicht gefunden.'; end if;
  if campaign.status = 'sent' then raise exception 'Diese Kampagne wurde bereits versendet.'; end if;
  if campaign.queued_at is not null then raise exception 'Diese Kampagne wurde bereits eingeplant.'; end if;

  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
  select 'campaign', p.email, p.full_name, campaign.subject,
    jsonb_build_object('campaign_id', campaign.id, 'content', campaign.content),
    coalesce(campaign.scheduled_at, now())
  from public.customers p
  where p.marketing_consent = true;
  get diagnostics recipient_count = row_count;

  update public.marketing_campaigns
  set status = case when recipient_count = 0 then 'sent' else 'scheduled' end,
      queued_at = now(),
      sent_at = case when recipient_count = 0 then now() else null end
  where id = campaign.id;
  return recipient_count;
end;
$$;

create or replace function public.claim_due_emails(batch_size integer default 25)
returns setof public.email_outbox
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  update public.email_outbox e
  set attempts = e.attempts + 1, processing_at = now()
  where e.id in (
    select pending.id from public.email_outbox pending
    where pending.processed_at is null
      and pending.scheduled_for <= now()
      and pending.attempts < 5
      and (pending.processing_at is null or pending.processing_at < now() - interval '10 minutes')
    order by pending.scheduled_for
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  returning e.*;
end;
$$;

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.business_settings enable row level security;
alter table public.appointments enable row level security;
alter table public.blocked_times enable row level security;
alter table public.invoices enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.email_outbox enable row level security;
alter table public.customers enable row level security;

create policy "profiles read own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles update own or admin" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "services public read" on public.services for select using (active or public.is_admin());
create policy "services admin write" on public.services for all using (public.is_admin()) with check (public.is_admin());
create policy "settings public read" on public.business_settings for select using (true);
create policy "settings admin write" on public.business_settings for update using (public.is_admin()) with check (public.is_admin());
create policy "appointments own or admin read" on public.appointments for select using (customer_id = auth.uid() or public.is_admin());
create policy "appointments admin insert" on public.appointments for insert with check (public.is_admin());
create policy "appointments admin update" on public.appointments for update using (public.is_admin()) with check (public.is_admin());
create policy "appointments admin delete" on public.appointments for delete using (public.is_admin());
create policy "blocks admin only" on public.blocked_times for all using (public.is_admin()) with check (public.is_admin());
create policy "invoices own or admin read" on public.invoices for select using (customer_id = auth.uid() or public.is_admin());
create policy "invoices admin write" on public.invoices for all using (public.is_admin()) with check (public.is_admin());
create policy "campaigns admin only" on public.marketing_campaigns for all using (public.is_admin()) with check (public.is_admin());
create policy "customers admin only" on public.customers for all using (public.is_admin()) with check (public.is_admin());

grant execute on function public.get_unavailable_slots(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.book_appointment(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.cancel_own_appointment(uuid) to authenticated;
grant execute on function public.queue_marketing_campaign(uuid) to authenticated;
revoke execute on function public.claim_due_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_due_emails(integer) to service_role;

-- After Liliane creates her account, promote it once in the SQL editor:
-- update public.profiles set role = 'admin' where email = 'info@gigibeauty.ch';
