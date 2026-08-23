-- Macht Behandlungstexte und Preislisten im Admin-Dashboard editierbar,
-- statt fest in index.html eincodiert zu sein. Die Website liest beides
-- live von hier (Fallback: die bisherigen, statischen Texte bleiben im
-- HTML stehen, falls die Datenbank nicht erreichbar ist).

alter table public.services
  add column if not exists page_description text;

comment on column public.services.page_description is
  'Langtext "Über diese Behandlung" auf der Website, editierbar im Dashboard. NULL = statischer HTML-Fallback greift.';

create table if not exists public.service_price_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 1),
  price_chf numeric(10,2) check (price_chf is null or price_chf >= 0),
  price_label text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_chf is not null or price_label is not null)
);

create index if not exists service_price_items_service_idx on public.service_price_items(service_id, sort_order);

drop trigger if exists service_price_items_set_updated_at on public.service_price_items;
create trigger service_price_items_set_updated_at
before update on public.service_price_items
for each row execute function public.set_updated_at();

-- Aenderungen an Preislisten und Behandlungstexten landen im bestehenden
-- Audit-Log, damit sie im Dashboard wiederhergestellt werden koennen.
drop trigger if exists services_audit on public.services;
create trigger services_audit after insert or update or delete on public.services
for each row execute function public.audit_business_change();
drop trigger if exists service_price_items_audit on public.service_price_items;
create trigger service_price_items_audit after insert or update or delete on public.service_price_items
for each row execute function public.audit_business_change();

alter table public.service_price_items enable row level security;

drop policy if exists "service price items public read" on public.service_price_items;
create policy "service price items public read" on public.service_price_items
for select using (active or public.is_admin());
drop policy if exists "service price items admin write" on public.service_price_items;
create policy "service price items admin write" on public.service_price_items
for all using (public.is_admin()) with check (public.is_admin());

grant select on public.service_price_items to anon, authenticated;
grant insert, update, delete on public.service_price_items to authenticated;

-- ── Bestehende Texte/Preise aus index.html als Startbestand übernehmen ──

update public.services set page_description = 'Ob natürlich, klassisch oder auffällig: Wir gestalten Gel- und Acrylnägel passend zu deinem Stil. Dabei achten wir auf eine saubere Form, sorgfältige Verarbeitung und Materialien, an denen du lange Freude hast.' where slug = 'gel-acryl-nails';
update public.services set page_description = 'Permanent Make-up betont Augenbrauen, Lippen oder Lidlinien und erleichtert deine tägliche Routine. Vor der Behandlung besprechen wir Form, Farbe und gewünschte Wirkung in Ruhe mit dir.' where slug = 'permanent-make-up';
update public.services set page_description = 'Bei der kosmetischen Pedicure pflegen wir Nägel und Haut gründlich und schonend. Du gehst mit gepflegten Füssen und einem angenehm leichten Gefühl nach Hause.' where slug = 'kosmetische-pedicure';
update public.services set page_description = 'Mit Hyaluron-Fillern lassen sich Konturen sanft betonen und Volumen gezielt ausgleichen. In einem persönlichen Beratungsgespräch klären wir, welches Ergebnis zu deinen Wünschen und Gesichtszügen passt.' where slug = 'fillers';
update public.services set page_description = 'Ob dezent oder voller: Wir stimmen Länge, Schwung und Volumen der Wimpern auf deine Augen und deinen Alltag ab. So entsteht ein Ergebnis, das zu dir passt und sich angenehm trägt.' where slug = 'lashes';
update public.services set page_description = 'Unsere Behandlungen mit koreanischer Kosmetik werden auf die Bedürfnisse deiner Haut abgestimmt. Je nach Hautbild stehen Feuchtigkeit, Reinigung, Ausstrahlung oder Pflege im Mittelpunkt.' where slug = 'korean-cosmetics';
update public.services set page_description = 'Für deinen Alltag, ein Event oder deine Hochzeit gestalten wir ein Make-up, das zu dir und zum Anlass passt. Farben und Texturen wählen wir gemeinsam und tragen sie so auf, dass du dich weiterhin wie du selbst fühlst.' where slug = 'natural-make-up';

-- Nur beim allerersten Lauf befuellen (verhindert doppelte Preiszeilen,
-- falls diese Migration versehentlich zweimal ausgefuehrt wird).
insert into public.service_price_items (service_id, name, price_chf, price_label, sort_order)
select v.service_id, v.name, v.price_chf, v.price_label, v.sort_order
from (values
  ((select id from public.services where slug = 'gel-acryl-nails'), 'Neues Set Natural (Gel oder Acryl)', 120, null, 1),
  ((select id from public.services where slug = 'gel-acryl-nails'), 'Neues Set mit French oder Full Cover', 140, null, 2),
  ((select id from public.services where slug = 'gel-acryl-nails'), 'Nageldesign (pro Nagel)', 20, null, 3),
  ((select id from public.services where slug = 'gel-acryl-nails'), 'Auffüllen Natural (Gel oder Acryl)', 90, null, 4),
  ((select id from public.services where slug = 'gel-acryl-nails'), 'Auffüllen mit French oder Full Cover', 100, null, 5),

  ((select id from public.services where slug = 'permanent-make-up'), 'Ombré Augenbrauen', 550, null, 1),
  ((select id from public.services where slug = 'permanent-make-up'), 'Microblading', 450, null, 2),
  ((select id from public.services where slug = 'permanent-make-up'), 'Aquarell Lippen', 500, null, 3),
  ((select id from public.services where slug = 'permanent-make-up'), 'Eyeliner oben', 500, null, 4),
  ((select id from public.services where slug = 'permanent-make-up'), 'Eyeliner unten', 500, null, 5),
  ((select id from public.services where slug = 'permanent-make-up'), 'Auffrischen (ab)', 400, null, 6),

  ((select id from public.services where slug = 'kosmetische-pedicure'), 'Basis Pedicure', 90, null, 1),
  ((select id from public.services where slug = 'kosmetische-pedicure'), 'Spa Pedicure', 100, null, 2),
  ((select id from public.services where slug = 'kosmetische-pedicure'), 'Pedicure inkl. Gelnägel', 150, null, 3),

  ((select id from public.services where slug = 'fillers'), 'Lippen Filler', 350, null, 1),
  ((select id from public.services where slug = 'fillers'), 'Wangen Filler', 450, null, 2),
  ((select id from public.services where slug = 'fillers'), 'Nasolabialfalten', 380, null, 3),
  ((select id from public.services where slug = 'fillers'), 'Kinnkontur', 400, null, 4),
  ((select id from public.services where slug = 'fillers'), 'Beratungsgespräch (wird bei Behandlung angerechnet)', 50, null, 5),

  ((select id from public.services where slug = 'lashes'), 'Neues Set Classic', 120, null, 1),
  ((select id from public.services where slug = 'lashes'), 'Neues Set 4 bis 5D Volume', 150, null, 2),
  ((select id from public.services where slug = 'lashes'), 'Neues Set Mega Volume', 160, null, 3),
  ((select id from public.services where slug = 'lashes'), 'Lash Lifting', null, 'demnächst', 4),
  ((select id from public.services where slug = 'lashes'), 'Auffüllen Classic (bis 3 Wochen)', 90, null, 5),
  ((select id from public.services where slug = 'lashes'), 'Auffüllen 4 bis 5D (bis 3 Wochen)', 120, null, 6),
  ((select id from public.services where slug = 'lashes'), 'Auffüllen Mega Volume (bis 3 Wochen)', 130, null, 7),

  ((select id from public.services where slug = 'korean-cosmetics'), 'Glass Skin Treatment', 160, null, 1),
  ((select id from public.services where slug = 'korean-cosmetics'), 'Brightening Facial', 180, null, 2),
  ((select id from public.services where slug = 'korean-cosmetics'), 'Anti-Aging Ritual', 220, null, 3),
  ((select id from public.services where slug = 'korean-cosmetics'), 'Deep Cleansing', 140, null, 4),
  ((select id from public.services where slug = 'korean-cosmetics'), 'Hyaluron Boost', 240, null, 5),

  ((select id from public.services where slug = 'natural-make-up'), 'Tages Make-up', 100, null, 1),
  ((select id from public.services where slug = 'natural-make-up'), 'Evening Look', 130, null, 2),
  ((select id from public.services where slug = 'natural-make-up'), 'Event Make-up', 150, null, 3),
  ((select id from public.services where slug = 'natural-make-up'), 'Hochzeits Make-up', 300, null, 4),
  ((select id from public.services where slug = 'natural-make-up'), 'Probe Make-up', 100, null, 5),
  ((select id from public.services where slug = 'natural-make-up'), 'Make-up Kurs', 350, null, 6)
) as v(service_id, name, price_chf, price_label, sort_order)
where not exists (select 1 from public.service_price_items limit 1);
