-- Die Migration, die "testimonials" angelegt hat, hat die Row-Level-Security
-- Policies gesetzt, aber die grundlegenden Tabellen-Rechte (GRANT) für die
-- Rollen anon/authenticated vergessen -- ohne die schlägt jede Abfrage schon
-- vor der RLS-Prüfung fehl. Deshalb blieb der Bereich "Was Kundinnen sagen"
-- auf der Website leer, obwohl die Bewertungen bereits in der Tabelle
-- standen.

grant select on public.testimonials to anon, authenticated;
grant insert, update, delete on public.testimonials to authenticated;
