// GiGi AI Beauty Preview -- separate funnel from the 7 static reference
// Vorher/Nachher sliders on the homepage. Takes the customer's own uploaded
// photo plus a free-text wish and returns an edited version of the SAME
// photo (OpenAI image-edit, not a freshly generated different person).
//
// This is its own OpenAI integration, independent of any other project --
// OPENAI_API_KEY here is a GigiBeauty-only Supabase secret.

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ALLOWED_ORIGIN = Deno.env.get('AIP_ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type'
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const IDENTITY_RULES = `Preserve the exact identity of the person in the photo.
Maintain the same facial identity, facial proportions, face shape, eye shape, eye colour, nose, jawline, skin tone, natural skin texture, hairstyle, hair colour, head position, camera perspective, lighting, shadows, framing and background.
Do not generate a different person. Do not beautify or alter unrelated facial features. Do not add, remove or resize any body part.
Modify only the cosmetic attributes explicitly requested below.
The result must look like the exact same photo, taken moments later, with only that specific change applied.`;

type ServiceRule = { label: string; allow: string; disallow: string; extraNote?: string };

const SERVICE_RULES: Record<string, ServiceRule> = {
  'gel-acryl-nails': {
    label: 'Nails',
    allow: 'nail shape, nail length, nail colour, nail art and finish',
    disallow: 'the fingers, hand shape, skin, jewellery, tattoos, background, lighting and perspective. Do not change the number of fingers or add anything to the hand beyond the nails themselves.'
  },
  'permanent-make-up': {
    label: 'Permanent Make-up',
    allow: 'eyebrow shape and tint, lip tint and definition, and eyeliner along the lash line, exactly as requested',
    disallow: 'the underlying face shape, eye shape, nose, jawline, skin texture, hairstyle and age. Keep the result looking natural and subtle, consistent with semi-permanent cosmetic tattooing, not a full make-up look.'
  },
  'kosmetische-pedicure': {
    label: 'Pedicure',
    allow: 'toenail polish colour, toenail shape and nail art/finish on the feet',
    disallow: 'the feet themselves, toe shape, number of toes, skin, background, lighting and perspective.'
  },
  fillers: {
    label: 'Fillers',
    allow: 'a subtle, realistic increase in volume in the specific area requested (e.g. lips, cheeks or jawline contour), within a natural, believable range',
    disallow: 'the overall face shape, eye area, nose, hairstyle, age and skin texture beyond the requested area. Never apply an extreme or exaggerated result.',
    extraNote: 'This is a cosmetic-preview simulation, not a medical rendering -- keep changes moderate and realistic, never exaggerated.'
  },
  lashes: {
    label: 'Lashes',
    allow: 'the eyelashes only -- length, density and curl, exactly as requested',
    disallow: 'eye shape, eye colour, eye position, eyebrows, nose, the rest of the face and hair.'
  },
  'korean-cosmetics': {
    label: 'Korean Cosmetics / Skincare',
    allow: 'skin texture evenness, tone brightness and a healthy natural glow (glass-skin style), as requested',
    disallow: 'facial structure, age, eye shape, nose, jawline and hairstyle. Do not smooth skin into an artificial or plastic look -- keep natural pores and texture, just healthier and more even.'
  },
  'natural-make-up': {
    label: 'Natural Make-up',
    allow: 'foundation, blush, contouring, highlighter, eyeshadow, eyeliner, mascara and lip colour/gloss, exactly as requested',
    disallow: 'the nose, jawline, eye shape, other facial structure, age and hairstyle.'
  }
};

function buildBeautyEditPrompt({ serviceType, userRequest }: { serviceType: string; userRequest: string }) {
  const rule = SERVICE_RULES[serviceType];
  const wish = userRequest?.trim() || 'a tasteful, natural-looking result typical for this treatment';
  return [
    IDENTITY_RULES,
    '',
    `Requested treatment: ${rule.label}.`,
    `Customer's wish: "${wish}".`,
    `You may only change: ${rule.allow}.`,
    `Do not change: ${rule.disallow}`,
    rule.extraNote || ''
  ].filter(Boolean).join('\n');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is missing' }, 500);

  let body: { serviceType?: string; userRequest?: string; image?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const serviceType = String(body?.serviceType || '');
  const rule = SERVICE_RULES[serviceType];
  if (!rule) return json({ error: 'invalid_service' }, 400);

  const image = body?.image;
  if (typeof image !== 'string') return json({ error: 'invalid_image' }, 400);
  const match = image.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!match) return json({ error: 'invalid_image' }, 400);
  const mime = match[1];
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: 'invalid_image' }, 400);
  }
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) return json({ error: 'invalid_image_size' }, 400);

  const userRequest = String(body?.userRequest || '').slice(0, 300);
  const prompt = buildBeautyEditPrompt({ serviceType, userRequest });

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', prompt);
  form.append('size', 'auto');
  form.append('image', new Blob([bytes], { type: mime }), `photo.${mime.split('/')[1]}`);

  let openaiResponse: Response;
  try {
    openaiResponse = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form
    });
  } catch {
    return json({ error: 'openai_unreachable' }, 502);
  }

  if (!openaiResponse.ok) {
    // Deliberately no image bytes or full prompt in logs -- only status and a
    // trimmed error excerpt for debugging.
    const errText = await openaiResponse.text().catch(() => '');
    console.error('beauty-ai-preview: OpenAI error', openaiResponse.status, errText.slice(0, 300));
    return json({ error: 'generation_failed' }, 502);
  }

  const result = await openaiResponse.json().catch(() => null);
  const first = result?.data?.[0];
  const generatedImage = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
  if (!generatedImage) return json({ error: 'generation_failed' }, 502);

  return json({ generatedImage });
});
