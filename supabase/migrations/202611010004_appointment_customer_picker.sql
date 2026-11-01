-- Termin <-> Kundin fest verknüpfen (appointments.customer_ref_id).
--
-- Bisher: AFTER-Trigger sync_appointment_customer() legte nur bei
-- vorhandener E-Mail eine Kundin an bzw. aktualisierte sie -- und
-- überschrieb dabei customers.full_name mit dem im Termin getippten Namen.
-- customer_ref_id wurde nie gesetzt, Termine ohne E-Mail blieben ohne
-- Kundenprofil.
--
-- Neu: BEFORE-Trigger, der customer_ref_id auflöst:
--   1. bereits gesetzt (Auswahl im Dashboard) -> nur leere Felder der
--      Kundin ergänzen, nie etwas überschreiben
--   2. Konto (customer_id/profile) -> Kundin mit diesem Konto
--   3. E-Mail -> Kundin mit dieser E-Mail
--   4. nur im Dashboard (is_admin): eindeutige Telefonnummer, dann
--      eindeutiger exakter Name
--   5. sonst neue Kundin anlegen
create or replace function public.sync_appointment_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  email_key text := nullif(lower(btrim(coalesce(new.customer_email, ''))), '');
  phone_digits text := right(regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g'), 9);
  match_id uuid;
begin
  if new.is_private then return new; end if;

  if new.customer_ref_id is null and new.customer_id is not null then
    select id into new.customer_ref_id from public.customers where profile_id = new.customer_id;
  end if;
  if new.customer_ref_id is null and email_key is not null then
    select id into new.customer_ref_id from public.customers where lower(email) = email_key limit 1;
  end if;
  if new.customer_ref_id is null and public.is_admin() then
    if length(phone_digits) = 9 then
      select min(id::text)::uuid into match_id from public.customers
      where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = phone_digits
      having count(*) = 1;
      new.customer_ref_id := match_id;
    end if;
    if new.customer_ref_id is null then
      select min(id::text)::uuid into match_id from public.customers
      where lower(btrim(full_name)) = lower(btrim(new.customer_name))
      having count(*) = 1;
      new.customer_ref_id := match_id;
    end if;
  end if;

  if new.customer_ref_id is null then
    insert into public.customers(profile_id, full_name, email, phone)
    values (
      case when new.customer_id is not null and not exists(select 1 from public.customers where profile_id = new.customer_id) then new.customer_id end,
      btrim(new.customer_name), email_key, nullif(btrim(coalesce(new.customer_phone, '')), ''))
    returning id into new.customer_ref_id;
  else
    update public.customers c set
      email = coalesce(c.email, case when email_key is not null and not exists(select 1 from public.customers o where lower(o.email) = email_key and o.id <> c.id) then email_key end),
      phone = coalesce(c.phone, nullif(btrim(coalesce(new.customer_phone, '')), '')),
      profile_id = coalesce(c.profile_id, case when new.customer_id is not null and not exists(select 1 from public.customers o where o.profile_id = new.customer_id and o.id <> c.id) then new.customer_id end)
    where c.id = new.customer_ref_id
      and (c.email is null or c.phone is null or c.profile_id is null);
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_syncs_customer on public.appointments;
create trigger appointment_syncs_customer
before insert or update of customer_id, customer_name, customer_email, customer_phone, customer_ref_id, is_private on public.appointments
for each row execute function public.sync_appointment_customer();

-- Bestehende unverknüpfte Termine nachziehen: zuerst über E-Mail, dann über
-- einen exakten, eindeutigen Namen. Keine neuen Kundinnen anlegen.
update public.appointments a set customer_ref_id = c.id
from public.customers c
where a.customer_ref_id is null and not a.is_private
  and a.customer_email is not null and lower(c.email) = lower(btrim(a.customer_email));

update public.appointments a set customer_ref_id = m.id
from (
  select lower(btrim(full_name)) name_key, min(id::text)::uuid id
  from public.customers group by lower(btrim(full_name)) having count(*) = 1
) m
where a.customer_ref_id is null and not a.is_private
  and lower(btrim(a.customer_name)) = m.name_key;
