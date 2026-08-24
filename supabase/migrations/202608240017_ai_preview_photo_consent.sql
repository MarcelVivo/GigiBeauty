-- Customers can now explicitly consent (checkbox on the result screen) to
-- send their uploaded photo, together with the chosen colours, to Liliane.
-- Run 202608240016_ai_preview_requests.sql first if you haven't already.

alter table public.ai_preview_requests add column if not exists photo_path text;

-- Private bucket -- never public. Display always goes through short-lived
-- signed URLs (see dashboard.js), same pattern as customer-photos.
insert into storage.buckets (id, name, public)
values ('ai-preview-photos', 'ai-preview-photos', false)
on conflict (id) do nothing;

-- Anonymous visitors upload their own photo only when they explicitly
-- consent; nobody can read it back except an admin (Liliane).
create policy "ai preview photos public insert" on storage.objects for insert with check (
  bucket_id = 'ai-preview-photos'
);

create policy "ai preview photos admin read" on storage.objects for select using (
  bucket_id = 'ai-preview-photos' and public.is_admin()
);
