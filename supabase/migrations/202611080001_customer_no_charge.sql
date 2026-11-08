-- Kundinnen, die nie bezahlen (z. B. lebenslanger Rabatt): ihre Termine
-- bleiben im Kalender und in der Auslastung, zählen aber nicht in Umsatz und
-- Statistik (assets/js/dashboard.js countsInStats()).
alter table public.customers
  add column if not exists no_charge boolean not null default false;

-- Markiert werden Kundinnen im Dashboard (Kundenprofil, Checkbox
-- «Behandlungen kostenlos»), nicht hier: das Repository ist öffentlich.
