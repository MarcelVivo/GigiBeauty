-- Bisher gab es keine Möglichkeit für Liliane zu sehen, OB und WELCHE
-- Kundin eine neue Foto-Chat-Nachricht geschickt hat, ausser jedes einzelne
-- Kundenprofil manuell zu öffnen und nachzuschauen -- in der Praxis
-- unbenutzbar, sobald es mehr als eine Handvoll Kundinnen gibt. Ergänzt
-- eine admin_read_at-Spalte, damit das Dashboard ungelesene
-- Kundennachrichten zentral auflisten und zählen kann.

alter table public.customer_media add column if not exists admin_read_at timestamptz;

grant update on public.customer_media to authenticated;

create policy "customer media admin update" on public.customer_media for update using (
  public.is_admin()
) with check (
  public.is_admin()
);
