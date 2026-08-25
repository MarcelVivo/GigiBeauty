/* ─── Beauty Konfigurator (AI look preview) ────────────────────────────────
   Ported from index.html so the customer portal (pages/booking.html) can
   also open this funnel. Trigger it from anywhere on this page with:
     window.openBeautyPreview({})                       // treatment picker
     window.openBeautyPreview({ serviceType: '<slug>' }) // preselected
   or by adding a `data-ai-preview="<slug>"` (or `=""`) attribute to any
   button -- this script wires those up automatically.

   Depends on window.GIGI_SUPABASE (assets/js/supabase-config.js) and the
   Supabase JS SDK, both already loaded on this page. Requires
   assets/css/pages/beauty-konfigurator.css and the #aip-backdrop modal
   markup to be present in the page.

   The "Jetzt Termin buchen" step differs from the homepage version: since
   this already runs on the booking page, it closes the funnel (and the
   account modal, if open) and hands the chosen service to the existing
   booking flow via window.gigiSelectService, instead of navigating to
   pages/booking.html. */

  /* ================================================================
     GiGi AI Beauty Preview -- fully separate from the script above.
     Does not read, write or listen to anything from beforeAfterBySlug,
     #before-after-backdrop, .ba-*, openBeforeAfter/closeBeforeAfter.
     ================================================================ */
  (() => {
    const AIP_SERVICE_META = {
      'gel-acryl-nails': { label: 'Gel & Acryl Nails', hint: 'Foto deiner Hand auswählen (JPG, PNG oder WEBP)', placeholder: 'z. B. Mandelform, milchiges Rosa und feine goldene French Tips' },
      'permanent-make-up': { label: 'Permanent Make-up', hint: 'Foto deines Gesichts auswählen (JPG, PNG oder WEBP)', placeholder: 'z. B. natürlich wirkende Ombré-Augenbrauen in warmem Braun' },
      'kosmetische-pedicure': { label: 'Kosmetische Pedicure', hint: 'Foto deiner Füsse auswählen (JPG, PNG oder WEBP)', placeholder: 'z. B. klassisches Rot mit glänzendem Finish' },
      'fillers': { label: 'Fillers', hint: 'Foto deines Gesichts auswählen (JPG, PNG oder WEBP)', placeholder: 'z. B. dezent mehr Volumen auf den Lippen', disclaimer: true },
      'lashes': { label: 'Lashes', hint: 'Foto deines Gesichts auswählen (JPG, PNG oder WEBP)', placeholder: 'z. B. natürlich, etwas länger und dichter, aber nicht zu stark' },
      'korean-cosmetics': { label: 'Korean Cosmetics', hint: 'Foto deines Gesichts auswählen (JPG, PNG oder WEBP)', placeholder: 'z. B. gesunder Glass-Skin-Glow und ebenmässiger Teint' },
      'natural-make-up': { label: 'Natural Make Up', hint: 'Foto deines Gesichts auswählen (JPG, PNG oder WEBP)', placeholder: 'z. B. natürlicher Glow, dezenter Eyeliner und Nude-Lippen' }
    };
    /* Guided picks per treatment -- presets and colour swatches the customer
       can tap instead of (or in addition to) typing. Selections are combined
       into one free-text instruction before being sent -- the backend prompt
       builder is unchanged, it only ever sees the resulting sentence. */
    const AIP_GUIDED_OPTIONS = {
      'gel-acryl-nails': {
        presets: [
          { label: 'Mandelform Natural', text: 'Mandelform, dezentes glänzendes Finish' },
          { label: 'French Elegance', text: 'Mandelform, klares French mit weisser Spitze, glänzendes Finish' },
          { label: 'Bold Ombré', text: 'Eckige Form, Ombré-Verlauf, mattes Finish' },
          { label: 'Glamour Gold', text: 'Stiletto-Form mit feinen goldenen Akzenten' }
        ],
        colorAreas: [
          { key: 'nagelfarbe', label: 'Nagelfarbe', swatches: [
            { label: 'Milchiges Rosa', hex: '#f3d9d6' },
            { label: 'Nude', hex: '#e3c1a5' },
            { label: 'Klassisches Rot', hex: '#b3202c' },
            { label: 'Schwarz', hex: '#1a1a1a' },
            { label: 'Beere', hex: '#7a2848' },
            { label: 'Pastellblau', hex: '#b7d3e0' },
            { label: 'Weiss', hex: '#f7f3ee' }
          ] },
          { key: 'akzent', label: 'Akzent / Nail Art', swatches: [
            { label: 'Gold', hex: '#c9a24b' },
            { label: 'Silber', hex: '#c7c9cc' },
            { label: 'Weiss', hex: '#ffffff' },
            { label: 'Schwarz', hex: '#1a1a1a' }
          ] }
        ]
      },
      'permanent-make-up': {
        presets: [
          { label: 'Natürliche Augenbrauen', text: 'Ombré-Augenbrauen, weicher Verlauf, natürlich wirkend' },
          { label: 'Definierte Brauen', text: 'Microblading-Optik, klar definierte Haarstriche' },
          { label: 'Aquarell Lippen', text: 'Zarte Aquarell-Lippenpigmentierung' },
          { label: 'Eyeliner', text: 'Feiner Eyeliner entlang des oberen Wimpernkranzes, dezent' }
        ],
        colorAreas: [
          { key: 'augenbrauen', label: 'Augenbrauen-Ton', swatches: [
            { label: 'Warmes Braun', hex: '#8b5a2b' },
            { label: 'Aschbraun', hex: '#6e5a4a' },
            { label: 'Dunkelbraun', hex: '#4a3222' },
            { label: 'Taupe', hex: '#9c8570' }
          ] },
          { key: 'lippen', label: 'Lippen-Ton', swatches: [
            { label: 'Nude-Rosé', hex: '#d9a9a0' },
            { label: 'Rosé', hex: '#c98b7a' },
            { label: 'Warmes Rot', hex: '#a8433a' }
          ] }
        ]
      },
      'kosmetische-pedicure': {
        presets: [
          { label: 'Klassisch Rot', text: 'Klassisches Rot, glänzendes Finish' },
          { label: 'French Pedicure', text: 'Klares French mit weisser Spitze' },
          { label: 'Nude Elegance', text: 'Nude-Ton, mattes Finish' },
          { label: 'Glitzer-Akzent', text: 'Nude-Grundton mit feinem Glitzer-Akzent' }
        ],
        colorAreas: [
          { key: 'nagellack', label: 'Nagellackfarbe', swatches: [
            { label: 'Klassisches Rot', hex: '#b3202c' },
            { label: 'Nude', hex: '#e3c1a5' },
            { label: 'Pastellrosa', hex: '#f3c9d1' },
            { label: 'Schwarz', hex: '#1a1a1a' },
            { label: 'Koralle', hex: '#e2725b' }
          ] }
        ]
      },
      fillers: {
        presets: [
          { label: 'Lippen dezent', text: 'Dezent mehr Volumen auf den Lippen, natürliche Kontur' },
          { label: 'Wangen sanft betont', text: 'Sanfte Betonung der Wangenpartie' },
          { label: 'Kinnkontur', text: 'Harmonische Betonung der Kinnkontur' }
        ]
      },
      lashes: {
        presets: [
          { label: 'Natürlich', text: 'Natürlich, leicht länger, dezente Dichte' },
          { label: 'Mittlere Dichte', text: 'Mittlere Länge und Dichte, weicher Schwung' },
          { label: 'Dramatic Volume', text: 'Deutlich länger und dichter, ausdrucksstarker Schwung' }
        ]
      },
      'korean-cosmetics': {
        presets: [
          { label: 'Glass Skin', text: 'Gesunder Glass-Skin-Glow, ebenmässiger Teint' },
          { label: 'Matte Glow', text: 'Mattierter, aber frischer Teint' },
          { label: 'Dewy Radiance', text: 'Strahlender, taufrischer Glanz' }
        ]
      },
      'natural-make-up': {
        presets: [
          { label: 'Alltag', text: 'Natürlicher Glow, dezenter Eyeliner' },
          { label: 'Abend-Look', text: 'Betonte Augen, definierter Lidstrich' },
          { label: 'Bräutlich', text: 'Zarter, langanhaltender Braut-Look' }
        ],
        colorAreas: [
          { key: 'lidschatten', label: 'Lidschatten', swatches: [
            { label: 'Champagner', hex: '#e8d4b8' },
            { label: 'Roségold', hex: '#d4a373' },
            { label: 'Taupe', hex: '#9c8570' },
            { label: 'Bronze', hex: '#8b5e34' },
            { label: 'Pflaume', hex: '#6b3f5c' },
            { label: 'Rauchgrau', hex: '#6e6a66' }
          ] },
          { key: 'rouge', label: 'Rouge', swatches: [
            { label: 'Pfirsich', hex: '#e8a992' },
            { label: 'Rosé', hex: '#dd8fa0' },
            { label: 'Koralle', hex: '#e2725b' },
            { label: 'Warmes Braun', hex: '#b97a56' }
          ] },
          { key: 'lippen', label: 'Lippen', swatches: [
            { label: 'Nude', hex: '#c98b7a' },
            { label: 'Rosé', hex: '#d98a95' },
            { label: 'Klassisches Rot', hex: '#b3202c' },
            { label: 'Beere', hex: '#7a2848' }
          ] },
          { key: 'eyeliner', label: 'Eyeliner', swatches: [
            { label: 'Schwarz', hex: '#1a1a1a' },
            { label: 'Braun', hex: '#4a3222' },
            { label: 'Dunkelgrau', hex: '#3a3835' }
          ] }
        ]
      }
    };
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const MAX_RAW_BYTES = 15 * 1024 * 1024;
    const AIP_REVEAL_PCT = 14;
    // Visual-only test mode: add ?aip_demo=1 to the page URL to preview the
    // whole generating/sparkle/reveal animation for free, without calling
    // OpenAI. Never active otherwise.
    const AIP_DEMO_MODE = new URLSearchParams(location.search).get('aip_demo') === '1';

    const backdrop = document.getElementById('aip-backdrop');
    if (!backdrop) return;
    const closeButton = document.getElementById('aip-close');
    const serviceTag = document.getElementById('aip-service-tag');
    const startUploadBtn = document.getElementById('aip-start-upload');
    const treatmentField = document.getElementById('aip-treatment-field');
    const treatmentGrid = document.getElementById('aip-treatment-grid');
    const dropzone = document.getElementById('aip-dropzone');
    const dropzoneIcon = document.getElementById('aip-dropzone-icon');
    const dropzoneLabel = document.getElementById('aip-dropzone-label');
    const fileInput = document.getElementById('aip-file-input');
    const wishTextarea = document.getElementById('aip-wish');
    const nameInput = document.getElementById('aip-name');
    const presetField = document.getElementById('aip-preset-field');
    const presetGrid = document.getElementById('aip-preset-grid');
    const colorAreasContainer = document.getElementById('aip-color-areas');
    const generateBtn = document.getElementById('aip-generate');
    const slider = document.getElementById('aip-slider');
    const handle = document.getElementById('aip-handle');
    const wingFill = document.getElementById('aip-wing-fill');
    const sparkleField = document.getElementById('aip-sparkle-field');
    const imageBefore = document.getElementById('aip-image-before');
    const imageAfter = document.getElementById('aip-image-after');
    const generatingCopy = document.getElementById('aip-generating-copy');
    const resultCta = document.getElementById('aip-result-cta');
    const bookButton = document.getElementById('aip-book');
    const retryButton = document.getElementById('aip-retry');
    const errorRetryButton = document.getElementById('aip-error-retry');
    const consentCheckbox = document.getElementById('aip-consent-checkbox');

    let currentSlug = null;
    let originalDataUrl = null;
    let selectedPresetLabel = '';
    let selectedPresetText = '';
    // Keyed by colour-area key -- e.g. { lippen: { areaLabel: 'Lippen', label: 'Rosé', hex: '#d98a95' } }
    let selectedColors = {};
    let busy = false;

    function renderGuidedOptions(slug) {
      const options = AIP_GUIDED_OPTIONS[slug] || {};
      selectedPresetLabel = '';
      selectedPresetText = '';
      selectedColors = {};

      presetGrid.innerHTML = '';
      presetField.hidden = !options.presets?.length;
      (options.presets || []).forEach(preset => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'aip-preset-chip';
        chip.textContent = preset.label;
        chip.addEventListener('click', () => {
          const alreadySelected = chip.classList.contains('is-selected');
          presetGrid.querySelectorAll('.aip-preset-chip').forEach(el => el.classList.remove('is-selected'));
          selectedPresetLabel = alreadySelected ? '' : preset.label;
          selectedPresetText = alreadySelected ? '' : preset.text;
          if (!alreadySelected) chip.classList.add('is-selected');
        });
        presetGrid.appendChild(chip);
      });

      colorAreasContainer.innerHTML = '';
      (options.colorAreas || []).forEach(area => {
        const wrap = document.createElement('div');
        wrap.className = 'aip-field aip-color-area';
        const label = document.createElement('label');
        label.textContent = area.label;
        wrap.appendChild(label);
        const row = document.createElement('div');
        row.className = 'aip-color-row';

        function selectSwatch(el, colorLabel, hex) {
          row.querySelectorAll('.aip-color-swatch').forEach(node => node.classList.remove('is-selected'));
          const alreadySelected = selectedColors[area.key]?.hex === hex;
          if (alreadySelected) {
            delete selectedColors[area.key];
          } else {
            selectedColors[area.key] = { areaLabel: area.label, label: colorLabel, hex };
            el.classList.add('is-selected');
          }
        }

        (area.swatches || []).forEach(color => {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = 'aip-color-swatch';
          swatch.style.setProperty('--swatch-colour', color.hex);
          swatch.setAttribute('aria-label', color.label);
          swatch.title = color.label;
          swatch.addEventListener('click', () => selectSwatch(swatch, color.label, color.hex));
          row.appendChild(swatch);
        });

        // Custom picker -- full colour spectrum via the native browser
        // colour picker, styled as one more swatch in the same row. Its own
        // hex becomes the swatch fill once chosen.
        const customLabel = document.createElement('label');
        customLabel.className = 'aip-color-swatch aip-color-swatch--custom';
        customLabel.title = 'Eigener Farbton';
        customLabel.setAttribute('aria-label', 'Eigener Farbton wählen');
        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.addEventListener('input', () => {
          customLabel.style.setProperty('--swatch-colour', customInput.value);
          customLabel.classList.add('has-custom-colour');
          selectSwatch(customLabel, `Eigener Ton ${customInput.value}`, customInput.value);
        });
        customLabel.appendChild(customInput);
        row.appendChild(customLabel);

        wrap.appendChild(row);
        colorAreasContainer.appendChild(wrap);
      });
    }

    function composedUserRequest() {
      const colourNotes = Object.values(selectedColors).map(c => `${c.areaLabel}: ${c.label} (${c.hex})`);
      return [selectedPresetText, ...colourNotes, wishTextarea.value.trim()]
        .filter(Boolean)
        .join('. ');
    }

    // Fire-and-forget: stores the chosen preset/colours (not the photo) so
    // Liliane can look up exactly which shades a customer picked and use
    // them when mixing products for the real treatment.
    // Only runs when the customer explicitly ticks the consent checkbox and
    // clicks "Foto & Farben an Liliane senden" on the result screen -- never
    // automatically. The photo is uploaded ONLY at this point, specifically
    // because the customer agreed to it; before that, the funnel never
    // persists the photo anywhere (see the OpenAI edit call, which sends it
    // to the Edge Function only for ephemeral processing).
    // Best-effort only: this must never block or delay the customer's
    // booking journey. Runs solely because the consent checkbox on the
    // result screen was ticked -- see the #aip-book handler below.
    async function sendPhotoAndColorsToLiliane() {
      try {
        const CONFIG = window.GIGI_SUPABASE || {};
        if (!window.supabase || !CONFIG?.url || !CONFIG?.anonKey) return;
        const db = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);

        const photoPath = `${crypto.randomUUID()}.jpg`;
        const photoBlob = await (await fetch(originalDataUrl)).blob();
        const { error: uploadError } = await db.storage.from('ai-preview-photos').upload(photoPath, photoBlob, { contentType: 'image/jpeg' });
        if (uploadError) return;

        const colors = {};
        Object.entries(selectedColors).forEach(([key, value]) => { colors[key] = value; });
        await db.from('ai_preview_requests').insert({
          service_type: currentSlug,
          customer_name: nameInput.value.trim() || null,
          preset_label: selectedPresetLabel || null,
          colors: Object.keys(colors).length ? colors : null,
          wish_note: wishTextarea.value.trim() || null,
          photo_path: photoPath
        });
      } catch {
        // Ignored deliberately -- see comment above.
      }
    }

    let oscillating = false;
    let animToken = 0;
    let currentAbort = null;
    let currentPct = 50;

    function setAipSlider(pct) {
      pct = Math.max(0, Math.min(100, pct));
      currentPct = pct;
      imageBefore.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      handle.style.left = pct + '%';
      slider.setAttribute('aria-valuenow', Math.round(pct));

      // Same wing-fill formula as the 7 reference sliders: empty gold rim at
      // one extreme, fully pastel-filled at the other.
      const vividness = (100 - pct) / 100;
      wingFill.style.opacity = vividness.toFixed(2);
      wingFill.style.filter = `saturate(${(15 + vividness * 135).toFixed(0)}%)`;
    }

    function startSparkles() {
      sparkleField.innerHTML = '';
      const count = 48;
      for (let i = 0; i < count; i++) {
        const isParticle = Math.random() < 0.4;
        const el = document.createElement('span');
        el.className = isParticle ? 'aip-particle' : 'aip-spark';
        if (!isParticle) el.textContent = '✦';
        // Scattered across the whole frame -- left and right of the
        // butterfly -- not clustered at the centre.
        el.style.left = `${4 + Math.random() * 92}%`;
        el.style.top = `${6 + Math.random() * 88}%`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 18 + Math.random() * 60;
        el.style.setProperty('--spark-dx', `${Math.cos(angle) * distance}px`);
        el.style.setProperty('--spark-dy', `${Math.sin(angle) * distance}px`);
        el.style.setProperty('--spark-delay', `${(Math.random() * 2.6).toFixed(2)}s`);
        if (!isParticle) el.style.fontSize = `${9 + Math.random() * 10}px`;
        sparkleField.appendChild(el);
      }
    }
    function stopSparkles() {
      sparkleField.innerHTML = '';
    }

    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function tweenAipPct(toPct, duration) {
      const token = ++animToken;
      const fromPct = currentPct;
      return new Promise(resolve => {
        const start = performance.now();
        function frame(now) {
          if (token !== animToken) return resolve();
          const t = Math.min(1, (now - start) / duration);
          setAipSlider(fromPct + (toPct - fromPct) * easeInOutCubic(t));
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });
    }

    async function runOscillation() {
      oscillating = true;
      const waypoints = [94, 6, 90, 10, 96, 4];
      let i = 0;
      while (oscillating) {
        await tweenAipPct(waypoints[i % waypoints.length], 3200 + Math.random() * 700);
        i++;
      }
    }
    function stopOscillation() { oscillating = false; }

    function setFunnelState(next) {
      const panelFor = { intro: 'intro', upload: 'upload', ready: 'upload', generating: 'stage', revealing: 'stage', result: 'stage', error: 'error' };
      document.querySelectorAll('[data-aip-panel]').forEach(panel => { panel.hidden = panel.dataset.aipPanel !== panelFor[next]; });
      generatingCopy.hidden = next !== 'generating';
      resultCta.hidden = next !== 'result';
      slider.classList.toggle('is-live', next === 'result');
      slider.classList.toggle('is-locked', next !== 'result');
      imageBefore.classList.toggle('is-processing', next === 'generating');
    }

    function resetConsent() {
      consentCheckbox.checked = false;
      consentCheckbox.disabled = false;
      bookButton.disabled = false;
      bookButton.textContent = 'Jetzt Termin buchen';
    }

    function updateGenerateAvailability() {
      generateBtn.disabled = !originalDataUrl || busy;
    }

    function resizeImageToDataUrl(file, maxDim, quality) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden.')); };
        img.src = url;
      });
    }

    function preloadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
        img.src = src;
      });
    }

    async function handleFile(file) {
      if (!file) return;
      if (!ALLOWED_TYPES.includes(file.type)) { alert('Bitte ein Foto im Format JPG, PNG oder WEBP auswählen.'); return; }
      if (file.size > MAX_RAW_BYTES) { alert('Das Foto ist zu gross. Bitte ein Foto unter 15 MB auswählen.'); return; }
      try {
        originalDataUrl = await resizeImageToDataUrl(file, 1024, 0.85);
      } catch {
        alert('Dieses Foto konnte nicht gelesen werden. Bitte ein anderes Foto versuchen.');
        return;
      }
      dropzoneIcon.hidden = true;
      dropzoneLabel.hidden = true;
      const existingPreview = dropzone.querySelector('img');
      if (existingPreview) existingPreview.remove();
      const previewImg = document.createElement('img');
      previewImg.src = originalDataUrl;
      previewImg.alt = 'Dein hochgeladenes Foto';
      dropzone.appendChild(previewImg);
      setFunnelState('ready');
      updateGenerateAvailability();
    }

    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    startUploadBtn.addEventListener('click', () => setFunnelState('upload'));

    async function startGenerate() {
      if (busy || !originalDataUrl) return;
      busy = true;
      updateGenerateAvailability();
      currentAbort = new AbortController();
      const timeout = setTimeout(() => currentAbort.abort(), 45000);

      imageAfter.removeAttribute('src');
      imageBefore.src = originalDataUrl;
      setAipSlider(50);
      resetConsent();
      setFunnelState('generating');
      startSparkles();
      runOscillation();

      try {
        let generatedImage;
        if (AIP_DEMO_MODE) {
          // Visual-only test path (?aip_demo=1) -- simulates the wait and
          // reuses the same photo as the "result" so the butterfly/sparkle/
          // reveal animation can be checked without a real, billed OpenAI
          // call. Never used unless that query param is explicitly present.
          await new Promise(resolve => setTimeout(resolve, 16000));
          generatedImage = originalDataUrl;
        } else {
          const CONFIG = window.GIGI_SUPABASE || {};
          const response = await fetch(`${CONFIG.url}/functions/v1/beauty-ai-preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.anonKey}`, apikey: CONFIG.anonKey },
            body: JSON.stringify({ serviceType: currentSlug, userRequest: composedUserRequest().slice(0, 300), image: originalDataUrl }),
            signal: currentAbort.signal
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.generatedImage) throw new Error(payload?.error || 'generation_failed');
          generatedImage = payload.generatedImage;
        }

        await preloadImage(generatedImage);
        stopOscillation();
        stopSparkles();
        imageAfter.src = generatedImage;
        setFunnelState('revealing');
        await tweenAipPct(AIP_REVEAL_PCT, 1400);
        setFunnelState('result');
      } catch (error) {
        stopOscillation();
        stopSparkles();
        setFunnelState('error');
      } finally {
        clearTimeout(timeout);
        currentAbort = null;
        busy = false;
        updateGenerateAvailability();
      }
    }

    generateBtn.addEventListener('click', startGenerate);
    errorRetryButton.addEventListener('click', startGenerate);
    retryButton.addEventListener('click', () => setFunnelState('ready'));

    bookButton.addEventListener('click', async () => {
      if (!currentSlug) return;
      bookButton.disabled = true;
      if (consentCheckbox.checked) {
        bookButton.textContent = 'Wird übermittelt …';
        await sendPhotoAndColorsToLiliane();
      }
      // Already on the booking page (customer portal) -- close this
      // funnel and the account modal (if open), then hand off to the
      // existing booking flow instead of navigating away.
      backdrop.hidden = true;
      document.body.classList.remove('treatment-modal-open');
      const accountModal = document.getElementById('account-modal');
      if (accountModal) accountModal.hidden = true;
      document.body.style.overflow = '';
      if (window.gigiSelectService) window.gigiSelectService(currentSlug);
      document.getElementById('service-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    let dragging = false;
    function pctFromEvent(event) {
      const rect = slider.getBoundingClientRect();
      const x = (event.touches ? event.touches[0].clientX : event.clientX) - rect.left;
      return (x / rect.width) * 100;
    }
    slider.addEventListener('pointerdown', event => {
      if (!slider.classList.contains('is-live')) return;
      dragging = true;
      slider.setPointerCapture(event.pointerId);
      ++animToken;
      setAipSlider(pctFromEvent(event));
    });
    slider.addEventListener('pointermove', event => { if (dragging) setAipSlider(pctFromEvent(event)); });
    slider.addEventListener('pointerup', () => { dragging = false; });
    slider.addEventListener('pointercancel', () => { dragging = false; });
    slider.addEventListener('keydown', event => {
      if (!slider.classList.contains('is-live')) return;
      if (event.key === 'ArrowLeft') { ++animToken; setAipSlider(currentPct - 5); event.preventDefault(); }
      if (event.key === 'ArrowRight') { ++animToken; setAipSlider(currentPct + 5); event.preventDefault(); }
    });

    function resetFunnel() {
      stopOscillation();
      stopSparkles();
      ++animToken;
      if (currentAbort) currentAbort.abort();
      busy = false;
      originalDataUrl = null;
      fileInput.value = '';
      wishTextarea.value = '';
      nameInput.value = '';
      dropzoneIcon.hidden = false;
      dropzoneLabel.hidden = false;
      const preview = dropzone.querySelector('img');
      if (preview) preview.remove();
      imageBefore.removeAttribute('src');
      imageAfter.removeAttribute('src');
      resetConsent();
      setFunnelState('intro');
    }

    function closeAip() {
      backdrop.hidden = true;
      document.body.classList.remove('treatment-modal-open');
      resetFunnel();
    }

    closeButton.addEventListener('click', closeAip);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closeAip(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !backdrop.hidden) closeAip(); });

    function configureForService(serviceType) {
      const meta = AIP_SERVICE_META[serviceType];
      if (!meta) return false;
      currentSlug = serviceType;
      serviceTag.textContent = meta.label;
      dropzoneLabel.textContent = meta.hint;
      wishTextarea.placeholder = meta.placeholder;
      wishTextarea.value = '';
      renderGuidedOptions(serviceType);
      const privacyNote = document.querySelector('[data-aip-panel="upload"] .aip-privacy-note');
      privacyNote.textContent = meta.disclaimer
        ? 'Dein Foto wird ausschliesslich zur Erstellung deiner persönlichen KI-Vorschau verarbeitet und danach nicht dauerhaft gespeichert. KI-generierte Vorschau -- das tatsächliche Behandlungsergebnis kann abweichen.'
        : 'Dein Foto wird ausschliesslich zur Erstellung deiner persönlichen KI-Vorschau verarbeitet und danach nicht dauerhaft gespeichert.';
      return true;
    }

    function renderTreatmentPicker() {
      treatmentGrid.innerHTML = '';
      Object.entries(AIP_SERVICE_META).forEach(([slug, meta]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'aip-preset-chip';
        chip.textContent = meta.label;
        chip.addEventListener('click', () => {
          treatmentGrid.querySelectorAll('.aip-preset-chip').forEach(el => el.classList.remove('is-selected'));
          chip.classList.add('is-selected');
          configureForService(slug);
          startUploadBtn.disabled = false;
        });
        treatmentGrid.appendChild(chip);
      });
    }

    window.openBeautyPreview = function openBeautyPreview({ serviceType } = {}) {
      if (serviceType && configureForService(serviceType)) {
        treatmentField.hidden = true;
        startUploadBtn.disabled = false;
      } else {
        currentSlug = null;
        serviceTag.textContent = '';
        treatmentField.hidden = false;
        renderTreatmentPicker();
        startUploadBtn.disabled = true;
      }
      setFunnelState('intro');
      backdrop.hidden = false;
      document.body.classList.add('treatment-modal-open');
    };

    document.querySelectorAll('[data-ai-preview]').forEach(button => {
      button.addEventListener('click', () => window.openBeautyPreview({ serviceType: button.dataset.aiPreview }));
    });
  })();
