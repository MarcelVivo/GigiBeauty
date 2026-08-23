import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY')!;
const cronSecret = Deno.env.get('PROCESS_EMAIL_SECRET');
const fromAddress = Deno.env.get('BOOKING_FROM_EMAIL') || 'GiGi Beauty <termine@gigibeauty.ch>';
const googleReviewUrl = Deno.env.get('GOOGLE_REVIEW_URL') || '';
const marketingTrackingUrl = Deno.env.get('MARKETING_TRACKING_URL') || `${supabaseUrl}/functions/v1/track-marketing`;
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

type OutboxItem = {
  id: string;
  kind: 'confirmation' | 'reminder' | 'cancellation' | 'rescheduled' | 'invoice' | 'campaign' | 'aftercare' | 'review' | 'rebooking' | 'winback' | 'birthday' | 'waitlist' | 'registration_invite';
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  payload: Record<string, unknown>;
};

const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (char) => htmlEntities[char]);

function appointmentDate(value: unknown) {
  return new Intl.DateTimeFormat('de-CH', {
    timeZone: 'Europe/Zurich', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(String(value)));
}

function trackedLink(item: OutboxItem, target: string) {
  try {
    const attributed = new URL(target);
    if (!attributed.searchParams.has('utm_source')) attributed.searchParams.set('utm_source', item.kind === 'waitlist' ? 'waitlist' : 'crm');
    if (!attributed.searchParams.has('utm_medium')) attributed.searchParams.set('utm_medium', 'email');
    if (!attributed.searchParams.has('utm_campaign')) attributed.searchParams.set('utm_campaign', item.kind);
    const tracking = new URL(marketingTrackingUrl);
    tracking.searchParams.set('event', 'click');
    tracking.searchParams.set('id', item.id);
    tracking.searchParams.set('url', attributed.toString());
    return tracking.toString();
  } catch {
    return target;
  }
}

function emailHtml(item: OutboxItem) {
  const name = esc(item.recipient_name || 'liebe Kundin');
  const service = esc(item.payload.service || 'Behandlung');
  const date = item.payload.starts_at ? appointmentDate(item.payload.starts_at) : '';
  let heading = item.subject;
  let content = '';

  if (item.kind === 'confirmation') {
    content = `<p>Dein Termin ist verbindlich reserviert.</p><p><strong>${service}</strong><br>${esc(date)} Uhr</p><p>Du kannst kostenlos bis 12 Stunden vor dem Termin stornieren. Bei Nichterscheinen ohne rechtzeitige Abmeldung wird die vereinbarte Behandlung in Rechnung gestellt.</p>`;
  } else if (item.kind === 'reminder') {
    content = `<p>Eine kleine Erinnerung an deinen bevorstehenden Termin:</p><p><strong>${service}</strong><br>${esc(date)} Uhr</p><p>Wir freuen uns auf dich!</p>`;
  } else if (item.kind === 'cancellation') {
    content = `<p>Dein Termin für <strong>${service}</strong> am ${esc(date)} Uhr wurde storniert.</p>`;
  } else if (item.kind === 'rescheduled') {
    content = `<p>Dein Termin wurde verschoben. Der neue Termin:</p><p><strong>${service}</strong><br>${esc(date)} Uhr</p>`;
  } else if (item.kind === 'invoice') {
    content = `<p><strong>Rechnung Nr. ${String(item.payload.invoice_number || '').padStart(5, '0')}</strong></p><p>Da der Termin am ${esc(date)} Uhr ohne eine Abmeldung mindestens 12 Stunden vorher nicht wahrgenommen wurde, wird gemäss unseren AGB der vereinbarte Behandlungspreis berechnet.</p><table role="presentation" width="100%" style="margin:22px 0;border-collapse:collapse"><tr><td style="padding:12px;border-top:1px solid #e1d4c2;border-bottom:1px solid #e1d4c2">Nichterscheinen / reservierter Termin</td><td style="padding:12px;border-top:1px solid #e1d4c2;border-bottom:1px solid #e1d4c2;text-align:right"><strong>CHF ${Number(item.payload.amount_chf || 0).toFixed(2)}</strong></td></tr></table><p>Zahlbar bis ${esc(item.payload.due_at)}. Bitte antworte auf diese E-Mail, um die Zahlungsangaben zu erhalten oder falls du Fragen zur Rechnung hast.</p>`;
  } else if (item.kind === 'review') {
    const reviewButton = googleReviewUrl ? `<p><a href="${esc(trackedLink(item, googleReviewUrl))}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">GiGi Beauty bewerten</a></p>` : '';
    content = `<p>${esc(item.payload.content || 'Deine Meinung ist uns wichtig. Wenn du zufrieden warst, freuen wir uns über deine Bewertung.')}</p>${reviewButton}`;
  } else if (['rebooking', 'winback', 'waitlist'].includes(item.kind)) {
    const bookingUrl = esc(trackedLink(item, String(item.payload.booking_url || 'https://www.gigibeauty.ch/pages/booking.html')));
    const appointmentCopy = item.kind === 'waitlist' && date ? `<p><strong>${service}</strong><br>${esc(date)} Uhr</p>` : '';
    content = `<p>${esc(item.payload.content)}</p>${appointmentCopy}<p><a href="${bookingUrl}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">Termin auswählen</a></p>`;
  } else if (item.kind === 'registration_invite') {
    const registrationUrl = esc(String(item.payload.registration_url || 'https://www.gigibeauty.ch/pages/booking.html?register=1'));
    heading = 'Dein persönliches GiGi Beauty Konto';
    content = `<p>Du kannst deine Termine bei GiGi Beauty neu direkt online verwalten und buchen.</p><p><a href="${registrationUrl}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">Konto erstellen</a></p><p style="font:13px Arial,sans-serif;color:#8b7d73">Bitte verwende bei der Registrierung dieselbe Telefonnummer, die bei GiGi Beauty hinterlegt ist. So wird dein bisheriges Kundenprofil automatisch verbunden.</p>`;
  } else {
    heading = item.subject;
    content = `<div style="white-space:pre-line">${esc(item.payload.content)}</div>`;
  }

  const unsubscribeKinds = ['campaign', 'review', 'rebooking', 'winback', 'birthday'];
  const unsubscribeUrl = `${marketingTrackingUrl}?event=unsubscribe&id=${encodeURIComponent(item.id)}`;
  const unsubscribe = unsubscribeKinds.includes(item.kind) ? `<p style="color:#8b7d73;font:12px Arial,sans-serif"><a href="${esc(unsubscribeUrl)}" style="color:#8b7d73">Marketing-E-Mails abbestellen</a></p>` : '';
  const trackingPixel = unsubscribeKinds.includes(item.kind) ? `<img src="${esc(marketingTrackingUrl)}?event=open&id=${encodeURIComponent(item.id)}" width="1" height="1" alt="" style="display:block;border:0"/>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4efe8;color:#2a201b;font-family:Georgia,serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:30px 15px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;background:#fffdf9;border:1px solid #e1d4c2"><tr><td style="padding:34px"><p style="margin:0 0 24px;color:#ae813f;letter-spacing:3px;font-size:12px">GiGi BEAUTY · BERN</p><h1 style="font-weight:normal;font-size:26px">${esc(heading)}</h1><p>Hallo ${name},</p>${content}<p style="margin-top:28px">Herzlich,<br><strong>Liliane Serrano</strong><br>GiGi Beauty</p><hr style="border:0;border-top:1px solid #eadfce;margin:28px 0"><p style="color:#8b7d73;font:12px Arial,sans-serif">GiGi Beauty · Bierhübeliweg 27 · 3012 Bern · info@gigibeauty.ch</p>${unsubscribe}${trackingPixel}</td></tr></table></td></tr></table></body></html>`;
}

async function appointmentStillValid(item: OutboxItem) {
  if (item.kind !== 'reminder') return true;
  const appointmentId = item.payload.appointment_id;
  if (!appointmentId) return false;
  const { data } = await db.from('appointments').select('status, starts_at').eq('id', appointmentId).maybeSingle();
  return data?.status === 'booked' && data.starts_at === item.payload.starts_at;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (cronSecret && request.headers.get('x-process-secret') !== cronSecret) return new Response('Forbidden', { status: 403 });
  if (!resendKey) return new Response('RESEND_API_KEY is missing', { status: 500 });

  const { data, error } = await db.rpc('claim_due_emails', { batch_size: 25 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const item of (data || []) as OutboxItem[]) {
    try {
      if (!(await appointmentStillValid(item))) {
        await db.from('email_outbox').update({ processed_at: new Date().toISOString(), processing_at: null, last_error: 'Skipped: appointment changed or cancelled' }).eq('id', item.id);
        results.push({ id: item.id, status: 'skipped' });
        continue;
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromAddress, to: [item.recipient_email], subject: item.subject, html: emailHtml(item), reply_to: 'info@gigibeauty.ch' })
      });
      if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
      await db.from('email_outbox').update({ processed_at: new Date().toISOString(), processing_at: null, last_error: null }).eq('id', item.id);
      await db.from('customer_communications').update({ status: 'sent', occurred_at: new Date().toISOString() }).eq('email_outbox_id', item.id);
      if (['campaign', 'review', 'rebooking', 'winback', 'birthday'].includes(item.kind)) {
        const { data: customer } = await db.from('customers').select('id').ilike('email', item.recipient_email).maybeSingle();
        await db.from('marketing_events').insert({ customer_id: customer?.id || null, campaign_id: item.payload.campaign_id || null, event_type: 'sent', source: item.kind, medium: 'email', metadata: { email_outbox_id: item.id } });
      }
      if (item.kind === 'invoice' && item.payload.invoice_id) {
        await db.from('invoices').update({ status: 'sent' }).eq('id', item.payload.invoice_id);
      }
      if (item.kind === 'campaign' && item.payload.campaign_id) {
        const { count } = await db.from('email_outbox').select('id', { count: 'exact', head: true }).eq('kind', 'campaign').contains('payload', { campaign_id: item.payload.campaign_id }).is('processed_at', null);
        if (count === 0) await db.from('marketing_campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', item.payload.campaign_id);
      }
      results.push({ id: item.id, status: 'sent' });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      await db.from('email_outbox').update({ processing_at: null, last_error: message }).eq('id', item.id);
      results.push({ id: item.id, status: 'error', error: message });
    }
  }
  return Response.json({ processed: results.length, results });
});
