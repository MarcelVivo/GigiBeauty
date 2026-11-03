# GiGi Beauty · Supabase-Inbetriebnahme

Stand: 1. November 2026 (live unter https://www.gigibeauty.ch, Projekt `itathbojgaofnjntbowu`).
Die Website enthält keine geheimen Schlüssel. Diese Anleitung beschreibt, wie das Backend von Grund auf eingerichtet wird, etwa für ein neues Projekt oder eine Testumgebung.

## 1. Projekt und Datenbank

1. Ein Supabase-Projekt anlegen, Region `eu-west-1` oder eine andere EU-Region.
2. Alle Migrationen in `supabase/migrations/` in aufsteigender Reihenfolge einspielen (derzeit 46 Dateien):

   ```sh
   supabase link --project-ref PROJECT-REF
   supabase db push
   ```

   Alternativ jede Datei einmalig per `supabase db query --linked -f <datei>` ausführen.
   Einmalige Datenbereinigungen mit echten Kundendaten sind bewusst **nicht** im Repository (siehe Kommentar in `202611010005_merge_customers_fix.sql`).
3. In `assets/js/supabase-config.js` die Project URL und den öffentlichen Publishable Key eintragen. Niemals den `service_role` Key in eine Website-Datei schreiben.

## 2. Anmeldung (Authentication)

**URL Configuration**

- Site URL: `https://www.gigibeauty.ch`
- Redirect URLs:
  - `https://www.gigibeauty.ch/pages/booking.html` (Bestätigungslink nach der Registrierung)
  - `https://www.gigibeauty.ch/pages/reset-password.html` (Passwort vergessen, Kundinnen)
  - `https://www.gigibeauty.ch/dashboard/reset-password.html` (Passwort vergessen, Dashboard)

**Providers → Email:** aktiv, «Confirm email» eingeschaltet. Kundenkonten werden erst **nach** der E-Mail-Bestätigung mit der Kundenkartei verknüpft (`link_profile_to_customer()`, Trigger `on_auth_user_confirmed`).

**SMTP (Pflicht im Betrieb):** Custom SMTP über Resend: Host `smtp.resend.com`, Port `465`, Benutzer `resend`, Passwort = Resend-API-Key, Absender `termine@gigibeauty.ch`. Danach unter Rate Limits das E-Mail-Limit auf etwa 100 pro Stunde erhöhen.

**Admin-Zugang:** Liliane registriert sich über die Buchungsseite, danach einmalig:

```sql
update public.profiles set role = 'admin' where email = 'ADRESSE-VON-LILIANE';
```

## 3. Edge Functions und Secrets

| Function | JWT-Prüfung | Zweck |
|---|---|---|
| `process-booking-emails` | ja | verschickt alles aus `email_outbox` über Resend |
| `track-marketing` | **nein** (`--no-verify-jwt`) | Öffnungen/Klicks, Abmelden und Newsletter-Bestätigung (beides per Knopf/POST) |
| `beauty-ai-preview` | ja | KI-Vorschau über OpenAI, nur von `AIP_ALLOWED_ORIGIN`, max. 10 Bilder/Stunde/IP |
| `delete-account` | ja | Kundin löscht ihr Konto selbst (`delete_own_account_data()`, Fotos im Speicher) |
| `calendar` | **nein** (`--no-verify-jwt`) | «In Kalender eintragen»: Termin als .ics (nur Behandlung, Zeit, Adresse) |

```sh
supabase secrets set \
  RESEND_API_KEY=... \
  PROCESS_EMAIL_SECRET=... \
  BOOKING_FROM_EMAIL="GiGi Beauty <termine@gigibeauty.ch>" \
  GOOGLE_REVIEW_URL="https://g.page/r/DEIN-LINK/review" \
  OPENAI_API_KEY=... \
  AIP_ALLOWED_ORIGIN="https://www.gigibeauty.ch"

supabase functions deploy process-booking-emails --use-api
supabase functions deploy track-marketing --use-api --no-verify-jwt
supabase functions deploy beauty-ai-preview --use-api
supabase functions deploy delete-account --use-api
supabase functions deploy calendar --use-api --no-verify-jwt
```

Im OpenAI-Konto ein Monatsbudget mit Warnung setzen.

## 4. Zeitgesteuerte Jobs (pg_cron)

| Job | Zeitplan | Aufgabe |
|---|---|---|
| `process-booking-emails-every-5-min` | jede Minute (`* * * * *`) | POST an `/functions/v1/process-booking-emails` mit `Authorization: Bearer PUBLISHABLE_KEY` und `x-process-secret: PROCESS_EMAIL_SECRET` (im Dashboard unter Integrations → Cron anlegen; enthält das Secret und ist deshalb nicht in einer Migration) |
| `daily-crm-tasks` | täglich 05:00 UTC | `select public.generate_daily_crm_tasks()` (Migration `202611010013`) |
| `apply-opening-hours-schedule` | stündlich (`7 * * * *`) | übernimmt fällige geplante Öffnungszeiten in `opening_hours` (Migration `202611030002`) |

Fehlgeschlagene Mails werden höchstens fünfmal versucht; Fehler stehen in `email_outbox.last_error`.

## 5. Wichtige Einstellungen (`business_settings`)

| Spalte | Live-Wert | Bedeutung |
|---|---|---|
| `cancellation_hours` | 24 | kostenlose Online-Stornierung bis so viele Stunden vorher |
| `reminder_hours` | 24 | Erinnerung so viele Stunden vorher (an die E-Mail am Termin, sonst aus der Kundenkartei) |
| `min_lead_hours` | 2 | Online-Buchung frühestens so viele Stunden im Voraus |
| `max_advance_days` | 180 | Online-Buchung höchstens so viele Tage im Voraus |
| `max_open_bookings` | 3 | höchstens so viele offene Online-Termine pro Konto |
| `opening_hours` / `opening_hours_schedule` | aktuell / ab 2027-01-01 neu | aktuelle Zeiten bzw. geplante Änderungen mit Startdatum; massgebend pro Tag ist `opening_hours_on(datum)` |
| `admin_email` | l.serrano@gmx.ch | Empfängerin der Info-Mails (Buchung, Storno, Verschiebung, Dauer) |

Rechnungen (`invoices.due_at`) sind standardmässig innert 7 Tagen zahlbar.

## 6. Hosting

Statische Website auf Vercel (Projekt `gigi-beauty`, Output-Verzeichnis = Repository-Wurzel), Domain bei Hoststar: `@` A-Record und `www` CNAME auf Vercel, Mail-Einträge (MX `mail.gigibeauty.ch`, SPF, DKIM/Resend, DMARC) bleiben bei Hoststar. Weiterleitungen alter WordPress-Adressen stehen in `vercel.json`. Die PWA besteht aus `manifest.webmanifest`, `dashboard/manifest.webmanifest`, `sw.js` und `offline.html`.

## 7. Nach jeder grösseren Änderung prüfen

- Testkundin registrieren, Bestätigungsmail anklicken, Termin buchen, Bestätigung und Info-Mail an `admin_email` prüfen.
- Termin im Dashboard verschieben, verlängern, stornieren (mit und ohne «Kundin benachrichtigen»).
- «Nicht erschienen» setzen: es entsteht nur ein Rechnungsentwurf; Versand unter Finanzen → Rechnungen → «Senden».
- Newsletter-Anmeldung auf der Startseite: Bestätigungsmail, Knopf «Anmeldung bestätigen», Willkommensmail.
- Unter Database → Backups die Wiederherstellung prüfen.
