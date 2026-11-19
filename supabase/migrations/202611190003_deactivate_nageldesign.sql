-- «Nageldesign (pro Nagel)» bei Gel & Acryl Nails nicht mehr anbieten.
-- Nur deaktivieren, damit bestehende Termine ihre Position behalten.
update public.service_price_items p set active = false
from public.services s
where s.id = p.service_id and s.slug = 'gel-acryl-nails' and p.name = 'Nageldesign (pro Nagel)';
