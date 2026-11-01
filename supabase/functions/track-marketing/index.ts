import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const transparentGif = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='), char => char.charCodeAt(0));

function safeRedirect(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(host === 'gigibeauty.ch' || host.endsWith('.gigibeauty.ch') || host === 'g.page' || host === 'google.com' || host.endsWith('.google.com'))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Seiten für Newsletter-Bestätigung und Abmeldung. Ausgelöst wird erst per
// Knopf (POST) -- Mail-Scanner von Outlook & Co. öffnen Links automatisch
// (GET) und dürfen dabei weder an- noch abmelden.
function page(title: string, body: string) {
  return new Response(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} | GiGi Beauty</title></head><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#261b17;color:#f8eee2;font-family:Georgia,serif"><main style="max-width:520px;padding:32px 24px;text-align:center"><h1 style="color:#ddb977;font-weight:400">GiGi Beauty</h1>${body}</main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
function actionPage(text: string, button: string) {
  return page(button, `<p style="font:17px/1.5 system-ui,sans-serif">${text}</p><form method="post"><button type="submit" style="min-height:48px;padding:0 28px;border:0;border-radius:999px;background:#ddb977;color:#261b17;font:600 16px system-ui,sans-serif;cursor:pointer">${button}</button></form>`);
}

Deno.serve(async request => {
  if (!['GET', 'POST'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  const event = url.searchParams.get('event');
  const outboxId = url.searchParams.get('id');
  if (!outboxId || !['open', 'click', 'unsubscribe', 'confirm'].includes(event || '')) return new Response('Ungültiger Link.', { status: 400 });

  if (event === 'confirm') {
    if (request.method === 'GET') return actionPage('Bitte bestätige deine Anmeldung für Neuigkeiten von GiGi Beauty.', 'Anmeldung bestätigen');
    const { data: confirmed } = await db.rpc('confirm_newsletter_subscription', { confirm_outbox_id: outboxId });
    return page('Bestätigt', confirmed
      ? '<p style="font:17px/1.5 system-ui,sans-serif">Danke! Deine Anmeldung ist bestätigt. Du hörst bald von uns.</p>'
      : '<p style="font:17px/1.5 system-ui,sans-serif">Dieser Bestätigungslink ist ungültig oder abgelaufen. Bitte melde dich auf gigibeauty.ch erneut an.</p>');
  }
  if (event === 'unsubscribe' && request.method === 'GET') return actionPage('Möchtest du keine Neuigkeiten und Angebote von GiGi Beauty mehr erhalten? Termin-E-Mails (Bestätigung, Erinnerung) bekommst du weiterhin.', 'Abmelden');
  if (request.method === 'POST' && event !== 'unsubscribe') return new Response('Method not allowed', { status: 405 });

  const { data: outbox } = await db.from('email_outbox').select('id, recipient_email, kind, payload').eq('id', outboxId).maybeSingle();
  if (!outbox) return new Response('Link nicht gefunden.', { status: 404 });
  const { data: customer } = await db.from('customers').select('id').ilike('email', outbox.recipient_email).maybeSingle();
  const campaignId = typeof outbox.payload?.campaign_id === 'string' ? outbox.payload.campaign_id : null;
  const eventType = event === 'open' ? 'opened' : event === 'click' ? 'clicked' : 'unsubscribed';
  await db.from('marketing_events').insert({ customer_id: customer?.id || null, campaign_id: campaignId, event_type: eventType, source: outbox.kind, medium: 'email', metadata: { email_outbox_id: outbox.id } });

  if (event === 'unsubscribe') {
    if (customer?.id) await db.from('customers').update({ marketing_consent: false, do_not_contact: true }).eq('id', customer.id);
    return page('Abgemeldet', '<p style="font:17px/1.5 system-ui,sans-serif">Du wurdest erfolgreich von Marketing-E-Mails abgemeldet.</p>');
  }

  if (event === 'click') {
    const redirect = safeRedirect(url.searchParams.get('url'));
    return redirect ? Response.redirect(redirect, 302) : new Response('Ungültiges Ziel.', { status: 400 });
  }

  return new Response(transparentGif, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store, max-age=0' } });
});
