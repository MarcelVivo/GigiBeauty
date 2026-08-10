-- GiGi Beauty High-End CRM / ERP / Marketing Suite
-- Nach den Migrationen 202608070001 und 202608080002 ausführen.

alter table public.services
  add column if not exists rebooking_days integer not null default 28 check (rebooking_days between 1 and 365),
  add column if not exists material_cost_chf numeric(10,2) not null default 0 check (material_cost_chf >= 0);

update public.services set rebooking_days = case slug
  when 'gel-acryl-nails' then 21
  when 'lashes' then 21
  when 'kosmetische-pedicure' then 35
  when 'korean-cosmetics' then 28
  when 'permanent-make-up' then 180
  when 'fillers' then 180
  else 60 end;

alter table public.customers
  add column if not exists tags text[] not null default '{}',
  add column if not exists acquisition_source text,
  add column if not exists preferred_service_id uuid references public.services(id) on delete set null,
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.customers(id) on delete set null,
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_consent_source text,
  add column if not exists marketing_consent_version text,
  add column if not exists last_contacted_at timestamptz;

update public.customers
set referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
where referral_code is null;

update public.customers
set acquisition_source = coalesce(acquisition_source, 'Treatwell'),
    marketing_consent_source = case when marketing_consent then coalesce(marketing_consent_source, 'Treatwell Export') else marketing_consent_source end,
    marketing_consent_at = case when marketing_consent then coalesce(marketing_consent_at, created_at) else marketing_consent_at end,
    marketing_consent_version = case when marketing_consent then coalesce(marketing_consent_version, 'Import 2026-07-03') else marketing_consent_version end
where source = 'Treatwell CSV-Import';

create unique index if not exists customers_referral_code_idx
on public.customers(referral_code) where referral_code is not null;

create or replace function public.sync_profile_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role = 'customer' then
    insert into public.customers(profile_id, full_name, email, phone, marketing_consent, marketing_consent_at, marketing_consent_source, marketing_consent_version, acquisition_source)
    values(new.id, new.full_name, lower(new.email), new.phone, new.marketing_consent,
      case when new.marketing_consent then now() else null end,
      case when new.marketing_consent then 'Website Registrierung' else null end,
      case when new.marketing_consent then '2026-08' else null end,
      'Website')
    on conflict (email) do update set
      profile_id = excluded.profile_id,
      full_name = excluded.full_name,
      phone = coalesce(excluded.phone, customers.phone),
      marketing_consent = excluded.marketing_consent,
      marketing_consent_at = case when excluded.marketing_consent then coalesce(customers.marketing_consent_at, now()) else customers.marketing_consent_at end,
      marketing_consent_source = case when excluded.marketing_consent then coalesce(customers.marketing_consent_source, 'Website Registrierung') else customers.marketing_consent_source end,
      marketing_consent_version = case when excluded.marketing_consent then coalesce(customers.marketing_consent_version, '2026-08') else customers.marketing_consent_version end;
  end if;
  return new;
end;
$$;

alter table public.appointments
  add column if not exists amount_chf numeric(10,2) check (amount_chf is null or amount_chf >= 0),
  add column if not exists discount_chf numeric(10,2) not null default 0 check (discount_chf >= 0),
  add column if not exists booking_source text not null default 'dashboard',
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','refunded')),
  add column if not exists paid_at timestamptz;

update public.appointments a
set amount_chf = greatest(0, coalesce(s.price_chf, 0) - a.discount_chf)
from public.services s
where a.service_id = s.id and a.amount_chf is null and not a.is_private;

create or replace function public.set_appointment_amount()
returns trigger language plpgsql security definer set search_path = public as $$
declare service_price numeric(10,2);
begin
  if new.is_private or new.service_id is null then
    new.amount_chf := null;
  elsif new.amount_chf is null or (tg_op = 'UPDATE' and (new.service_id is distinct from old.service_id or new.discount_chf is distinct from old.discount_chf)) then
    select price_chf into service_price from public.services where id = new.service_id;
    new.amount_chf := greatest(0, coalesce(service_price, 0) - coalesce(new.discount_chf, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_set_amount on public.appointments;
create trigger appointments_set_amount before insert or update of service_id, discount_chf, is_private
on public.appointments for each row execute function public.set_appointment_amount();

alter table public.invoices
  add column if not exists paid_at timestamptz,
  add column if not exists payment_reference text;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount_chf numeric(10,2) not null check (amount_chf > 0),
  tip_chf numeric(10,2) not null default 0 check (tip_chf >= 0),
  method text not null check (method in ('cash','card','twint','bank','invoice','gift_card','package','other')),
  status text not null default 'completed' check (status in ('pending','completed','refunded','failed')),
  external_reference text,
  paid_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null,
  supplier text,
  description text not null,
  amount_chf numeric(10,2) not null check (amount_chf > 0),
  receipt_url text,
  recurring boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  category text,
  unit text not null default 'Stk.',
  stock_quantity numeric(12,3) not null default 0,
  minimum_quantity numeric(12,3) not null default 0,
  unit_cost_chf numeric(10,2) not null default 0 check (unit_cost_chf >= 0),
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_inventory (
  service_id uuid not null references public.services(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity_used numeric(12,3) not null check (quantity_used > 0),
  primary key (service_id, inventory_item_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  movement_type text not null check (movement_type in ('purchase','consumption','adjustment','return','waste')),
  quantity_delta numeric(12,3) not null check (quantity_delta <> 0),
  unit_cost_chf numeric(10,2),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index inventory_appointment_consumption_idx
on public.inventory_movements(inventory_item_id, appointment_id, movement_type)
where appointment_id is not null and movement_type = 'consumption';

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid references public.services(id) on delete cascade,
  customer_name text not null,
  email text,
  phone text,
  preferred_from timestamptz,
  preferred_until timestamptz,
  preferred_weekdays integer[] not null default '{}',
  preferred_time_from time,
  preferred_time_until time,
  flexible boolean not null default true,
  priority integer not null default 0,
  status text not null default 'open' check (status in ('open','offered','booked','expired','cancelled')),
  offered_at timestamptz,
  offered_start timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  task_type text not null,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','done','dismissed')),
  due_at timestamptz,
  dedupe_key text unique,
  metadata jsonb not null default '{}',
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_communications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  email_outbox_id uuid unique references public.email_outbox(id) on delete set null,
  channel text not null check (channel in ('email','phone','sms','whatsapp','in_person','system')),
  direction text not null default 'outbound' check (direction in ('inbound','outbound','internal')),
  communication_type text not null,
  subject text,
  content text,
  status text not null default 'planned' check (status in ('planned','sent','delivered','opened','clicked','replied','failed')),
  scheduled_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  consent_type text not null default 'email_marketing',
  granted boolean not null,
  source text,
  policy_version text,
  evidence jsonb not null default '{}',
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null
);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  delay_hours integer not null default 0,
  channel text not null default 'email',
  requires_marketing_consent boolean not null default false,
  subject_template text,
  content_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  event_type text not null check (event_type in ('sent','delivered','opened','clicked','unsubscribed','booked','completed','revenue')),
  source text,
  medium text,
  campaign_name text,
  revenue_chf numeric(10,2),
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create table public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  service_id uuid references public.services(id) on delete set null,
  sessions_total integer not null check (sessions_total > 0),
  sessions_remaining integer not null check (sessions_remaining >= 0),
  price_chf numeric(10,2) not null check (price_chf >= 0),
  status text not null default 'active' check (status in ('active','used','expired','cancelled')),
  purchased_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  purchaser_customer_id uuid references public.customers(id) on delete set null,
  recipient_name text,
  initial_value_chf numeric(10,2) not null check (initial_value_chf > 0),
  balance_chf numeric(10,2) not null check (balance_chf >= 0),
  status text not null default 'active' check (status in ('active','redeemed','expired','cancelled')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payments
  add column package_id uuid references public.customer_packages(id) on delete set null,
  add column gift_card_id uuid references public.gift_cards(id) on delete set null;

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index payments_paid_at_idx on public.payments(paid_at);
create index expenses_date_idx on public.expenses(expense_date);
create index waitlist_status_idx on public.waitlist_entries(status, preferred_from);
create index crm_tasks_open_idx on public.crm_tasks(status, due_at) where status = 'open';
create index communications_customer_idx on public.customer_communications(customer_id, occurred_at desc);
create index marketing_events_campaign_idx on public.marketing_events(campaign_id, event_type);
create unique index marketing_events_appointment_event_idx on public.marketing_events(appointment_id, event_type)
where appointment_id is not null;
create index audit_log_changed_at_idx on public.audit_log(changed_at desc);

insert into public.automation_rules(rule_key, name, description, delay_hours, requires_marketing_consent, subject_template, content_template) values
  ('aftercare', 'Pflegehinweise', 'Sendet nach einer abgeschlossenen Behandlung passende Pflegehinweise.', 2, false, 'Deine Pflege nach {{service}}', 'Danke für deinen Besuch. Hier findest du die wichtigsten Pflegehinweise für deine Behandlung.'),
  ('review', 'Bewertung anfragen', 'Bittet zufriedene Kundinnen zwei Tage nach dem Termin um eine Bewertung.', 48, true, 'Wie zufrieden warst du bei GiGi Beauty?', 'Deine Meinung ist uns wichtig. Wenn du zufrieden warst, freuen wir uns über deine Bewertung.'),
  ('rebooking', 'Wiederbuchung', 'Erinnert im individuellen Behandlungsintervall an den nächsten Termin.', 0, true, 'Zeit für deinen nächsten GiGi Beauty Termin', 'Dein übliches Wiederbuchungsfenster ist erreicht. Sichere dir jetzt deinen Wunschtermin.'),
  ('birthday', 'Geburtstagsgruss', 'Erstellt eine persönliche Geburtstagsaufgabe.', 0, true, 'Alles Liebe zum Geburtstag', 'Wir wünschen dir einen wunderschönen Geburtstag.'),
  ('winback', 'Reaktivierung', 'Erkennt Kundinnen ohne Besuch seit mindestens 180 Tagen.', 0, true, 'Wir vermissen dich bei GiGi Beauty', 'Es ist schon eine Weile her. Wir würden uns freuen, dich wiederzusehen.')
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, requires_marketing_consent = excluded.requires_marketing_consent,
  subject_template = excluded.subject_template, content_template = excluded.content_template;

alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation','reminder','cancellation','rescheduled','invoice','campaign','aftercare','review','rebooking','winback','birthday','waitlist'
));

create or replace function public.sync_payment_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_appointment uuid; paid_total numeric(10,2); due_total numeric(10,2);
begin
  target_appointment := case when tg_op = 'DELETE' then old.appointment_id else new.appointment_id end;
  if target_appointment is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select coalesce(sum(amount_chf), 0) into paid_total from public.payments
  where appointment_id = target_appointment and status = 'completed';
  select coalesce(amount_chf, 0) into due_total from public.appointments where id = target_appointment;
  update public.appointments set
    payment_status = case when paid_total <= 0 then 'unpaid' when paid_total < due_total then 'partial' else 'paid' end,
    paid_at = case when paid_total >= due_total and due_total > 0 then coalesce(paid_at, now()) else null end
  where id = target_appointment;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger payments_sync_appointment after insert or update or delete on public.payments
for each row execute function public.sync_payment_status();

create or replace function public.apply_customer_benefit_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare deduct boolean; restore boolean;
begin
  if tg_op = 'INSERT' then
    deduct := new.status = 'completed';
    restore := false;
  else
    deduct := new.status = 'completed' and old.status is distinct from 'completed';
    restore := old.status = 'completed' and new.status <> 'completed';
  end if;
  if new.gift_card_id is not null then
    update public.gift_cards set
      balance_chf = greatest(0, balance_chf + case when deduct then -new.amount_chf when restore then new.amount_chf else 0 end),
      status = case when balance_chf + case when deduct then -new.amount_chf when restore then new.amount_chf else 0 end <= 0 then 'redeemed' else 'active' end
    where id = new.gift_card_id;
  end if;
  if new.package_id is not null then
    update public.customer_packages set
      sessions_remaining = greatest(0, sessions_remaining + case when deduct then -1 when restore then 1 else 0 end),
      status = case when sessions_remaining + case when deduct then -1 when restore then 1 else 0 end <= 0 then 'used' else 'active' end
    where id = new.package_id;
  end if;
  return new;
end;
$$;
create trigger payments_apply_customer_benefit after insert or update of status on public.payments
for each row execute function public.apply_customer_benefit_payment();

create or replace function public.sync_invoice_paid_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then new.paid_at := now(); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;
  return new;
end;
$$;
create trigger invoices_sync_paid_at before update of status on public.invoices
for each row execute function public.sync_invoice_paid_at();

create or replace function public.apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.inventory_items set stock_quantity = stock_quantity + new.quantity_delta where id = new.inventory_item_id;
  elsif tg_op = 'DELETE' then
    update public.inventory_items set stock_quantity = stock_quantity - old.quantity_delta where id = old.inventory_item_id;
  else
    update public.inventory_items set stock_quantity = stock_quantity - old.quantity_delta where id = old.inventory_item_id;
    update public.inventory_items set stock_quantity = stock_quantity + new.quantity_delta where id = new.inventory_item_id;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger inventory_movements_apply after insert or update or delete on public.inventory_movements
for each row execute function public.apply_inventory_movement();

create or replace function public.consume_inventory_for_appointment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.service_id is not null then
    insert into public.inventory_movements(inventory_item_id, appointment_id, movement_type, quantity_delta, notes)
    select si.inventory_item_id, new.id, 'consumption', -si.quantity_used, 'Automatischer Verbrauch: ' || new.customer_name
    from public.service_inventory si where si.service_id = new.service_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger appointments_consume_inventory after update of status on public.appointments
for each row execute function public.consume_inventory_for_appointment();

create or replace function public.log_outbox_communication()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_customer uuid;
begin
  select id into target_customer from public.customers where lower(email) = lower(new.recipient_email) limit 1;
  insert into public.customer_communications(customer_id, email_outbox_id, channel, direction, communication_type, subject, content, status, scheduled_at, occurred_at)
  values(target_customer, new.id, 'email', 'outbound', new.kind, new.subject, new.payload ->> 'content', 'planned', new.scheduled_for, new.created_at)
  on conflict (email_outbox_id) do nothing;
  return new;
end;
$$;
create trigger email_outbox_logs_communication after insert on public.email_outbox
for each row execute function public.log_outbox_communication();

create or replace function public.queue_customer_journey()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_customer public.customers; service_row public.services; booking_url text := 'https://www.gigibeauty.ch/pages/booking.html';
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' or new.is_private or new.customer_email is null then return new; end if;
  select * into target_customer from public.customers where lower(email) = lower(new.customer_email) limit 1;
  select * into service_row from public.services where id = new.service_id;

  if not exists(select 1 from public.email_outbox where kind = 'aftercare' and payload ->> 'appointment_id' = new.id::text) then
    insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
    values('aftercare', new.customer_email, new.customer_name, 'Deine Pflege nach ' || coalesce(service_row.name, 'deiner Behandlung'),
      jsonb_build_object('appointment_id', new.id, 'service', service_row.name, 'content', 'Danke für deinen Besuch. Beachte bitte die persönlich besprochenen Pflegehinweise. Bei Fragen sind wir gerne für dich da.'), now() + interval '2 hours');
  end if;

  if coalesce(target_customer.marketing_consent, false) and not target_customer.do_not_contact then
    if not exists(select 1 from public.email_outbox where kind = 'review' and payload ->> 'appointment_id' = new.id::text) then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values('review', new.customer_email, new.customer_name, 'Wie zufrieden warst du bei GiGi Beauty?',
        jsonb_build_object('appointment_id', new.id, 'service', service_row.name, 'content', 'Deine Meinung ist uns wichtig. Wenn du zufrieden warst, freuen wir uns über deine Google-Bewertung.'), now() + interval '48 hours');
    end if;
    if not exists(select 1 from public.email_outbox where kind = 'rebooking' and payload ->> 'appointment_id' = new.id::text) then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload, scheduled_for)
      values('rebooking', new.customer_email, new.customer_name, 'Zeit für deinen nächsten GiGi Beauty Termin',
        jsonb_build_object('appointment_id', new.id, 'service', service_row.name, 'booking_url', booking_url, 'content', 'Dein übliches Wiederbuchungsfenster ist erreicht. Sichere dir jetzt deinen Wunschtermin.'),
        greatest(now() + interval '24 hours', new.starts_at + make_interval(days => coalesce(service_row.rebooking_days, 28))));
    end if;
  end if;
  return new;
end;
$$;
create trigger appointments_queue_customer_journey after update of status on public.appointments
for each row execute function public.queue_customer_journey();

create or replace function public.generate_daily_crm_tasks()
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer := 0; row_count_value integer;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;

  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select c.id, 'missing_email', 'E-Mail ergänzen: ' || c.full_name, 'Ohne E-Mail sind Login, Bestätigung und Marketing nicht möglich.', 'normal', now(), 'missing-email:' || c.id::text
  from public.customers c where c.email is null
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select null::uuid, 'low_stock', 'Lagerbestand prüfen: ' || i.name, 'Bestand ' || i.stock_quantity || ' ' || i.unit || ', Mindestbestand ' || i.minimum_quantity || ' ' || i.unit || '.', 'high', now(), 'low-stock:' || i.id::text || ':' || to_char(current_date, 'YYYY-MM')
  from public.inventory_items i
  where i.active and i.stock_quantity <= i.minimum_quantity
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  with last_visit as (
    select distinct on (c.id) c.id customer_id, c.full_name, c.email, c.marketing_consent, c.do_not_contact,
      a.id appointment_id, a.starts_at, a.service_id, s.name service_name, s.rebooking_days
    from public.customers c join public.appointments a on c.email is not null and lower(a.customer_email) = lower(c.email)
    left join public.services s on s.id = a.service_id
    where a.status = 'completed'
    order by c.id, a.starts_at desc
  )
  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key, metadata)
  select l.customer_id, 'rebooking', 'Wiederbuchung: ' || l.full_name, coalesce(l.service_name, 'Letzte Behandlung') || ' ist wieder fällig.', 'high', l.starts_at + make_interval(days => coalesce(l.rebooking_days, 28)), 'rebook:' || l.appointment_id::text,
    jsonb_build_object('appointment_id', l.appointment_id, 'service_id', l.service_id)
  from last_visit l
  where l.starts_at + make_interval(days => coalesce(l.rebooking_days, 28)) <= now()
    and not exists(select 1 from public.appointments future where future.status = 'booked' and future.starts_at > now() and lower(future.customer_email) = lower(l.email))
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  with visits as (
    select c.id, c.full_name, max(a.starts_at) last_visit
    from public.customers c join public.appointments a on c.email is not null and lower(a.customer_email) = lower(c.email)
    where a.status = 'completed' group by c.id, c.full_name
  )
  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select v.id, 'winback', 'Reaktivieren: ' || v.full_name, 'Seit mehr als 180 Tagen ohne Besuch.', 'normal', now(), 'winback:' || v.id::text || ':' || to_char(current_date, 'YYYY-MM')
  from visits v where v.last_visit < now() - interval '180 days'
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  insert into public.crm_tasks(customer_id, task_type, title, description, priority, due_at, dedupe_key)
  select c.id, 'birthday', 'Geburtstag: ' || c.full_name, 'Persönliche Geburtstagsnachricht vorbereiten.', 'normal',
    make_date(extract(year from current_date)::int + case when to_char(c.birth_date, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end, extract(month from c.birth_date)::int, least(extract(day from c.birth_date)::int, 28))::timestamptz,
    'birthday:' || c.id::text || ':' || extract(year from current_date)::text
  from public.customers c where c.birth_date is not null and
    (make_date(extract(year from current_date)::int + case when to_char(c.birth_date, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end, extract(month from c.birth_date)::int, least(extract(day from c.birth_date)::int, 28)) - current_date) between 0 and 14
  on conflict (dedupe_key) do nothing;
  get diagnostics row_count_value = row_count; inserted_count := inserted_count + row_count_value;

  return inserted_count;
end;
$$;

create or replace function public.offer_waitlist_entry(requested_waitlist_id uuid, requested_start timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare entry public.waitlist_entries; service_name text;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  select * into entry from public.waitlist_entries where id = requested_waitlist_id and status in ('open','offered') for update;
  if entry.id is null then raise exception 'Wartelisteneintrag nicht verfügbar.'; end if;
  if entry.email is null then raise exception 'Für ein automatisches Angebot fehlt die E-Mail-Adresse.'; end if;
  select name into service_name from public.services where id = entry.service_id;
  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
  values('waitlist', entry.email, entry.customer_name, 'Ein Wunschtermin bei GiGi Beauty ist frei geworden',
    jsonb_build_object('waitlist_id', entry.id, 'service', service_name, 'starts_at', requested_start, 'booking_url', 'https://www.gigibeauty.ch/pages/booking.html', 'content', 'Ein passendes Zeitfenster ist frei geworden. Buche es direkt online, solange es verfügbar ist.'));
  update public.waitlist_entries set status = 'offered', offered_at = now(), offered_start = requested_start where id = entry.id;
end;
$$;

create or replace function public.complete_crm_task(requested_task_id uuid, requested_status text default 'done')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  if requested_status not in ('done','dismissed') then raise exception 'Ungültiger Status.'; end if;
  update public.crm_tasks set status = requested_status, completed_at = now(), completed_by = auth.uid() where id = requested_task_id;
end;
$$;

create or replace function public.queue_customer_message(requested_customer_id uuid, requested_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare customer_row public.customers; rule_row public.automation_rules; outbox_id uuid;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  if requested_kind not in ('review','rebooking','winback','birthday') then raise exception 'Unbekannte Nachricht.'; end if;
  select * into customer_row from public.customers where id = requested_customer_id;
  if customer_row.id is null then raise exception 'Kundin nicht gefunden.'; end if;
  if customer_row.email is null then raise exception 'Für diese Kundin fehlt die E-Mail-Adresse.'; end if;
  if not customer_row.marketing_consent or customer_row.do_not_contact then raise exception 'Keine gültige Marketing-Einwilligung.'; end if;
  select * into rule_row from public.automation_rules where rule_key = requested_kind and active;
  if rule_row.id is null then raise exception 'Diese Automation ist nicht aktiv.'; end if;
  insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
  values(requested_kind, customer_row.email, customer_row.full_name, rule_row.subject_template,
    jsonb_build_object('customer_id', customer_row.id, 'content', rule_row.content_template, 'booking_url', 'https://www.gigibeauty.ch/pages/booking.html'))
  returning id into outbox_id;
  update public.customers set last_contacted_at = now() where id = customer_row.id;
  return outbox_id;
end;
$$;

create or replace function public.record_booking_attribution(requested_appointment_id uuid, requested_source text, requested_medium text, requested_campaign text)
returns void language plpgsql security definer set search_path = public as $$
declare appointment_row public.appointments; target_customer uuid; referrer_customer uuid; target_campaign uuid;
begin
  select * into appointment_row from public.appointments where id = requested_appointment_id and customer_id = auth.uid();
  if appointment_row.id is null then raise exception 'Termin nicht gefunden.'; end if;
  select id into referrer_customer from public.customers where upper(referral_code) = upper(requested_source) limit 1;
  update public.appointments set booking_source = case when referrer_customer is not null then 'referral' else coalesce(nullif(requested_source, ''), 'direct') end, utm_source = nullif(requested_source, ''), utm_medium = nullif(requested_medium, ''), utm_campaign = nullif(requested_campaign, '') where id = appointment_row.id;
  select id into target_customer from public.customers where lower(email) = lower(appointment_row.customer_email) limit 1;
  select id into target_campaign from public.marketing_campaigns where lower(title) = lower(requested_campaign) limit 1;
  if referrer_customer is not null and target_customer is not null and referrer_customer <> target_customer then
    update public.customers set referred_by = coalesce(referred_by, referrer_customer) where id = target_customer;
  end if;
  insert into public.marketing_events(customer_id, campaign_id, appointment_id, event_type, source, medium, campaign_name)
  values(target_customer, target_campaign, appointment_row.id, 'booked', nullif(requested_source, ''), nullif(requested_medium, ''), nullif(requested_campaign, ''))
  on conflict do nothing;
end;
$$;

create or replace function public.track_completed_booking_value()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_customer uuid; target_campaign uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and not new.is_private then
    select id into target_customer from public.customers where new.customer_email is not null and lower(email) = lower(new.customer_email) limit 1;
    select id into target_campaign from public.marketing_campaigns where new.utm_campaign is not null and lower(title) = lower(new.utm_campaign) limit 1;
    insert into public.marketing_events(customer_id, campaign_id, appointment_id, event_type, source, medium, campaign_name)
    values(target_customer, target_campaign, new.id, 'completed', new.utm_source, new.utm_medium, new.utm_campaign) on conflict do nothing;
    insert into public.marketing_events(customer_id, campaign_id, appointment_id, event_type, source, medium, campaign_name, revenue_chf)
    values(target_customer, target_campaign, new.id, 'revenue', new.utm_source, new.utm_medium, new.utm_campaign, new.amount_chf) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger appointments_track_completed_value after update of status on public.appointments
for each row execute function public.track_completed_booking_value();

create or replace function public.merge_customers(primary_customer_id uuid, duplicate_customer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare primary_row public.customers; duplicate_row public.customers;
begin
  if not public.is_admin() then raise exception 'Keine Berechtigung.'; end if;
  if primary_customer_id = duplicate_customer_id then return primary_customer_id; end if;
  select * into primary_row from public.customers where id = primary_customer_id for update;
  select * into duplicate_row from public.customers where id = duplicate_customer_id for update;
  if primary_row.id is null or duplicate_row.id is null then raise exception 'Kundenprofil nicht gefunden.'; end if;
  if primary_row.profile_id is not null and duplicate_row.profile_id is not null and primary_row.profile_id <> duplicate_row.profile_id then
    raise exception 'Zwei unterschiedliche Login-Konten können nicht automatisch zusammengeführt werden.';
  end if;

  update public.customer_communications set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.crm_tasks set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.waitlist_entries set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.payments set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.customer_packages set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.marketing_events set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.customer_consents set customer_id = primary_row.id where customer_id = duplicate_row.id;
  update public.gift_cards set purchaser_customer_id = primary_row.id where purchaser_customer_id = duplicate_row.id;
  update public.customers set referred_by = primary_row.id where referred_by = duplicate_row.id and id <> primary_row.id;
  update public.customers set profile_id = null, email = null where id = duplicate_row.id;

  update public.customers set
    profile_id = coalesce(primary_row.profile_id, duplicate_row.profile_id),
    full_name = case when primary_row.profile_id is null and duplicate_row.profile_id is not null then duplicate_row.full_name else primary_row.full_name end,
    email = coalesce(primary_row.email, duplicate_row.email),
    phone = coalesce(primary_row.phone, duplicate_row.phone),
    notes = nullif(concat_ws(E'\n', primary_row.notes, duplicate_row.notes), ''),
    tags = array(select distinct unnest(coalesce(primary_row.tags, '{}') || coalesce(duplicate_row.tags, '{}'))),
    language = coalesce(primary_row.language, duplicate_row.language),
    birth_date = coalesce(primary_row.birth_date, duplicate_row.birth_date),
    acquisition_source = coalesce(primary_row.acquisition_source, duplicate_row.acquisition_source),
    preferred_service_id = coalesce(primary_row.preferred_service_id, duplicate_row.preferred_service_id),
    marketing_consent = primary_row.marketing_consent or duplicate_row.marketing_consent,
    marketing_consent_at = coalesce(primary_row.marketing_consent_at, duplicate_row.marketing_consent_at),
    marketing_consent_source = coalesce(primary_row.marketing_consent_source, duplicate_row.marketing_consent_source),
    marketing_consent_version = coalesce(primary_row.marketing_consent_version, duplicate_row.marketing_consent_version),
    legacy_booking_count = greatest(primary_row.legacy_booking_count, duplicate_row.legacy_booking_count),
    last_contacted_at = greatest(primary_row.last_contacted_at, duplicate_row.last_contacted_at)
  where id = primary_row.id;

  delete from public.customers where id = duplicate_row.id;
  return primary_row.id;
end;
$$;

create or replace function public.audit_business_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare record_value jsonb; old_value jsonb; new_value jsonb;
begin
  old_value := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  new_value := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  record_value := coalesce(new_value, old_value);
  insert into public.audit_log(table_name, record_id, action, old_data, new_data, changed_by)
  values(tg_table_name, record_value ->> 'id', lower(tg_op), old_value, new_value, auth.uid());
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger customers_audit after insert or update or delete on public.customers for each row execute function public.audit_business_change();
create trigger appointments_audit after insert or update or delete on public.appointments for each row execute function public.audit_business_change();
create trigger payments_audit after insert or update or delete on public.payments for each row execute function public.audit_business_change();
create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function public.audit_business_change();
create trigger inventory_audit after insert or update or delete on public.inventory_items for each row execute function public.audit_business_change();
create trigger waitlist_audit after insert or update or delete on public.waitlist_entries for each row execute function public.audit_business_change();

create or replace function public.track_customer_consent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.marketing_consent is distinct from old.marketing_consent then
    insert into public.customer_consents(customer_id, granted, source, policy_version, recorded_by)
    values(new.id, new.marketing_consent, coalesce(new.marketing_consent_source, new.source), new.marketing_consent_version, auth.uid());
    if new.marketing_consent and new.marketing_consent_at is null then
      update public.customers set marketing_consent_at = now() where id = new.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger customers_track_consent after insert or update of marketing_consent on public.customers
for each row execute function public.track_customer_consent();

insert into public.customer_consents(customer_id, granted, source, policy_version, recorded_at)
select id, marketing_consent, coalesce(marketing_consent_source, source), marketing_consent_version, coalesce(marketing_consent_at, created_at)
from public.customers c
where not exists(select 1 from public.customer_consents cc where cc.customer_id = c.id);

create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger inventory_set_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger waitlist_set_updated_at before update on public.waitlist_entries for each row execute function public.set_updated_at();
create trigger crm_tasks_set_updated_at before update on public.crm_tasks for each row execute function public.set_updated_at();
create trigger automation_rules_set_updated_at before update on public.automation_rules for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.inventory_items enable row level security;
alter table public.service_inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.customer_communications enable row level security;
alter table public.customer_consents enable row level security;
alter table public.automation_rules enable row level security;
alter table public.marketing_events enable row level security;
alter table public.customer_packages enable row level security;
alter table public.gift_cards enable row level security;
alter table public.audit_log enable row level security;

create policy "payments admin only" on public.payments for all using (public.is_admin()) with check (public.is_admin());
create policy "expenses admin only" on public.expenses for all using (public.is_admin()) with check (public.is_admin());
create policy "inventory admin only" on public.inventory_items for all using (public.is_admin()) with check (public.is_admin());
create policy "service inventory admin only" on public.service_inventory for all using (public.is_admin()) with check (public.is_admin());
create policy "inventory movements admin only" on public.inventory_movements for all using (public.is_admin()) with check (public.is_admin());
create policy "waitlist admin only" on public.waitlist_entries for all using (public.is_admin()) with check (public.is_admin());
create policy "crm tasks admin only" on public.crm_tasks for all using (public.is_admin()) with check (public.is_admin());
create policy "communications admin only" on public.customer_communications for all using (public.is_admin()) with check (public.is_admin());
create policy "consents admin only" on public.customer_consents for all using (public.is_admin()) with check (public.is_admin());
create policy "automation rules admin only" on public.automation_rules for all using (public.is_admin()) with check (public.is_admin());
create policy "marketing events admin only" on public.marketing_events for all using (public.is_admin()) with check (public.is_admin());
create policy "packages admin only" on public.customer_packages for all using (public.is_admin()) with check (public.is_admin());
create policy "gift cards admin only" on public.gift_cards for all using (public.is_admin()) with check (public.is_admin());
create policy "audit admin read" on public.audit_log for select using (public.is_admin());

grant select, insert, update, delete on public.payments, public.expenses, public.inventory_items,
  public.service_inventory, public.inventory_movements, public.waitlist_entries, public.crm_tasks,
  public.customer_communications, public.customer_consents, public.automation_rules,
  public.marketing_events, public.customer_packages, public.gift_cards to authenticated;
grant select on public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;

grant execute on function public.generate_daily_crm_tasks() to authenticated;
grant execute on function public.offer_waitlist_entry(uuid, timestamptz) to authenticated;
grant execute on function public.complete_crm_task(uuid, text) to authenticated;
grant execute on function public.queue_customer_message(uuid, text) to authenticated;
grant execute on function public.record_booking_attribution(uuid, text, text, text) to authenticated;
grant execute on function public.merge_customers(uuid, uuid) to authenticated;
