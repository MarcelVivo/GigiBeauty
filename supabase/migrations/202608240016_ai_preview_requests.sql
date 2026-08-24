-- Speichert die gewählten Presets/Farbtöne aus dem GiGi AI Beauty Preview
-- Funnel (nicht die Fotos selbst -- die werden bewusst nie persistiert).
-- Liliane kann so nachschauen, welchen exakten Farbton eine Kundin sich
-- gewünscht hat, um ihn beim echten Termin nachzumischen.

create table public.ai_preview_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  service_type text not null,
  customer_name text,
  preset_label text,
  colors jsonb,
  wish_note text
);

alter table public.ai_preview_requests enable row level security;

create policy "ai preview requests admin read" on public.ai_preview_requests for select using (
  public.is_admin()
);

create policy "ai preview requests public insert" on public.ai_preview_requests for insert with check (true);

grant select on public.ai_preview_requests to authenticated;
grant insert on public.ai_preview_requests to anon, authenticated;
