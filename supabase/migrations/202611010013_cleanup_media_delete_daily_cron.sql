-- 1) Liliane darf einzelne Chat-Nachrichten/Fotos löschen (DSG-Anfragen).
drop policy if exists "customer media admin delete" on public.customer_media;
create policy "customer media admin delete" on public.customer_media for delete using (public.is_admin());

-- 2) Tägliche CRM-Aufgaben inkl. Geburtstags-/Win-back-Mails liefen nur,
--    wenn das Dashboard geöffnet wurde -> zusätzlich täglich 06:00 UTC per
--    pg_cron. Die Funktion verlangt sonst Admin-Rechte; der Cron-Job läuft
--    als Datenbank-Superuser (session_user = 'postgres') und wird darum
--    zugelassen. Aufrufe über die API (session_user = 'authenticator')
--    brauchen weiterhin is_admin().
do $$
declare def text;
begin
  def := pg_get_functiondef('public.generate_daily_crm_tasks'::regproc);
  if position('session_user' in def) = 0 then
    def := replace(def, 'if not public.is_admin() then raise exception', 'if not public.is_admin() and session_user <> ''postgres'' then raise exception');
    execute def;
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'daily-crm-tasks';
select cron.schedule('daily-crm-tasks', '0 5 * * *', 'select public.generate_daily_crm_tasks()');
