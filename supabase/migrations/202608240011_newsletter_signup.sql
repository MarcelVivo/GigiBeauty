-- Eigenständige Newsletter-Anmeldung auf der Website, ohne dass ein Konto
-- nötig ist (bisher gab es die Einwilligung nur im Kundenportal nach dem
-- Einloggen). customers ist admin-only per RLS -- diese Funktion öffnet
-- absichtlich nur einen schmalen, kontrollierten Schreibpfad (nur E-Mail +
-- optional Name, nur die Einwilligung selbst), keinen breiten Zugriff auf
-- die Kundentabelle.

create or replace function public.subscribe_newsletter(requested_email text, requested_name text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(requested_email, '')));
begin
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Bitte eine gültige E-Mail-Adresse angeben.';
  end if;

  insert into public.customers (full_name, email, source, acquisition_source, marketing_consent, marketing_consent_at, marketing_consent_source)
  values (
    coalesce(nullif(trim(requested_name), ''), split_part(normalized_email, '@', 1)),
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
end;
$$;

grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;
