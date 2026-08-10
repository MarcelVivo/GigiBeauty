# GiGi Beauty · Supabase-Inbetriebnahme

Die Website enthält keine geheimen Schlüssel. Vor dem Livegang sind diese einmaligen Schritte nötig.

## 1. Projekt und Datenbank

1. Ein Supabase-Projekt anlegen und als Region eine für GiGi Beauty passende Region wählen.
2. Die Migrationen in `supabase/migrations/` in aufsteigender Reihenfolge mit der Supabase CLI (`supabase db push`) oder jeweils einmalig im SQL Editor ausführen:
   - `202608070001_booking_crm.sql`
   - `202608080002_customer_csv_import.sql`
   - `202608080003_high_end_business_suite.sql`
   - `202608080004_customer_registration_invites.sql`
   - `202608080005_crm_task_workflow.sql`
3. In `assets/js/supabase-config.js` die Project URL und den öffentlichen `anon`/Publishable Key einsetzen. Niemals den `service_role` Key in eine Website-Datei schreiben.

## 2. Anmeldung konfigurieren

Unter Authentication → URL Configuration:

- Site URL: `https://www.gigibeauty.ch`
- Redirect URL: `https://www.gigibeauty.ch/pages/booking.html`

E-Mail/Passwort und „Confirm email“ aktivieren. Danach über die Buchungsseite ein Konto für Liliane anlegen und im SQL Editor einmalig zur Administratorin machen:

```sql
update public.profiles
set role = 'admin'
where email = 'info@gigibeauty.ch';
```

Das Dashboard ist danach unter `https://www.gigibeauty.ch/dashboard/` erreichbar. Nur Profile mit `role = 'admin'` erhalten Zugriff; die Prüfung erfolgt zusätzlich in der Datenbank über Row-Level Security.

## 3. Bestätigungen, Erinnerungen und Rechnungs-E-Mails

Die Edge Function verarbeitet Bestätigungen sofort, Erinnerungen standardmässig vier Stunden vorher, Stornierungen, Verschiebungen, No-Show-Rechnungen, Kampagnen sowie Pflege-, Bewertungs-, Wiederbuchungs-, Win-back- und Wartelisten-Nachrichten.

1. Domain `gigibeauty.ch` bei Resend verifizieren und einen API Key erstellen.
2. Secrets setzen:

```sh
supabase secrets set RESEND_API_KEY=... PROCESS_EMAIL_SECRET=... BOOKING_FROM_EMAIL="GiGi Beauty <termine@gigibeauty.ch>" GOOGLE_REVIEW_URL="https://g.page/r/DEIN-LINK/review" MARKETING_TRACKING_URL="https://PROJECT-REF.supabase.co/functions/v1/track-marketing"
```

3. Function deployen:

```sh
supabase functions deploy process-booking-emails
supabase functions deploy track-marketing --no-verify-jwt
```

4. In Supabase Cron einen Job alle fünf Minuten einrichten, der per `POST` folgende URL aufruft:

```text
https://PROJECT-REF.supabase.co/functions/v1/process-booking-emails
```

Header:

```text
Authorization: Bearer PUBLIC_ANON_KEY
x-process-secret: DER_WERT_VON_PROCESS_EMAIL_SECRET
Content-Type: application/json
```

Der Mail-Prozessor versucht fehlgeschlagene Nachrichten höchstens fünfmal. Fehler bleiben mit `last_error` in `email_outbox` sichtbar.

## 4. Vor dem Livegang prüfen

- Sieben Preise unter Table Editor → `services` kontrollieren; diese Preise werden bei No-Show berechnet.
- Im Dashboard unter „Kunden“ den bestehenden Export `GiGi Beauty Kundenexport 03.07.2026 (1).csv` über „CSV importieren“ einlesen. Marketing-Einwilligungen werden nur bei einem eindeutig positiven Exportwert übernommen.
- Öffnungszeiten, 12-Stunden-Frist und Erinnerungszeit in `business_settings` kontrollieren.
- Eine Testkundin registrieren, E-Mail bestätigen und einen freien Termin buchen.
- Prüfen, dass der Termin im Dashboard mit Name, Zeit und Behandlung erscheint und öffentlich ausgegraut ist.
- Termin verschieben, sperren, stornieren und testweise als „Nicht erschienen“ markieren.
- E-Mail-Absender, Rechnungstext und Marketing-Abmeldung mit den tatsächlichen Geschäftsprozessen abstimmen.
- AGB und Datenschutzerklärung vor Veröffentlichung rechtlich prüfen lassen.
- Unter Database → Backups die Wiederherstellungsstrategie prüfen und regelmässig einen externen logischen Export testen.
