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
  kind: 'confirmation' | 'reminder' | 'cancellation' | 'rescheduled' | 'invoice' | 'campaign' | 'aftercare' | 'review' | 'rebooking' | 'winback' | 'birthday' | 'waitlist' | 'registration_invite' | 'newsletter_welcome' | 'ai_preview_followup' | 'owner_notice' | 'newsletter_confirm' | 'chat_reply';
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  payload: Record<string, unknown>;
};

const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (char) => htmlEntities[char]);

function clockTime(value: unknown) {
  return new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)));
}

// "Montag, 01. März 2027 um 10:00–11:30 Uhr" (Endzeit nur, wenn bekannt).
function appointmentRange(start: unknown, end: unknown) {
  return end ? `${appointmentDate(start)}–${clockTime(end)}` : appointmentDate(start);
}

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

// Interne Info an die Inhaberin (Buchung/Storno/Verschiebung), siehe
// 202611010001_owner_booking_notifications.sql.
function ownerNoticeHtml(item: OutboxItem) {
  const p = item.payload;
  const headings: Record<string, string> = { booked: 'Neue Buchung', cancelled: 'Termin storniert', rescheduled: 'Termin verschoben', duration: 'Dauer geändert', account_deleted: 'Konto gelöscht' };
  const row = (label: string, value: unknown) => value ? `<tr><td style="padding:8px 12px 8px 0;color:#8b7d73;font:13px Arial,sans-serif;vertical-align:top">${label}</td><td style="padding:8px 0;font:15px Arial,sans-serif">${esc(value)}</td></tr>` : '';
  if (p.event === 'account_deleted') {
    const cancelled = Number(p.cancelled_count || 0);
    const rows = [
      row('Kundin', p.customer_name),
      row('Stornierte Termine', cancelled ? `${cancelled} (separate Info-Mails)` : 'keine')
    ].join('');
    return `<!doctype html><html><body style="margin:0;background:#f4efe8;color:#2a201b;font-family:Georgia,serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:30px 15px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;background:#fffdf9;border:1px solid #e1d4c2"><tr><td style="padding:34px"><p style="margin:0 0 24px;color:#ae813f;letter-spacing:3px;font-size:12px">GiGi BEAUTY · INTERN</p><h1 style="font-weight:normal;font-size:26px">Konto gelöscht</h1><p style="font:15px/1.5 Arial,sans-serif">Die Kundin hat ihr Konto selbst gelöscht. Login, Karteikarte, Chat und Fotos sind entfernt, vergangene Termine bleiben anonymisiert für die Statistik, Rechnungen bleiben erhalten.</p><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table></td></tr></table></body></html>`;
  }
  const phone = p.customer_phone ? `<a href="tel:${esc(String(p.customer_phone).replace(/\s+/g, ''))}" style="color:#6e384c">${esc(p.customer_phone)}</a>` : '';
  const email = p.customer_email ? `<a href="mailto:${esc(p.customer_email)}" style="color:#6e384c">${esc(p.customer_email)}</a>` : '';
  const rows = [
    row('Kundin', p.customer_name),
    row('Behandlung', p.service || 'Behandlung'),
    row(p.old_starts_at ? 'Neu' : 'Termin', p.starts_at ? `${appointmentRange(p.starts_at, p.ends_at)} Uhr` : ''),
    row('Bisher', p.old_starts_at ? `${appointmentRange(p.old_starts_at, p.old_ends_at)} Uhr` : ''),
    phone ? `<tr><td style="padding:8px 12px 8px 0;color:#8b7d73;font:13px Arial,sans-serif">Telefon</td><td style="padding:8px 0;font:15px Arial,sans-serif">${phone}</td></tr>` : '',
    email ? `<tr><td style="padding:8px 12px 8px 0;color:#8b7d73;font:13px Arial,sans-serif">E-Mail</td><td style="padding:8px 0;font:15px Arial,sans-serif">${email}</td></tr>` : '',
    row('Notiz', p.notes),
    row('Über', p.source === 'dashboard' ? 'Dashboard' : 'Online-Buchung')
  ].join('');
  return `<!doctype html><html><body style="margin:0;background:#f4efe8;color:#2a201b;font-family:Georgia,serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:30px 15px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;background:#fffdf9;border:1px solid #e1d4c2"><tr><td style="padding:34px"><p style="margin:0 0 24px;color:#ae813f;letter-spacing:3px;font-size:12px">GiGi BEAUTY · INTERN</p><h1 style="font-weight:normal;font-size:26px">${esc(headings[String(p.event)] || item.subject)}</h1><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table><p style="margin-top:28px"><a href="https://www.gigibeauty.ch/dashboard/" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">Im Dashboard öffnen</a></p></td></tr></table></td></tr></table></body></html>`;
}

function emailHtml(item: OutboxItem) {
  if (item.kind === 'owner_notice') return ownerNoticeHtml(item);
  const name = esc(item.recipient_name || 'liebe Kundin');
  const service = esc(item.payload.service || 'Behandlung');
  const date = item.payload.starts_at ? appointmentDate(item.payload.starts_at) : '';
  let heading = item.subject;
  let content = '';

  if (item.kind === 'confirmation') {
    content = `<p>Dein Termin ist verbindlich reserviert.</p><p><strong>${service}</strong><br>${esc(date)} Uhr</p><p>Du kannst kostenlos bis 24 Stunden vor dem Termin stornieren. Bei Nichterscheinen ohne rechtzeitige Abmeldung wird die vereinbarte Behandlung in Rechnung gestellt.</p>`;
  } else if (item.kind === 'reminder') {
    content = `<p>Eine kleine Erinnerung an deinen bevorstehenden Termin:</p><p><strong>${service}</strong><br>${esc(date)} Uhr</p><p>Wir freuen uns auf dich!</p>`;
  } else if (item.kind === 'cancellation') {
    content = `<p>Dein Termin für <strong>${service}</strong> am ${esc(date)} Uhr wurde storniert.</p>`;
  } else if (item.kind === 'rescheduled') {
    const range = item.payload.starts_at ? appointmentRange(item.payload.starts_at, item.payload.ends_at) : '';
    content = item.payload.change === 'duration'
      ? `<p>Die Dauer deines Termins wurde angepasst. Dein Termin neu:</p><p><strong>${service}</strong><br>${esc(range)} Uhr</p>`
      : `<p>Dein Termin wurde verschoben. Der neue Termin:</p><p><strong>${service}</strong><br>${esc(range)} Uhr</p>`;
  } else if (item.kind === 'invoice') {
    content = `<p><strong>Rechnung Nr. ${String(item.payload.invoice_number || '').padStart(5, '0')}</strong></p><p>Da der Termin am ${esc(date)} Uhr ohne eine Abmeldung mindestens 24 Stunden vorher nicht wahrgenommen wurde, wird gemäss unseren AGB der vereinbarte Behandlungspreis berechnet.</p><table role="presentation" width="100%" style="margin:22px 0;border-collapse:collapse"><tr><td style="padding:12px;border-top:1px solid #e1d4c2;border-bottom:1px solid #e1d4c2">Nichterscheinen / reservierter Termin</td><td style="padding:12px;border-top:1px solid #e1d4c2;border-bottom:1px solid #e1d4c2;text-align:right"><strong>CHF ${Number(item.payload.amount_chf || 0).toFixed(2)}</strong></td></tr></table><p>Zahlbar bis ${esc(item.payload.due_at)}. Bitte antworte auf diese E-Mail, um die Zahlungsangaben zu erhalten oder falls du Fragen zur Rechnung hast.</p>`;
  } else if (item.kind === 'review') {
    const reviewButton = googleReviewUrl ? `<p><a href="${esc(trackedLink(item, googleReviewUrl))}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">GiGi Beauty bewerten</a></p>` : '';
    content = `<p>${esc(item.payload.content || 'Deine Meinung ist uns wichtig. Wenn du zufrieden warst, freuen wir uns über deine Bewertung.')}</p>${reviewButton}`;
  } else if (['rebooking', 'winback', 'waitlist'].includes(item.kind)) {
    const bookingUrl = esc(trackedLink(item, String(item.payload.booking_url || 'https://www.gigibeauty.ch/pages/booking.html')));
    const appointmentCopy = item.kind === 'waitlist' && date ? `<p><strong>${service}</strong><br>${esc(date)} Uhr</p>` : '';
    content = `<p>${esc(item.payload.content)}</p>${appointmentCopy}<p><a href="${bookingUrl}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">Termin auswählen</a></p>`;
  } else if (item.kind === 'ai_preview_followup') {
    const bookingUrl = esc(trackedLink(item, String(item.payload.booking_url || 'https://www.gigibeauty.ch/pages/booking.html')));
    heading = item.subject;
    content = `<p>${esc(item.payload.content)}</p><p><a href="${bookingUrl}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">Termin buchen</a></p>`;
  } else if (item.kind === 'chat_reply') {
    heading = item.payload.category === 'result' ? 'Neues Behandlungsfoto für dich' : 'Neue Nachricht von Liliane';
    const preview = String(item.payload.preview || '').trim();
    const accountUrl = esc(String(item.payload.account_url || 'https://www.gigibeauty.ch/pages/booking.html?auth=1'));
    content = `${preview ? `<p style="padding:14px 16px;border-left:3px solid #ae813f;background:#f7f1ea">${esc(preview)}${preview.length >= 220 ? ' …' : ''}</p>` : ''}${item.payload.has_photo ? '<p>Liliane hat dir ein Foto geschickt.</p>' : ''}<p>Die ganze Nachricht findest du in deinem Kundenkonto unter «Fotos &amp; Wünsche». Dort kannst du auch direkt antworten.</p><p><a href="${accountUrl}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">Nachricht ansehen</a></p>`;
  } else if (item.kind === 'newsletter_confirm') {
    heading = 'Bitte bestätige deine Anmeldung';
    const confirmUrl = `${marketingTrackingUrl}?event=confirm&id=${encodeURIComponent(item.id)}`;
    content = `<p>${esc(item.payload.content)}</p><p><a href="${esc(confirmUrl)}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">Anmeldung bestätigen</a></p>`;
  } else if (item.kind === 'registration_invite') {
    const registrationUrl = esc(String(item.payload.registration_url || 'https://www.gigibeauty.ch/pages/booking.html?register=1'));
    heading = 'Dein persönliches GiGi Beauty Konto';
    content = `<p>Du kannst deine Termine bei GiGi Beauty neu direkt online verwalten und buchen.</p><p><a href="${registrationUrl}" style="display:inline-block;padding:13px 20px;background:#6e384c;color:#fff;text-decoration:none;border-radius:7px">Konto erstellen</a></p><p style="font:13px Arial,sans-serif;color:#8b7d73">Bitte verwende bei der Registrierung dieselbe Telefonnummer, die bei GiGi Beauty hinterlegt ist. So wird dein bisheriges Kundenprofil automatisch verbunden.</p>`;
  } else {
    heading = item.subject;
    content = `<div style="white-space:pre-line">${esc(item.payload.content)}</div>`;
  }

  const unsubscribeKinds = ['campaign', 'review', 'rebooking', 'winback', 'birthday', 'ai_preview_followup'];
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

// Re-checked at send time (not just when queued 24h earlier): if she booked
// an appointment in the meantime, the nudge is now pointless -- skip it.
// customer_ref_id (not customer_id, which points at profiles/auth users) is
// the appointments column that links to customers.id -- see
// supabase/migrations/202608230002_appointments_customer_link.sql.
async function alreadyBookedSincePreview(item: OutboxItem) {
  if (item.kind !== 'ai_preview_followup') return false;
  const customerId = item.payload.customer_id;
  const queuedAt = item.payload.queued_at;
  if (!customerId || !queuedAt) return false;
  const { data } = await db
    .from('appointments')
    .select('id')
    .eq('customer_ref_id', customerId)
    .in('status', ['booked', 'completed'])
    .gte('created_at', String(queuedAt))
    .limit(1);
  return Boolean(data && data.length);
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
      if (await alreadyBookedSincePreview(item)) {
        await db.from('email_outbox').update({ processed_at: new Date().toISOString(), processing_at: null, last_error: 'Skipped: customer already booked since the preview' }).eq('id', item.id);
        results.push({ id: item.id, status: 'skipped' });
        continue;
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromAddress, to: [item.recipient_email], subject: item.subject, html: emailHtml(item), reply_to: item.kind === 'owner_notice' && item.payload.customer_email ? String(item.payload.customer_email) : 'info@gigibeauty.ch' })
      });
      if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
      await db.from('email_outbox').update({ processed_at: new Date().toISOString(), processing_at: null, last_error: null }).eq('id', item.id);
      await db.from('customer_communications').update({ status: 'sent', occurred_at: new Date().toISOString() }).eq('email_outbox_id', item.id);
      if (['campaign', 'review', 'rebooking', 'winback', 'birthday', 'ai_preview_followup'].includes(item.kind)) {
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
