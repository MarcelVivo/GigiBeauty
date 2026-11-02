// Kundin löscht ihr eigenes Konto («Mein Konto» -> «Konto löschen»).
// Die Datenbank-Seite erledigt delete_own_account_data() (nur service_role);
// hier werden zusätzlich ihre Fotos im Speicher entfernt, was die Kundin
// selbst nicht darf.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigins = ['https://www.gigibeauty.ch', 'https://gigibeauty.ch'];
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    Vary: 'Origin'
  };
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('origin'));
  const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: 'Bitte melde dich erneut an.' }, 401);

  const { data, error } = await db.rpc('delete_own_account_data', { target_profile_id: user.id });
  if (error) return json({ error: error.message }, 400);

  // Fotos erst nach erfolgreicher Löschung der Daten entfernen.
  const removals: Promise<unknown>[] = [];
  const customerId = data?.customer_id as string | null;
  if (customerId) {
    const folder = await db.storage.from('customer-photos').list(customerId, { limit: 1000 });
    const paths = (folder.data || []).map(file => `${customerId}/${file.name}`);
    if (paths.length) removals.push(db.storage.from('customer-photos').remove(paths));
  }
  const previewPaths = ((data?.preview_paths || []) as string[]).filter(Boolean);
  if (previewPaths.length) removals.push(db.storage.from('ai-preview-photos').remove(previewPaths));
  await Promise.all(removals);

  return json({ deleted: true });
});
