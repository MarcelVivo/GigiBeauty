// Push-Benachrichtigungen für die App (zusätzlich zur E-Mail). iOS geht
// direkt an APNs (Token-Schlüssel .p8), Android über Firebase Cloud
// Messaging (HTTP v1, Service-Account). Fehlen die Secrets, wird still
// übersprungen; ein Push-Fehler hält die E-Mail nie auf.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const apnsKey = Deno.env.get('APNS_KEY_P8') || '';
const apnsKeyId = Deno.env.get('APNS_KEY_ID') || '';
const apnsTeamId = Deno.env.get('APNS_TEAM_ID') || '';
const apnsTopic = Deno.env.get('APNS_BUNDLE_ID') || 'ch.gigibeauty.app';
const firebaseAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '';

export type PushMessage = { title: string; body: string; url: string };
type Device = { token: string; platform: 'ios' | 'android' };

const base64url = (bytes: Uint8Array | string) => {
  const binary = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function pemBytes(pem: string) {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

async function signJwt(header: object, claims: object, key: CryptoKey, algorithm: AlgorithmIdentifier | EcdsaParams) {
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = new Uint8Array(await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(input)));
  return `${input}.${base64url(signature)}`;
}

// APNs-Token gilt bis 60 Minuten; pro Funktionsaufruf einmal erzeugen.
let apnsJwt: { value: string; at: number } | null = null;
async function apnsToken() {
  if (apnsJwt && Date.now() - apnsJwt.at < 40 * 60_000) return apnsJwt.value;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(apnsKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const value = await signJwt({ alg: 'ES256', kid: apnsKeyId }, { iss: apnsTeamId, iat: Math.floor(Date.now() / 1000) }, key, { name: 'ECDSA', hash: 'SHA-256' });
  apnsJwt = { value, at: Date.now() };
  return value;
}

let fcmAccess: { value: string; until: number; project: string } | null = null;
async function fcmToken() {
  if (fcmAccess && Date.now() < fcmAccess.until) return fcmAccess;
  const account = JSON.parse(firebaseAccount);
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt({ alg: 'RS256', typ: 'JWT' }, {
    iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }, key, { name: 'RSASSA-PKCS1-v1_5' });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}: ${await response.text()}`);
  const { access_token, expires_in } = await response.json();
  fcmAccess = { value: access_token, until: Date.now() + (Number(expires_in) - 300) * 1000, project: account.project_id };
  return fcmAccess;
}

// true = Token ungültig (deinstalliert/abgelaufen) und kann weg.
async function sendApns(token: string, message: PushMessage) {
  const body = JSON.stringify({ aps: { alert: { title: message.title, body: message.body }, sound: 'default' }, url: message.url });
  // App-Store-/TestFlight-Builds nutzen die Produktion, Xcode-Builds die Sandbox.
  for (const host of ['api.push.apple.com', 'api.sandbox.push.apple.com']) {
    const response = await fetch(`https://${host}/3/device/${token}`, {
      method: 'POST',
      headers: { authorization: `bearer ${await apnsToken()}`, 'apns-topic': apnsTopic, 'apns-push-type': 'alert', 'apns-priority': '10' },
      body
    });
    if (response.ok) return false;
    const reason = (await response.json().catch(() => ({}))).reason || '';
    if (response.status === 410 || reason === 'Unregistered') return true;
    if (reason !== 'BadDeviceToken') throw new Error(`APNs ${response.status}: ${reason}`);
  }
  return true;
}

async function sendFcm(token: string, message: PushMessage) {
  const access = await fcmToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${access.project}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access.value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      token,
      notification: { title: message.title, body: message.body },
      data: { url: message.url },
      android: { priority: 'high', notification: { color: '#6e384c' } }
    } })
  });
  if (response.ok) return false;
  const text = await response.text();
  if (response.status === 404 || text.includes('UNREGISTERED')) return true;
  throw new Error(`FCM ${response.status}: ${text}`);
}

export async function sendPush(db: SupabaseClient, profileIds: string[], message: PushMessage) {
  if (!profileIds.length) return;
  const { data } = await db.from('push_devices').select('token, platform').in('profile_id', profileIds);
  for (const device of (data || []) as Device[]) {
    const configured = device.platform === 'ios' ? apnsKey && apnsKeyId && apnsTeamId : firebaseAccount;
    if (!configured) continue;
    try {
      const gone = device.platform === 'ios' ? await sendApns(device.token, message) : await sendFcm(device.token, message);
      if (gone) await db.from('push_devices').delete().eq('token', device.token);
    } catch (error) {
      console.error('Push fehlgeschlagen', device.platform, error instanceof Error ? error.message : error);
    }
  }
}
