-- Online-Buchungen bis 6 Monate (180 Tage) im Voraus statt 90.
update public.business_settings set max_advance_days = 180 where id = true;
alter table public.business_settings alter column max_advance_days set default 180;
