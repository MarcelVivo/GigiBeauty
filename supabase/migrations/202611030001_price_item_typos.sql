-- Tippfehler in zwei Preispositionen.
update public.service_price_items set name = 'Auffüllen mit Ombre' where name = 'Aufüllen mit Ombre';
update public.service_price_items set name = 'Entfernung vom alten Permanent Make Up' where name = 'Enfernung vom alten Permanent Make Up';
