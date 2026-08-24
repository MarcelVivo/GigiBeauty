-- "Chat mit Foto" zwischen Kundin und Liliane, plus Archiv der
-- Behandlungsergebnis-Fotos. Eine Zeile ist entweder eine Chat-Nachricht
-- (category='chat', z. B. "Diese Nägel möchte ich beim nächsten Mal" +
-- Referenzfoto) oder ein von Liliane hinterlegtes Ergebnisfoto nach einer
-- Behandlung (category='result'). Beides landet im selben Kundenprofil,
-- sichtbar für die Kundin selbst (nur ihr eigenes) und für Liliane (alles).

create table public.customer_media (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  category text not null default 'chat' check (category in ('chat', 'result')),
  sender text not null check (sender in ('customer', 'admin')),
  message text,
  photo_path text,
  created_at timestamptz not null default now(),
  constraint customer_media_has_content check (message is not null or photo_path is not null)
);

create index customer_media_customer_idx on public.customer_media(customer_id, created_at);

alter table public.customer_media enable row level security;

create policy "customer media own or admin read" on public.customer_media for select using (
  public.is_admin()
  or customer_id in (select id from public.customers where profile_id = auth.uid())
);

create policy "customer media own or admin insert" on public.customer_media for insert with check (
  (public.is_admin() and sender = 'admin')
  or (
    sender = 'customer'
    and category = 'chat'
    and customer_id in (select id from public.customers where profile_id = auth.uid())
  )
);

grant select, insert on public.customer_media to authenticated;

-- Privater Speicherplatz für die Fotos. Kein öffentlicher Zugriff -- Anzeige
-- läuft immer über kurzlebige, signierte URLs.
insert into storage.buckets (id, name, public)
values ('customer-photos', 'customer-photos', false)
on conflict (id) do nothing;

create policy "customer photos own or admin read" on storage.objects for select using (
  bucket_id = 'customer-photos'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = (select id::text from public.customers where profile_id = auth.uid() limit 1)
  )
);

create policy "customer photos own or admin insert" on storage.objects for insert with check (
  bucket_id = 'customer-photos'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = (select id::text from public.customers where profile_id = auth.uid() limit 1)
  )
);
