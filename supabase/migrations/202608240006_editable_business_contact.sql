-- Öffnungszeiten (business_settings.opening_hours) gab es zwar schon in der
-- Datenbank, aber ohne Bedienoberfläche im Dashboard -- Liliane musste dafür
-- eine SQL-Abfrage ausführen lassen. Telefonnummer, E-Mail und Adresse waren
-- bisher nirgends in der Datenbank, sondern fest im HTML der Website
-- eingetragen. Jetzt lassen sich alle vier direkt im Dashboard pflegen.

alter table public.business_settings
  add column if not exists public_phone text,
  add column if not exists public_email text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text;

update public.business_settings set
  public_phone = coalesce(public_phone, '+41 76 222 06 63'),
  public_email = coalesce(public_email, 'info@gigibeauty.ch'),
  address_line1 = coalesce(address_line1, 'Bierhübeliweg 27'),
  address_line2 = coalesce(address_line2, '3012 Bern')
where id = true;

comment on column public.business_settings.public_phone is 'Für Kundinnen sichtbare Telefonnummer (Website-Fusszeile, tel:-Links).';
comment on column public.business_settings.public_email is 'Für Kundinnen sichtbare E-Mail-Adresse (Website-Fusszeile, mailto:-Links). Getrennt von admin_email, das nur für interne Benachrichtigungen dient.';
