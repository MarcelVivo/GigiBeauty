-- Mittwochnachmittag online nicht mehr buchbar (Öffnungszeit endet 13:00
-- statt 20:30). Sonntag ist bereits gesperrt: opening_hours kennt keinen
-- Eintrag für ISO-Wochentag 7, und create_booking() lehnt Termine ohne
-- passenden Eintrag ab.
--
-- Betrifft nur die öffentliche Online-Buchung (create_booking()). Der
-- Admin kann im Dashboard weiterhin jederzeit Termine eintragen, da die
-- direkte Einfügung in public.appointments diese Prüfung nicht durchläuft.

update public.business_settings
set opening_hours = opening_hours || jsonb_build_object('3', jsonb_build_array('09:00', '13:00'))
where id = true;
