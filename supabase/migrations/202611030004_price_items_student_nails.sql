-- Studentenpreise bei Gel & Acryl Nails: «Neues Set Studenten» nach den
-- Neu-Sets, «Auffüllen Studenten» nach den Auffüll-Positionen.
do $$
declare nails uuid := (select id from public.services where slug = 'gel-acryl-nails');
begin
  if exists (select 1 from public.service_price_items where service_id = nails and name like '%Studenten%') then return; end if;
  update public.service_price_items set sort_order = sort_order + 2 where service_id = nails and sort_order >= 8;
  update public.service_price_items set sort_order = sort_order + 1 where service_id = nails and sort_order between 4 and 7;
  insert into public.service_price_items(service_id, name, price_chf, sort_order, active) values
    (nails, 'Neues Set Studenten (nur mit Ausweis)', 100.00, 4, true),
    (nails, 'Auffüllen Studenten (nur mit Ausweis)', 80.00, 9, true);
end $$;
