-- Neue Positionen bei Gel & Acryl Nails (am Ende der Liste):
-- «Künstliche Nägel entfernen» (CHF 50, 60 Min.) und
-- «Nägel Korrektur, gebrochene Nägel» (CHF 15, 15 Min.).
insert into public.service_price_items(service_id, name, price_chf, duration_minutes, sort_order, active)
select s.id, v.name, v.price, v.minutes,
       coalesce((select max(sort_order) from public.service_price_items p where p.service_id = s.id), 0) + v.pos, true
from (values ('Künstliche Nägel entfernen', 50.00, 60, 1),
             ('Nägel Korrektur, gebrochene Nägel', 15.00, 15, 2)) as v(name, price, minutes, pos)
join public.services s on s.slug = 'gel-acryl-nails'
where not exists (select 1 from public.service_price_items p where p.service_id = s.id and p.name = v.name);
