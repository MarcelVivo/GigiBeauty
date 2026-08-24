-- Echte Kundenbewertungen für die Startseite. Das JSON-LD auf der Website
-- behauptet bereits "4.9 Sterne, 50 Bewertungen", ohne dass irgendwo echte
-- Bewertungen zu sehen sind -- das wirkt unglaubwürdig und ist ohne Belege
-- riskant. Liliane pflegt hier eine kleine Auswahl echter Google-Bewertungen
-- im Dashboard; die Startseite zeigt den Bereich nur, wenn mindestens eine
-- aktive Bewertung existiert.

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  rating integer not null check (rating between 1 and 5),
  quote text not null,
  service_name text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.testimonials enable row level security;
create policy "testimonials public read" on public.testimonials for select using (active = true or public.is_admin());
create policy "testimonials admin write" on public.testimonials for all using (public.is_admin()) with check (public.is_admin());

create trigger testimonials_set_updated_at before update on public.testimonials
for each row execute function public.set_updated_at();

create trigger testimonials_audit after insert or update or delete on public.testimonials
for each row execute function public.audit_business_change();
