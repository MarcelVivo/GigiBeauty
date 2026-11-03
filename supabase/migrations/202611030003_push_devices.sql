-- Push-Benachrichtigungen in der App: Gerätetoken pro Konto (iOS = APNs,
-- Android = FCM). Die App meldet ihr Token nach dem Login über
-- register_push_device(); process-booking-emails schickt zu Termin- und
-- Chat-E-Mails zusätzlich einen Push an die Geräte der Empfängerin bzw. bei
-- owner_notice an die Geräte der Admins. Beim Löschen des Kontos verschwinden
-- die Tokens über on delete cascade.
create table if not exists public.push_devices (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_devices_profile_idx on public.push_devices(profile_id);

alter table public.push_devices enable row level security;
-- Kein direkter Zugriff; nur über die Funktionen unten bzw. service_role.

create or replace function public.register_push_device(device_token text, device_platform text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if device_platform not in ('ios', 'android') or char_length(coalesce(device_token, '')) not between 20 and 4096 then
    raise exception 'Ungültiges Gerät';
  end if;
  -- Ein Gerät gehört immer dem zuletzt angemeldeten Konto.
  insert into public.push_devices (token, profile_id, platform)
  values (device_token, auth.uid(), device_platform)
  on conflict (token) do update set profile_id = excluded.profile_id, platform = excluded.platform, last_seen_at = now();
end;
$$;

create or replace function public.unregister_push_device(device_token text)
returns void
language sql
security definer set search_path = public
as $$
  delete from public.push_devices where token = device_token and profile_id = auth.uid();
$$;

revoke execute on function public.register_push_device(text, text) from public, anon;
revoke execute on function public.unregister_push_device(text) from public, anon;
grant execute on function public.register_push_device(text, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;
