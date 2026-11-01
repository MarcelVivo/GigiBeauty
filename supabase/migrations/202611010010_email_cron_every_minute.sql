-- E-Mail-Versand jede Minute statt alle 5 Minuten: Buchungsbestätigung und
-- Info-Mail an Liliane kamen bis zu 5 Minuten verzögert, was beim Testen
-- wie "keine Mail" wirkte. Der Job selbst (inkl. Secret-Header) wurde im
-- Supabase-Dashboard angelegt und ist darum nicht in einer Migration.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'process-booking-emails-every-5-min'),
  schedule := '* * * * *'
)
where exists (select 1 from cron.job where jobname = 'process-booking-emails-every-5-min');
