-- Neue Preispositionen: Gel Lack (Semi Permanent) bei Gel & Acryl Nails,
-- Gel Fussfrench bei Kosmetische Pedicure (jeweils am Ende der Liste).
insert into public.service_price_items(service_id, name, price_chf, sort_order, active)
select s.id, v.name, v.price, coalesce((select max(sort_order) from public.service_price_items p where p.service_id = s.id), 0) + 1, true
from (values ('gel-acryl-nails', 'Gel Lack (Semi Permanent)', 70.00),
             ('kosmetische-pedicure', 'Gel Fussfrench', 80.00)) as v(slug, name, price)
join public.services s on s.slug = v.slug
where not exists (select 1 from public.service_price_items p where p.service_id = s.id and p.name = v.name);
