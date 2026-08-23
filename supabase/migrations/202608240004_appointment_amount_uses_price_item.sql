-- Seit es einzelne Preispositionen mit eigenem Preis gibt (z. B. Permanent
-- Make-up-Positionen zwischen 450 und 600 CHF), hat set_appointment_amount()
-- trotzdem immer nur den einen pauschalen Kategoriepreis (services.price_chf)
-- verwendet und price_item_id komplett ignoriert. Das betrifft ALLE
-- Umsatzzahlen im Dashboard (Monatsumsatz, Umsatzverlauf, Kundenumsatz,
-- Behandlungs-Performance, gebuchtes Potenzial) für jede Kategorie mit
-- unterschiedlich bepreisten Positionen -- der gespeicherte Betrag stimmte
-- nicht mit dem tatsächlich gebuchten Preis überein.
--
-- Ebenso hat create_no_show_invoice() den Pauschalpreis direkt neu
-- nachgeschlagen, statt den (jetzt korrekten) Betrag des Termins zu
-- verwenden -- eine No-Show-Rechnung für eine teure Position wäre mit dem
-- falschen, meist niedrigeren Pauschalpreis ausgestellt worden.

create or replace function public.set_appointment_amount()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  service_price numeric(10,2);
  item_price numeric(10,2);
begin
  if new.is_private or new.service_id is null then
    new.amount_chf := null;
  elsif new.amount_chf is null or (tg_op = 'UPDATE' and (new.service_id is distinct from old.service_id or new.price_item_id is distinct from old.price_item_id or new.discount_chf is distinct from old.discount_chf)) then
    select price_chf into service_price from public.services where id = new.service_id;
    if new.price_item_id is not null then
      select price_chf into item_price from public.service_price_items where id = new.price_item_id;
    end if;
    new.amount_chf := greatest(0, coalesce(item_price, service_price, 0) - coalesce(new.discount_chf, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_set_amount on public.appointments;
create trigger appointments_set_amount before insert or update of service_id, price_item_id, discount_chf, is_private
on public.appointments for each row execute function public.set_appointment_amount();

create or replace function public.create_no_show_invoice()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_invoice_id uuid;
  new_invoice_number bigint;
  new_due_at date;
begin
  if new.status = 'no_show' and old.status is distinct from new.status and not new.is_private then
    insert into public.invoices (
      appointment_id, customer_id, customer_name, customer_email, amount_chf, reason
    ) values (
      new.id, new.customer_id, new.customer_name, new.customer_email, coalesce(new.amount_chf, 0),
      'Nichterscheinen ohne rechtzeitige Abmeldung (mindestens 12 Stunden vorher)'
    ) on conflict (appointment_id) do nothing returning id, invoice_number, due_at into new_invoice_id, new_invoice_number, new_due_at;
    if new_invoice_id is not null and new.customer_email is not null then
      insert into public.email_outbox(kind, recipient_email, recipient_name, subject, payload)
      values ('invoice', new.customer_email, new.customer_name, 'Rechnung von GiGi Beauty',
        jsonb_build_object('invoice_id', new_invoice_id, 'invoice_number', new_invoice_number, 'appointment_id', new.id, 'starts_at', new.starts_at, 'amount_chf', coalesce(new.amount_chf, 0), 'due_at', new_due_at));
    end if;
  end if;
  return new;
end;
$$;

-- Bereits gespeicherte Termine mit eigener Position, deren Betrag noch auf
-- dem alten Pauschalpreis basiert, einmalig korrigieren.
update public.appointments a
set amount_chf = greatest(0, coalesce(pi.price_chf, 0) - coalesce(a.discount_chf, 0))
from public.service_price_items pi
where a.price_item_id = pi.id
  and pi.price_chf is not null
  and not a.is_private
  and a.amount_chf is distinct from greatest(0, coalesce(pi.price_chf, 0) - coalesce(a.discount_chf, 0));
