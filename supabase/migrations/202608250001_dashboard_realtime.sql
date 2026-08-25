-- Lets the admin dashboard receive live updates (new bookings, new
-- customer chat/photo messages, new AI-preview requests) via Supabase
-- Realtime instead of only refreshing once when the dashboard is opened.
-- See assets/js/dashboard.js (subscribeRealtime).
--
-- Idempotent: safe to run more than once, and safe even if a table is
-- already part of the publication.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_media'
  ) then
    alter publication supabase_realtime add table public.customer_media;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_preview_requests'
  ) then
    alter publication supabase_realtime add table public.ai_preview_requests;
  end if;
end $$;
