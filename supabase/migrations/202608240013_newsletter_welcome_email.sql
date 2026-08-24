-- Wer sich neu für den Newsletter anmeldet, soll eine Willkommensmail
-- bekommen ("Willkommen bei GiGi Beauty"). Bisher hat subscribe_newsletter()
-- die Einwilligung nur lautlos gespeichert. Damit bestehende Abonnentinnen
-- bei einer erneuten Anmeldung nicht wiederholt eine Willkommensmail
-- bekommen, wird vorher geprüft, ob schon eine aktive Einwilligung bestand.

alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation','reminder','cancellation','rescheduled','invoice','campaign','aftercare','review',
  'rebooking','winback','birthday','waitlist','registration_invite','newsletter_welcome'
));

create or replace function public.subscribe_newsletter(requested_email text, requested_name text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(requested_email, '')));
  already_subscribed boolean;
  display_name text;
begin
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Bitte eine gültige E-Mail-Adresse angeben.';
  end if;

  select coalesce(marketing_consent, false) into already_subscribed
  from public.customers where email = normalized_email;

  display_name := coalesce(nullif(trim(requested_name), ''), split_part(normalized_email, '@', 1));

  insert into public.customers (full_name, email, source, acquisition_source, marketing_consent, marketing_consent_at, marketing_consent_source)
  values (
    display_name,
    normalized_email,
    'Website',
    'Newsletter',
    true,
    now(),
    'Website Newsletter-Anmeldung'
  )
  on conflict (email) do update set
    marketing_consent = true,
    marketing_consent_at = now(),
    marketing_consent_source = 'Website Newsletter-Anmeldung',
    do_not_contact = false;

  if not coalesce(already_subscribed, false) then
    insert into public.email_outbox (kind, recipient_email, recipient_name, subject, payload)
    values (
      'newsletter_welcome',
      normalized_email,
      display_name,
      'Willkommen bei GiGi Beauty',
      jsonb_build_object('content', 'Schön, dass du dabei bist! Ab jetzt hörst du bei GiGi Beauty zuerst von Neuigkeiten, Aktionen und freien Terminen. Du kannst dich jederzeit über den Abmeldelink in einer unserer E-Mails wieder austragen.')
    );
  end if;
end;
$$;

grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;
