-- Generischer Baustein für frei editierbare Seitentexte (nicht an eine
-- Behandlung gebunden), z. B. die "Über GiGi Beauty" / Liliane-Serrano-Seite.
-- Weitere Seiten lassen sich später einfach durch neue "page"-Werte ergänzen.

create table if not exists public.site_content_blocks (
  id uuid primary key default gen_random_uuid(),
  page text not null,
  block_key text not null,
  label text not null,
  content text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (page, block_key)
);

create index if not exists site_content_blocks_page_idx on public.site_content_blocks(page, sort_order);

drop trigger if exists site_content_blocks_set_updated_at on public.site_content_blocks;
create trigger site_content_blocks_set_updated_at
before update on public.site_content_blocks
for each row execute function public.set_updated_at();

drop trigger if exists site_content_blocks_audit on public.site_content_blocks;
create trigger site_content_blocks_audit after insert or update or delete on public.site_content_blocks
for each row execute function public.audit_business_change();

alter table public.site_content_blocks enable row level security;

drop policy if exists "site content public read" on public.site_content_blocks;
create policy "site content public read" on public.site_content_blocks for select using (true);
drop policy if exists "site content admin write" on public.site_content_blocks;
create policy "site content admin write" on public.site_content_blocks
for all using (public.is_admin()) with check (public.is_admin());

grant select on public.site_content_blocks to anon, authenticated;
grant insert, update, delete on public.site_content_blocks to authenticated;

-- ── Bestehende Texte von ueber-liliane.html als Startbestand übernehmen ──
-- (nur beim allerersten Lauf, verhindert Dubletten bei erneuter Ausführung)
insert into public.site_content_blocks (page, block_key, label, content, sort_order)
select v.page, v.block_key, v.label, v.content, v.sort_order
from (values
  ('ueber-liliane', 'eyebrow',     'Eyebrow (kleiner Text über der Überschrift)', 'GiGi Beauty · Bern', 1),
  ('ueber-liliane', 'subtitle',    'Untertitel', 'Mein Kosmetikstudio in Bern', 2),
  ('ueber-liliane', 'p1',          'Einleitung – Absatz 1', 'Ich bin Liliane Serrano und führe GiGi Beauty seit 2008. In meinem Studio im Herzen von Bern dreht sich alles um gepflegte Nägel, Permanent Make-up und Kosmetik, die zu dir passt.', 3),
  ('ueber-liliane', 'p2',          'Einleitung – Absatz 2', 'Bevor wir beginnen, nehme ich mir Zeit für deine Wünsche und erkläre dir, welche Behandlung sinnvoll ist. Regelmässige Weiterbildungen gehören für mich genauso dazu wie sauberes Arbeiten und ein ehrlicher Blick auf das Ergebnis.', 4),
  ('ueber-liliane', 'p3',          'Einleitung – Absatz 3', 'Schau dir meine Behandlungen in Ruhe an. Wenn du Fragen hast, melde dich gerne bei mir.', 5),
  ('ueber-liliane', 'awardKicker', 'Auszeichnung – Kicker', 'Internationale Auszeichnung', 6),
  ('ueber-liliane', 'awardLead',   'Auszeichnung – Unterzeile', 'Lipstick Effect (Latex), Portugal', 7),
  ('ueber-liliane', 'awardP1',     'Auszeichnung – Absatz 1', 'Am 6. und 7. Juni 2026 durfte ich bei der Weltmeisterschaft in Portugal antreten. In der Kategorie „Lipstick Effect (Latex)“ erreichte ich den 3. Platz. Dieser Moment gehört zu den prägendsten Erfahrungen meiner bisherigen Laufbahn.', 8),
  ('ueber-liliane', 'awardP2',     'Auszeichnung – Absatz 2', 'Hinter diesem Erfolg liegen viele Stunden Arbeit und eine Zeit, die mich beruflich wie privat stark gefordert hat. Es gab Zweifel, Tränen und Momente, in denen Aufgeben der einfachere Weg gewesen wäre. Trotzdem habe ich weitergemacht, gelernt und mich der Herausforderung gestellt.', 9),
  ('ueber-liliane', 'awardP3',     'Auszeichnung – Absatz 3', 'Dass mein Sohn mich zu dieser Meisterschaft begleiten konnte, machte die Reise besonders. Als mein Name aufgerufen wurde, fiel die ganze Anspannung von mir ab. Was blieb, waren Stolz, Freiheit und tiefe Dankbarkeit.', 10),
  ('ueber-liliane', 'awardP4',     'Auszeichnung – Absatz 4 (Dank an Kundinnen)', 'Ich danke allen Kundinnen, die mich unterstützt, mir vertraut und auch in schwierigen Zeiten an mich geglaubt haben. Eure Treue und eure Worte haben mich getragen. Deshalb fühlt sich diese Auszeichnung nicht nur wie mein Erfolg an, sondern wie ein gemeinsamer.', 11),
  ('ueber-liliane', 'awardClosing','Auszeichnung – Schlusssatz', 'Diese Auszeichnung markiert für mich den Beginn eines neuen Kapitels.', 12),
  ('ueber-liliane', 'quote',       'Zitat', '„Die Begeisterung des Herzens ist die Quelle jeder grossen Unternehmung.“ Giuseppe Mazzini', 13),
  ('ueber-liliane', 'p4',          'Erfahrung – Absatz 1', 'Seit 2008 arbeite ich im Herzen von Bern mit Menschen, die Wert auf persönliche Beratung und sorgfältige Behandlungen legen. Diese langjährige Erfahrung prägt meine Arbeit jeden Tag.', 14),
  ('ueber-liliane', 'p5',          'Erfahrung – Absatz 2', 'Meine Schwerpunkte sind Kosmetik, Permanent Make-up und Nageldesign. Mit Aus- und Weiterbildungen halte ich mein Wissen aktuell und entwickle meine Techniken laufend weiter.', 15),
  ('ueber-liliane', 'p6',          'Erfahrung – Absatz 3', 'Im Studio sollst du dich wohl und gut aufgehoben fühlen. Ich behandle unter anderem brüchige oder stark beanspruchte Nägel und unterstütze auch Menschen, die an ihren Nägeln kauen. Dabei richte ich mich nach dem Zustand deiner Nägel und deinem Alltag.', 16),
  ('ueber-liliane', 'p7',          'Erfahrung – Abschluss / Aufruf', 'Du möchtest wissen, welche Behandlung zu dir passt? Buche einen Termin oder nimm direkt Kontakt mit mir auf. Ich freue mich, dich persönlich kennenzulernen.', 17)
) as v(page, block_key, label, content, sort_order)
where not exists (select 1 from public.site_content_blocks limit 1);
