# GiGi Beauty App – Store-Einträge

Zum Hineinkopieren in App Store Connect und die Google Play Console.
Bundle-ID / Paketname: `ch.gigibeauty.app`.

## Gemeinsame Angaben

- **Name:** GiGi Beauty
- **Kategorie:** Lifestyle (Apple: Primär «Lifestyle», sekundär «Gesundheit & Fitness» / Google: «Beauty»)
- **Support-URL:** https://www.gigibeauty.ch/faq.html
- **Marketing-URL:** https://www.gigibeauty.ch
- **Datenschutz-URL:** https://www.gigibeauty.ch/datenschutz.html
- **Kontakt:** info@gigibeauty.ch · +41 76 222 06 63
- **Altersfreigabe:** 4+ (Apple) / «Jugendfreigabe: alle» (Google, Fragebogen: keine Gewalt, keine Glücksspiele, keine nutzergenerierten öffentlichen Inhalte)
- **Preis:** gratis, keine In-App-Käufe, keine Werbung

## App Store (Apple)

**Untertitel** (max. 30 Zeichen):
Beauty-Termine in Bern buchen

**Werbetext** (max. 170 Zeichen):
Dein Termin bei GiGi Beauty in wenigen Sekunden: freie Zeiten sehen, buchen, verschieben und dich 24 Stunden vorher erinnern lassen.

**Schlüsselwörter** (max. 100 Zeichen, mit Komma, ohne Leerzeichen):
Nägel,Gelnägel,Lashes,Pedicure,Permanent Make-up,Kosmetik,Bern,Termin,Beauty,Filler,Wimpern,Studio

**Beschreibung** (= auch Google «Vollständige Beschreibung»):

```
GiGi Beauty ist das Beauty-Studio von Liliane Serrano in Bern. Mit der App buchst du deinen nächsten Termin in wenigen Sekunden, ohne Anruf und ohne Warten.

TERMINE BUCHEN
• Alle freien Zeiten der nächsten sechs Monate auf einen Blick
• Behandlung wählen, Zeit antippen, fertig
• Bestätigung per E-Mail und als Mitteilung in der App

IMMER IM BILD
• Erinnerung 24 Stunden vor deinem Termin
• Termin mit einem Tipp in deinen Kalender eintragen
• Kostenlos verschieben oder stornieren bis 24 Stunden vorher

DEIN KUNDENKONTO
• Alle kommenden und vergangenen Termine
• Fotos und Wünsche direkt an Liliane schicken, Antworten als Mitteilung
• Konto und Daten jederzeit selbst in der App löschen

BEHANDLUNGEN
Gel & Acryl Nails, Kosmetische Pedicure, Lashes, Permanent Make-up, Natural Make-up, Korean Cosmetics und Fillers.

GiGi Beauty · Bierhübeliweg 27 · 3012 Bern
```

**Neuerungen (Version 1.0):** Erste Version der GiGi Beauty App.

**App-Review-Informationen** (Notizen für Apple):

```
GiGi Beauty is the booking app of a beauty studio in Bern, Switzerland (owner: Liliane Serrano). Customers book, reschedule and cancel appointments, receive push notifications for confirmations, 24h reminders and messages from the studio, add appointments to their calendar and can delete their account in-app (Konto > Konto löschen).

Demo account (customer):
E-Mail: <Testkonto-E-Mail>
Passwort: <Testkonto-Passwort>

Please do not book real appointments in the next days; the calendar is the studio's live calendar. You can book a slot several weeks in the future and cancel it again under "Meine Termine".
```

Demo-Konto: Marcel legt es selbst über «Registrieren» an (z. B. mit einer eigenen
Zusatzadresse). Zugangsdaten nur in App Store Connect eintragen, nicht hier
im Repo.

## Google Play

**Kurzbeschreibung** (max. 80 Zeichen):
Beauty-Termine bei GiGi Beauty in Bern buchen, verschieben und erinnern lassen.

**Vollständige Beschreibung:** wie oben (Apple-Beschreibung).

## Datenschutz-Fragebögen

Grundlage: Konto (Name, E-Mail, Telefon), Termine, Chat-Fotos/Nachrichten,
Push-Token. Kein Tracking über Apps hinweg, keine Werbung, keine Weitergabe
an Dritte zu Werbezwecken. Dienstleister: Supabase (Datenbank), Resend
(E-Mail), Apple/Google (Push), OpenAI nur für die freiwillige KI-Vorschau.

### Apple «App-Datenschutz»

Tracking: **Nein**. Alle folgenden Daten «mit der Identität verknüpft»,
Zweck «App-Funktionalität», nicht für Tracking:

| Datentyp | Erhoben | Hinweis |
|---|---|---|
| Kontaktinfo › Name | ja | Konto, Termin |
| Kontaktinfo › E-Mail-Adresse | ja | Konto, Bestätigungen |
| Kontaktinfo › Telefonnummer | ja | Rückfragen zum Termin |
| Benutzerinhalte › Fotos oder Videos | ja | Fotos im Chat, KI-Vorschau (freiwillig) |
| Benutzerinhalte › Andere Benutzerinhalte | ja | Nachrichten/Wünsche an Liliane |
| Kennungen › Benutzer-ID | ja | Konto-ID |
| Kennungen › Geräte-ID | ja | Push-Token |
| Käufe, Standort, Gesundheit, Finanzen, Browserverlauf, Diagnose | nein | |

### Google «Datensicherheit»

- Daten erhoben: ja · Daten weitergegeben (an Dritte): **nein** (Dienstleister zählen nicht)
- Verschlüsselung bei der Übertragung: **ja** · Löschung auf Anfrage: **ja**, in der App unter Konto › Konto löschen; Web: https://www.gigibeauty.ch/pages/booking.html?auth=1
- Persönliche Infos: Name, E-Mail-Adresse, Telefonnummer – erforderlich, App-Funktionalität, Kontoverwaltung
- Fotos und Videos: Fotos – optional, App-Funktionalität
- Nachrichten: Andere In-App-Nachrichten – optional, App-Funktionalität
- App-Aktivitäten: Andere Aktionen (Termine) – erforderlich, App-Funktionalität
- Geräte- oder andere IDs: ja (Push-Token) – optional, App-Funktionalität

## Push einrichten (nach Kontoerstellung)

1. **Apple:** developer.apple.com › Certificates, IDs & Profiles › Keys › «+» ›
   «Apple Push Notifications service (APNs)» → `AuthKey_XXXX.p8` herunterladen
   (nur einmal möglich!), Key ID und Team ID notieren. In Xcode bei
   «Signing & Capabilities» das Team wählen und «Push Notifications» hinzufügen.
2. **Firebase:** console.firebase.google.com › Projekt «GiGi Beauty» › Android-App
   `ch.gigibeauty.app` → `google-services.json` nach `mobile/android/app/`.
   Projekteinstellungen › Dienstkonten › «Neuen privaten Schlüssel generieren».
   Danach in `capacitor.config.json` bei `android` ebenfalls
   `"appendUserAgent": "GiGiBeautyApp push"` setzen.
3. Secrets setzen (siehe SUPABASE_SETUP.md, Abschnitt 3).

## Screenshots

- iPhone 6,9" (1320 × 2868): iPhone 17 Pro Max-Simulator, `xcrun simctl io booted screenshot`
- Android: mind. 2 Screenshots Telefon (z. B. von Lilianes Samsung) + Grafik 1024 × 500
- Motive: Startseite · Behandlungen/Preise · Kalender mit freien Zeiten · Buchung bestätigt · Meine Termine
