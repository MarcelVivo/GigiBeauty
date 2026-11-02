// «In Kalender eintragen»: liefert einen gebuchten Termin als .ics-Datei
// (iPhone/Android/Desktop öffnen sie direkt im Kalender). Aufruf als
// normaler Link ohne Login (--no-verify-jwt); die Termin-ID ist eine
// nicht erratbare UUID, und die Datei enthält keine Personendaten, nur
// Behandlung, Zeit und Adresse.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const icsDate = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

Deno.serve(async (request) => {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!uuidPattern.test(id)) return new Response('Termin nicht gefunden.', { status: 404 });

  const { data } = await db.from('appointments').select('id, starts_at, ends_at, status, is_private, services(name)').eq('id', id).maybeSingle();
  if (!data || data.is_private || data.status !== 'booked') {
    return new Response('Dieser Termin ist nicht mehr gebucht.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const service = (data.services as { name?: string } | null)?.name || 'Behandlung';

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GiGi Beauty//Termin//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${data.id}@gigibeauty.ch`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(data.starts_at)}`,
    `DTEND:${icsDate(data.ends_at)}`,
    `SUMMARY:${icsText(`GiGi Beauty · ${service}`)}`,
    `LOCATION:${icsText('GiGi Beauty, Bierhübeliweg 27, 3012 Bern')}`,
    `DESCRIPTION:${icsText('Kostenlose Stornierung bis 24 Stunden vorher unter https://www.gigibeauty.ch/pages/booking.html\nFragen: info@gigibeauty.ch · +41 76 222 06 63')}`,
    'URL:https://www.gigibeauty.ch/pages/booking.html',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(`GiGi Beauty · ${service}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n') + '\r\n';

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gigibeauty-termin.ics"',
      'Cache-Control': 'no-store'
    }
  });
});
