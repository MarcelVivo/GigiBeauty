-- Bug: Im Kundenportal (pages/booking.html, "Mein Konto") wurde die Liste
-- "meine Termine" ausschliesslich über RLS eingegrenzt, ohne eigenen Filter
-- in der Abfrage selbst. RLS erlaubt Admin-Konten (is_admin()) den Zugriff
-- auf ALLE Termine -- meldet sich also ein Konto an, das zugleich Admin ist
-- (z. B. ein zu Testzwecken genutztes Konto), sieht "Mein Konto" plötzlich
-- den kompletten Kalender aller echten Kundinnen statt nur die eigenen
-- Termine. Die eigentliche Abgrenzung "was ist MEIN Termin" gehört in die
-- Abfrage selbst, nicht implizit in die Admin-Ausnahme der RLS-Policy.
--
-- Ergänzt ausserdem: Termine, die Liliane manuell im Dashboard einträgt und
-- dabei über customer_ref_id mit einem bestehenden CRM-Profil verknüpft,
-- waren für die zugehörige Kundin bisher gar nicht sichtbar (die Policy
-- kannte nur customer_id und customer_email). Das wird hier ergänzt.

drop policy if exists "appointments own or admin read" on public.appointments;
create policy "appointments own or admin read" on public.appointments for select using (
  customer_id = auth.uid()
  or public.is_admin()
  or (
    customer_email is not null
    and lower(customer_email) = lower((select email from public.profiles where id = auth.uid()))
  )
  or customer_ref_id in (select id from public.customers where profile_id = auth.uid())
);
