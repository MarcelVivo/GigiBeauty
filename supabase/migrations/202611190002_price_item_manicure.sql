-- Neue Position bei Gel & Acryl Nails (am Ende der Liste):
-- «Manicure, Pflege der Nägel» (CHF 50, 60 Min.), Nagellack bringt die Kundin mit.
insert into public.service_price_items(service_id, name, price_chf, duration_minutes, sort_order, active)
select s.id, 'Manicure, Pflege der Nägel (gewünschten Nagellack mitbringen)', 50.00, 60,
       coalesce((select max(sort_order) from public.service_price_items p where p.service_id = s.id), 0) + 1, true
from public.services s
where s.slug = 'gel-acryl-nails'
  and not exists (select 1 from public.service_price_items p where p.service_id = s.id and p.name like 'Manicure%');
