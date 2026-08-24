(() => {
  'use strict';

  const CONFIG = window.GIGI_SUPABASE || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(CONFIG.url || '') && !String(CONFIG.anonKey || '').startsWith('YOUR-');
  const db = configured && window.supabase ? window.supabase.createClient(CONFIG.url, CONFIG.anonKey) : null;
  const TZ = 'Europe/Zurich';
  const SLOT_MINUTES = 90;
  const defaultHours = { 1: ['09:00', '20:30'], 2: ['09:00', '20:30'], 3: ['09:00', '20:30'], 4: ['09:00', '20:30'], 5: ['09:00', '20:30'], 6: ['09:00', '18:00'] };
  const fallbackServices = [
    ['gel-acryl-nails', 'Gel & Acryl Nails', 90, '/public/images/services/Gel&AcrylNails.png'],
    ['permanent-make-up', 'Permanent Make Up', 400, '/public/images/services/PermanentMakeUp.png'],
    ['fillers', 'Fillers', 50, '/public/images/services/Filler.png'],
    ['lashes', 'Lashes', 90, '/public/images/services/Lashes.png'],
    ['kosmetische-pedicure', 'Kosmetische Pedicure', 90, '/public/images/services/KosmetischePedicure.png'],
    ['korean-cosmetics', 'Korean Cosmetics', 140, '/public/images/services/KoreanCosmetics.png'],
    ['natural-make-up', 'Natural Make Up', 100, '/public/images/services/NaturalMakeUp.png']
  ].map((s, index) => ({ id: s[0], slug: s[0], name: s[1], price_chf: s[2], image_path: s[3], sort_order: index + 1 }));
  const serviceAliases = { gelnaegel: 'gel-acryl-nails', 'nail-art': 'gel-acryl-nails', microblading: 'permanent-make-up', 'augenbrauen-tattoo': 'permanent-make-up', 'augenbrauen-styling': 'permanent-make-up', 'kuenstliche-wimpern': 'lashes', 'wimpern-lifting': 'lashes', 'make-up': 'natural-make-up' };
  let pendingServiceSlug = null;

  function bookingAttribution() {
    const params = new URLSearchParams(location.search);
    const current = { source: params.get('utm_source') || params.get('ref') || '', medium: params.get('utm_medium') || '', campaign: params.get('utm_campaign') || '' };
    if (current.source || current.medium || current.campaign) localStorage.setItem('gigi_booking_attribution', JSON.stringify(current));
    try { return JSON.parse(localStorage.getItem('gigi_booking_attribution') || '{}'); } catch { return {}; }
  }

  // Kampagnenquelle direkt beim Einstieg sichern, damit sie auch nach einer
  // E-Mail-Bestätigung oder späteren Rückkehr noch der Buchung zugeordnet wird.
  bookingAttribution();

  const state = {
    view: window.innerWidth < 720 ? 'day' : 'week',
    cursor: startOfDay(new Date()),
    services: [],
    selectedService: null,
    priceItems: [],
    selectedPriceItem: null,
    unavailable: [],
    hours: defaultHours,
    user: null,
    profile: null,
    customerId: null,
    selectedSlot: null,
    authMode: 'login'
  };

  const els = {
    serviceGrid: document.getElementById('service-grid'),
    priceItemPicker: document.getElementById('price-item-picker'),
    priceItemList: document.getElementById('price-item-list'),
    calendar: document.getElementById('calendar-content'),
    calendarTitle: document.getElementById('calendar-title'),
    authButton: document.getElementById('auth-button'),
    authCopy: document.getElementById('auth-copy'),
    authModal: document.getElementById('auth-modal'),
    bookingModal: document.getElementById('booking-modal'),
    accountModal: document.getElementById('account-modal'),
    toast: document.getElementById('toast')
  };

  function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
  function addDays(date, amount) { const d = new Date(date); d.setDate(d.getDate() + amount); return d; }
  function addMonths(date, amount) { const d = new Date(date); d.setMonth(d.getMonth() + amount, 1); return d; }
  function startOfWeek(date) { const d = startOfDay(date); return addDays(d, -((d.getDay() + 6) % 7)); }
  function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function parseDateKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
  function formatDate(date, options) { return new Intl.DateTimeFormat('de-CH', options).format(date); }
  function minutes(time) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
  function timeLabel(total) { return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
  function serviceImageUrl(path) {
    const value = String(path || '').trim();
    if (!value) return '';
    if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
    const siteRelativePath = value.replace(/^(?:\.\.\/|\.\/|\/)+/, '');
    return new URL(`../${siteRelativePath}`, document.baseURI).href;
  }
  function initialService() {
    const requested = pendingServiceSlug || new URLSearchParams(location.search).get('service');
    const slug = serviceAliases[requested] || requested;
    return state.services.find(service => service.slug === slug) || state.services[0];
  }

  function selectServiceBySlug(requestedSlug, scrollBehavior = 'smooth') {
    const slug = serviceAliases[requestedSlug] || requestedSlug;
    const service = state.services.find(item => item.slug === slug);
    if (!service) {
      pendingServiceSlug = slug;
      return;
    }
    pendingServiceSlug = null;
    state.selectedService = service;
    renderServices(scrollBehavior);
  }

  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type !== 'gigi-select-booking-service') return;
    selectServiceBySlug(String(event.data.service || ''));
  });

  function zonedDateTimeToUtc(key, time, timeZone = TZ) {
    const [year, month, day] = key.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const target = Date.UTC(year, month - 1, day, hour, minute);
    let guess = target;
    for (let i = 0; i < 2; i += 1) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date(guess)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
      const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      guess += target - shown;
    }
    return new Date(guess);
  }

  function getRange() {
    if (state.view === 'day') return [startOfDay(state.cursor), addDays(startOfDay(state.cursor), 1)];
    if (state.view === 'week') { const start = startOfWeek(state.cursor); return [start, addDays(start, 7)]; }
    const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return [start, addDays(start, 42)];
  }

  function selectedDurationMinutes() {
    const fromItem = Number(state.selectedPriceItem?.duration_minutes);
    if (fromItem > 0) return fromItem;
    const fromService = Number(state.selectedService?.duration_minutes);
    return fromService > 0 ? fromService : SLOT_MINUTES;
  }

  function createSlots(day) {
    const hours = state.hours[((day.getDay() + 6) % 7) + 1];
    if (!hours) return [];
    const duration = selectedDurationMinutes();
    const slots = [];
    for (let current = minutes(hours[0]); current + duration <= minutes(hours[1]); current += SLOT_MINUTES) {
      const label = timeLabel(current);
      const start = zonedDateTimeToUtc(dateKey(day), label);
      slots.push({ start, end: new Date(start.getTime() + duration * 60000), label });
    }
    return slots;
  }

  function slotStatus(slot) {
    if (slot.start <= new Date()) return 'past';
    const busy = state.unavailable.some(item => slot.start < new Date(item.ends_at) && slot.end > new Date(item.starts_at));
    return busy ? 'unavailable' : 'available';
  }

  async function loadData() {
    if (!db) {
      state.services = fallbackServices;
      state.selectedService = initialService();
      pendingServiceSlug = null;
      renderServices();
      await refreshCalendar();
      return;
    }
    const [{ data: services, error: serviceError }, { data: settings }, { data: priceItems }] = await Promise.all([
      db.from('services').select('*').eq('active', true).order('sort_order'),
      db.from('business_settings').select('*').eq('id', true).maybeSingle(),
      db.from('service_price_items').select('*').eq('active', true).order('sort_order')
    ]);
    if (serviceError) showToast(serviceError.message);
    state.services = services?.length ? services : fallbackServices;
    state.priceItems = priceItems || [];
    state.hours = settings?.opening_hours || defaultHours;
    state.selectedService = initialService();
    pendingServiceSlug = null;
    renderServices();
    await restoreSession();
    await refreshCalendar();
  }

  function renderServices(scrollBehavior = 'auto') {
    els.serviceGrid.innerHTML = state.services.map(service => `
      <button class="service-tile${state.selectedService?.id === service.id ? ' is-selected' : ''}" type="button" data-service-id="${escapeHtml(service.id)}" aria-pressed="${state.selectedService?.id === service.id}">
        <img src="${escapeHtml(serviceImageUrl(service.image_path))}" alt="" loading="lazy" decoding="async">
        <span>${escapeHtml(service.name)}<small>CHF ${Number(service.price_chf || 0).toFixed(0)}</small></span>
      </button>`).join('');
    els.serviceGrid.querySelectorAll('[data-service-id]').forEach(button => button.addEventListener('click', () => {
      state.selectedService = state.services.find(s => s.id === button.dataset.serviceId);
      renderServices('smooth');
    }));
    renderPriceItemPicker();

    if (window.innerWidth <= 720) {
      requestAnimationFrame(() => {
        const selected = els.serviceGrid.querySelector('.service-tile.is-selected');
        if (!selected) return;
        const left = selected.offsetLeft - (els.serviceGrid.clientWidth - selected.offsetWidth) / 2;
        els.serviceGrid.scrollTo({ left: Math.max(0, left), behavior: scrollBehavior });
      });
    }
  }

  // Positions within a category can have very different durations (e.g. a
  // Permanent-Make-up touch-up vs. a full Ombré session), so the calendar
  // needs to know exactly which one is selected before it can compute
  // available slots.
  function renderPriceItemPicker() {
    if (!els.priceItemPicker || !els.priceItemList) return;
    const items = state.priceItems
      .filter(item => item.service_id === state.selectedService?.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    if (!items.length) {
      els.priceItemPicker.hidden = true;
      state.selectedPriceItem = null;
      return;
    }

    if (!state.selectedPriceItem || !items.some(item => item.id === state.selectedPriceItem.id)) {
      state.selectedPriceItem = items[0];
    }

    els.priceItemPicker.hidden = false;
    els.priceItemList.innerHTML = items.map(item => {
      const priceText = item.price_chf != null ? `CHF ${Number(item.price_chf).toFixed(0)}` : (item.price_label || '');
      const duration = Number(item.duration_minutes) > 0 ? Number(item.duration_minutes) : Number(state.selectedService?.duration_minutes) || SLOT_MINUTES;
      return `<button class="price-item-pill${state.selectedPriceItem?.id === item.id ? ' is-selected' : ''}" type="button" data-price-item-id="${escapeHtml(item.id)}" aria-pressed="${state.selectedPriceItem?.id === item.id}">
        ${escapeHtml(item.name)}<small>${duration} Min.${priceText ? ' · ' + escapeHtml(priceText) : ''}</small>
      </button>`;
    }).join('');
    els.priceItemList.querySelectorAll('[data-price-item-id]').forEach(button => button.addEventListener('click', () => {
      state.selectedPriceItem = items.find(item => item.id === button.dataset.priceItemId) || null;
      renderPriceItemPicker();
      refreshCalendar();
    }));
  }

  async function refreshCalendar() {
    els.calendar.innerHTML = '<div class="calendar-loading">Freie Termine werden geladen.</div>';
    const [start, end] = getRange();
    state.unavailable = [];
    if (db) {
      const { data, error } = await db.rpc('get_unavailable_slots', { range_start: start.toISOString(), range_end: end.toISOString() });
      if (error) showToast(`Der Kalender konnte nicht geladen werden: ${error.message}`);
      else state.unavailable = data || [];
    }
    renderCalendar();
  }

  function renderCalendar() {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === state.view));
    if (state.view === 'day') renderDay();
    else if (state.view === 'week') renderWeek();
    else renderMonth();
    bindSlots();
  }

  function slotButton(slot) {
    const status = slotStatus(slot);
    const disabled = status !== 'available';
    return `<button class="slot is-${status}" type="button" data-slot="${slot.start.toISOString()}" ${disabled ? 'disabled' : ''}>
      <span>${slot.label}</span><span>${status === 'available' ? 'frei' : status === 'past' ? 'vorbei' : 'belegt'}</span>
    </button>`;
  }

  function renderDay() {
    const day = startOfDay(state.cursor);
    const slots = createSlots(day);
    const isWednesday = day.getDay() === 3;
    els.calendarTitle.textContent = formatDate(day, { day: '2-digit', month: 'long', year: 'numeric' });
    els.calendar.innerHTML = `<div class="day-view">
      <div class="day-view-head"><h2>${formatDate(day, { weekday: 'long' })}</h2><p>${slots.length ? 'Wähle eine passende Uhrzeit.' : 'An diesem Tag bleibt das Studio geschlossen.'}</p></div>
      <div class="slot-list day-slots">${slots.map(slotButton).join('')}${isWednesday && slots.length ? '<div class="closed-day">Mittwoch Nachmittag geschlossen</div>' : ''}</div>
    </div>`;
  }

  function renderWeek() {
    const start = startOfWeek(state.cursor);
    const end = addDays(start, 6);
    els.calendarTitle.textContent = `${formatDate(start, { day: '2-digit', month: 'short' })} bis ${formatDate(end, { day: '2-digit', month: 'short', year: 'numeric' })}`;
    els.calendar.innerHTML = `<div class="week-grid">${Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const slots = createSlots(day);
      const afternoonNote = day.getDay() === 3 && slots.length ? '<div class="closed-day">Mittwoch Nachmittag geschlossen</div>' : '';
      return `<div class="week-day"><div class="week-day-head"><strong>${formatDate(day, { weekday: 'short' })}</strong><span>${formatDate(day, { day: '2-digit', month: '2-digit' })}</span></div>
        <div class="slot-list">${slots.length ? slots.map(slotButton).join('') : '<div class="closed-day">geschlossen</div>'}${afternoonNote}</div></div>`;
    }).join('')}</div>`;
  }

  function renderMonth() {
    const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const today = dateKey(new Date());
    els.calendarTitle.textContent = formatDate(first, { month: 'long', year: 'numeric' });
    els.calendar.innerHTML = `
      <div class="weekday-row">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => `<div>${d}</div>`).join('')}</div>
      <div class="month-grid">${Array.from({ length: 42 }, (_, i) => {
        const day = addDays(gridStart, i);
        const slots = createSlots(day);
        const free = slots.filter(s => slotStatus(s) === 'available').length;
        const outside = day.getMonth() !== first.getMonth();
        return `<button class="month-day${outside ? ' is-outside' : ''}${dateKey(day) === today ? ' is-today' : ''}" type="button" data-day="${dateKey(day)}" ${!slots.length || day < startOfDay(new Date()) ? 'disabled' : ''}>
          <span class="day-number">${day.getDate()}</span>
          <span class="availability-badge${free ? '' : ' is-full'}" data-count="${free ? `${free} frei` : 'voll'}">${free ? `${free} freie Termine` : 'ausgebucht'}</span>
        </button>`;
      }).join('')}</div>`;
    els.calendar.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => {
      state.cursor = parseDateKey(button.dataset.day);
      state.view = 'day';
      refreshCalendar();
    }));
  }

  function bindSlots() {
    els.calendar.querySelectorAll('[data-slot]:not(:disabled)').forEach(button => button.addEventListener('click', () => selectSlot(new Date(button.dataset.slot))));
  }

  function selectSlot(start) {
    if (!state.selectedService) return showToast('Bitte zuerst eine Behandlung wählen.');
    state.selectedSlot = start;
    if (!db) return showToast('Bitte zuerst die Supabase-Zugangsdaten in supabase-config.js eintragen.');
    if (!state.user) return openModal(els.authModal);
    openBookingModal();
  }

  function openBookingModal() {
    const summary = document.getElementById('booking-summary');
    const duration = selectedDurationMinutes();
    const treatmentName = state.selectedPriceItem
      ? `${state.selectedService.name} – ${state.selectedPriceItem.name}`
      : state.selectedService.name;
    const priceText = state.selectedPriceItem
      ? (state.selectedPriceItem.price_chf != null ? `CHF ${Number(state.selectedPriceItem.price_chf).toFixed(2)}` : (state.selectedPriceItem.price_label || 'auf Anfrage'))
      : `CHF ${Number(state.selectedService.price_chf || 0).toFixed(2)}`;
    summary.innerHTML = `<strong>${escapeHtml(treatmentName)}</strong>${formatDate(state.selectedSlot, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}<br>${formatDate(state.selectedSlot, { hour: '2-digit', minute: '2-digit' })} bis ${formatDate(new Date(state.selectedSlot.getTime() + duration * 60000), { hour: '2-digit', minute: '2-digit' })} Uhr<br>Preis: ${escapeHtml(priceText)}`;
    document.getElementById('booking-phone').value = state.profile?.phone || '';
    document.getElementById('booking-message').textContent = '';
    openModal(els.bookingModal);
  }

  async function restoreSession() {
    const { data } = await db.auth.getSession();
    await setUser(data.session?.user || null);
    db.auth.onAuthStateChange((_event, session) => setTimeout(() => setUser(session?.user || null), 0));
  }

  async function setUser(user) {
    state.user = user;
    state.profile = null;
    state.customerId = null;
    if (user) {
      const { data } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
      state.profile = data;
      const { data: customerRow } = await db.from('customers').select('id').eq('profile_id', user.id).maybeSingle();
      state.customerId = customerRow?.id || null;
      els.authCopy.innerHTML = `Angemeldet als<strong>${escapeHtml(data?.full_name || user.email)}</strong>`;
      els.authButton.textContent = 'Abmelden';
      document.getElementById('my-appointments').hidden = false;
    } else {
      els.authCopy.innerHTML = 'Noch nicht angemeldet<strong>Zum Buchen brauchst du ein Konto</strong>';
      els.authButton.textContent = 'Anmelden';
      document.getElementById('my-appointments').hidden = true;
    }
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    document.querySelectorAll('[data-auth-mode]').forEach(tab => tab.classList.toggle('is-active', tab.dataset.authMode === mode));
    document.querySelectorAll('.signup-only').forEach(field => { field.hidden = mode !== 'signup'; });
    document.querySelectorAll('.login-only').forEach(field => { field.hidden = mode !== 'login'; });
    document.getElementById('auth-submit').textContent = mode === 'signup' ? 'Konto erstellen' : 'Anmelden';
    document.getElementById('auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    document.getElementById('auth-phone').required = mode === 'signup';
    document.getElementById('auth-message').className = 'form-message';
    document.getElementById('auth-message').textContent = '';
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!db) return;
    const message = document.getElementById('auth-message');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    message.textContent = 'Einen Moment bitte.';
    if (state.authMode === 'signup') {
      const fullName = document.getElementById('auth-name').value.trim();
      if (fullName.length < 2) { message.textContent = 'Bitte Vor- und Nachname angeben.'; return; }
      if (document.getElementById('auth-phone').value.replace(/\D/g, '').length < 9) { message.textContent = 'Bitte gib eine gültige Telefonnummer an. So können wir dein Kundenprofil sicher zuordnen.'; return; }
      const { data, error } = await db.auth.signUp({
        email, password,
        options: { emailRedirectTo: new URL('booking.html', location.href).href, data: { full_name: fullName, phone: document.getElementById('auth-phone').value.trim(), marketing_consent: document.getElementById('auth-marketing').checked } }
      });
      if (error) { message.textContent = error.message; return; }
      if (!data.session) {
        message.className = 'form-message success';
        message.textContent = 'Bitte bestätige dein Konto über den Link in deiner E-Mail.';
      } else {
        closeModal(els.authModal);
        showToast('Dein Konto wurde erstellt.');
        if (state.selectedSlot) openBookingModal();
      }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) { message.textContent = error.message; return; }
      closeModal(els.authModal);
      showToast('Erfolgreich angemeldet.');
      if (state.selectedSlot) openBookingModal();
    }
  }

  async function submitBooking(event) {
    event.preventDefault();
    const message = document.getElementById('booking-message');
    message.textContent = 'Wir reservieren deinen Termin.';
    const { data: appointmentId, error } = await db.rpc('book_appointment', {
      requested_service_id: state.selectedService.id,
      requested_start: state.selectedSlot.toISOString(),
      requested_phone: document.getElementById('booking-phone').value.trim() || null,
      requested_notes: document.getElementById('booking-notes').value.trim() || null,
      requested_price_item_id: state.selectedPriceItem?.id || null
    });
    if (error) { message.textContent = error.message; await refreshCalendar(); return; }
    const attribution = bookingAttribution();
    if (appointmentId && (attribution.source || attribution.medium || attribution.campaign)) {
      await db.rpc('record_booking_attribution', { requested_appointment_id: appointmentId, requested_source: attribution.source || null, requested_medium: attribution.medium || null, requested_campaign: attribution.campaign || null });
    }
    closeModal(els.bookingModal);
    document.getElementById('booking-form').reset();
    state.selectedSlot = null;
    await refreshCalendar();
    showToast('Dein Termin ist bestätigt. Die Bestätigung kommt per E-Mail.');
  }

  const APPOINTMENT_STATUS_LABEL = { booked: 'Gebucht', completed: 'Abgeschlossen', cancelled: 'Storniert', no_show: 'Nicht erschienen' };

  async function openAccount() {
    const upcomingList = document.getElementById('account-upcoming');
    const pastList = document.getElementById('account-past');
    upcomingList.innerHTML = '<div class="calendar-loading" style="min-height:120px">Termine werden geladen.</div>';
    pastList.innerHTML = '';
    openModal(els.accountModal);

    const newsletter = document.getElementById('account-newsletter');
    newsletter.checked = Boolean(state.profile?.marketing_consent);
    document.getElementById('account-newsletter-message').textContent = '';

    const { data, error } = await db.from('appointments').select('id, starts_at, status, services(name)').eq('is_private', false).order('starts_at', { ascending: false });
    if (error) { upcomingList.innerHTML = `<div class="account-empty">${escapeHtml(error.message)}</div>`; return; }
    const now = Date.now();
    const upcoming = (data || []).filter(item => item.status === 'booked' && new Date(item.starts_at).getTime() >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const past = (data || []).filter(item => item.status !== 'booked' || new Date(item.starts_at).getTime() < now);

    upcomingList.innerHTML = upcoming.length ? upcoming.map(item => {
      const canCancel = new Date(item.starts_at).getTime() - now >= 12 * 60 * 60 * 1000;
      return `<div class="account-appointment"><div><strong>${escapeHtml(item.services?.name || 'Behandlung')}</strong><span>${formatDate(new Date(item.starts_at), { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })} Uhr</span></div>${canCancel ? `<button class="small-button" type="button" data-cancel-own="${item.id}">Stornieren</button>` : '<span>Bitte direkt kontaktieren</span>'}</div>`;
    }).join('') : '<div class="account-empty">Du hast keine kommenden Termine.</div>';
    upcomingList.querySelectorAll('[data-cancel-own]').forEach(button => button.addEventListener('click', () => cancelOwnAppointment(button.dataset.cancelOwn)));

    pastList.innerHTML = past.length ? past.map(item => {
      return `<div class="account-appointment"><div><strong>${escapeHtml(item.services?.name || 'Behandlung')}</strong><span>${formatDate(new Date(item.starts_at), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span></div><span>${escapeHtml(APPOINTMENT_STATUS_LABEL[item.status] || item.status)}</span></div>`;
    }).join('') : '<div class="account-empty">Noch keine vergangenen Termine.</div>';

    loadCustomerMedia();
  }

  async function signedPhotoUrl(path) {
    const { data } = await db.storage.from('customer-photos').createSignedUrl(path, 3600);
    return data?.signedUrl || '';
  }

  async function loadCustomerMedia() {
    const chatEl = document.getElementById('account-chat');
    const galleryEl = document.getElementById('account-gallery');
    if (!state.customerId) { chatEl.innerHTML = ''; galleryEl.innerHTML = ''; return; }
    chatEl.innerHTML = '<div class="account-chat-empty">Wird geladen ...</div>';
    galleryEl.innerHTML = '';

    const { data, error } = await db.from('customer_media').select('*').eq('customer_id', state.customerId).order('created_at');
    if (error) { chatEl.innerHTML = `<div class="account-chat-empty">${escapeHtml(error.message)}</div>`; return; }
    const rows = data || [];
    const chatRows = rows.filter(row => row.category === 'chat');
    const resultRows = rows.filter(row => row.category === 'result');

    chatEl.innerHTML = chatRows.length ? '' : '<div class="account-chat-empty">Noch keine Nachrichten. Schreib Liliane deinen Wunsch!</div>';
    for (const row of chatRows) {
      const bubble = document.createElement('div');
      bubble.className = `account-chat-bubble is-${row.sender}`;
      let html = row.message ? `<p>${escapeHtml(row.message)}</p>` : '';
      if (row.photo_path) {
        const url = await signedPhotoUrl(row.photo_path);
        if (url) html += `<img src="${url}" alt="" loading="lazy">`;
      }
      html += `<time>${formatDate(new Date(row.created_at), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>`;
      bubble.innerHTML = html;
      chatEl.appendChild(bubble);
    }
    chatEl.scrollTop = chatEl.scrollHeight;

    if (!resultRows.length) {
      galleryEl.innerHTML = '<div class="account-chat-empty">Noch keine Behandlungsfotos hinterlegt.</div>';
    } else {
      for (const row of resultRows) {
        if (!row.photo_path) continue;
        const url = await signedPhotoUrl(row.photo_path);
        if (!url) continue;
        const img = document.createElement('img');
        img.src = url;
        img.alt = row.message || '';
        img.loading = 'lazy';
        img.title = row.message || formatDate(new Date(row.created_at), { day: '2-digit', month: '2-digit', year: 'numeric' });
        galleryEl.appendChild(img);
      }
    }
  }

  async function sendChatMessage(event) {
    event.preventDefault();
    if (!state.customerId) return;
    const message = document.getElementById('account-chat-message');
    const text = document.getElementById('account-chat-text').value.trim();
    const fileInput = document.getElementById('account-chat-photo');
    const file = fileInput.files[0];
    if (!text && !file) { message.textContent = 'Bitte einen Text oder ein Foto angeben.'; return; }
    message.textContent = 'Wird gesendet ...';

    let photo_path = null;
    if (file) {
      photo_path = `${state.customerId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await db.storage.from('customer-photos').upload(photo_path, file);
      if (uploadError) { message.textContent = uploadError.message; return; }
    }

    const { error } = await db.from('customer_media').insert({
      customer_id: state.customerId,
      category: 'chat',
      sender: 'customer',
      message: text || null,
      photo_path
    });
    if (error) { message.textContent = error.message; return; }

    message.textContent = '';
    document.getElementById('account-chat-form').reset();
    document.getElementById('account-chat-filename').textContent = '';
    loadCustomerMedia();
  }

  async function saveNewsletterConsent() {
    const message = document.getElementById('account-newsletter-message');
    const checked = document.getElementById('account-newsletter').checked;
    message.textContent = 'Wird gespeichert.';
    const { error } = await db.from('profiles').update({ marketing_consent: checked }).eq('id', state.user.id);
    if (error) { message.textContent = error.message; return; }
    if (state.profile) state.profile.marketing_consent = checked;
    message.textContent = 'Gespeichert.';
    setTimeout(() => { message.textContent = ''; }, 3000);
  }

  async function cancelOwnAppointment(id) {
    if (!confirm('Diesen Termin verbindlich stornieren?')) return;
    const { error } = await db.rpc('cancel_own_appointment', { appointment_id: id });
    if (error) return showToast(error.message);
    showToast('Dein Termin wurde storniert. Die Bestätigung kommt per E-Mail.');
    await refreshCalendar();
    await openAccount();
  }

  function openModal(modal) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (document.documentElement.classList.contains('booking-embed')) {
      window.parent.postMessage({ type: 'gigi-booking-modal-open' }, window.location.origin);
    }
    setTimeout(() => modal.querySelector('input, button')?.focus(), 0);
  }
  function closeModal(modal) { modal.hidden = true; document.body.style.overflow = ''; }
  let toastTimer;
  function showToast(text) { els.toast.textContent = text; els.toast.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 5000); }

  document.getElementById('calendar-prev').addEventListener('click', () => { state.cursor = state.view === 'day' ? addDays(state.cursor, -1) : state.view === 'week' ? addDays(state.cursor, -7) : addMonths(state.cursor, -1); refreshCalendar(); });
  document.getElementById('calendar-next').addEventListener('click', () => { state.cursor = state.view === 'day' ? addDays(state.cursor, 1) : state.view === 'week' ? addDays(state.cursor, 7) : addMonths(state.cursor, 1); refreshCalendar(); });
  document.getElementById('calendar-today').addEventListener('click', () => { state.cursor = startOfDay(new Date()); refreshCalendar(); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; refreshCalendar(); }));
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.modal-backdrop'))));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop); }));
  document.getElementById('auth-form').addEventListener('submit', submitAuth);
  document.getElementById('auth-forgot-password').addEventListener('click', async () => {
    const message = document.getElementById('auth-message');
    const email = document.getElementById('auth-email').value.trim();
    if (!email) { message.textContent = 'Bitte zuerst deine E-Mail-Adresse eingeben.'; return; }
    message.className = 'form-message';
    message.textContent = 'Der Link wird verschickt.';
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: new URL('reset-password.html', location.href).href });
    if (error) { message.textContent = error.message; return; }
    message.className = 'form-message success';
    message.textContent = 'Falls ein Konto mit dieser E-Mail-Adresse besteht, wurde ein Link zum Zurücksetzen verschickt. Bitte auch den Spam-Ordner prüfen.';
  });
  document.getElementById('booking-form').addEventListener('submit', submitBooking);
  els.authButton.addEventListener('click', async () => {
    if (state.user) { await db.auth.signOut(); showToast('Du bist abgemeldet.'); }
    else openModal(els.authModal);
  });
  document.getElementById('my-appointments').addEventListener('click', openAccount);
  document.getElementById('account-newsletter-save').addEventListener('click', saveNewsletterConsent);
  document.getElementById('account-chat-form').addEventListener('submit', sendChatMessage);
  document.getElementById('account-chat-photo').addEventListener('change', function () {
    document.getElementById('account-chat-filename').textContent = this.files[0]?.name || '';
  });

  loadData().then(() => {
    if (new URLSearchParams(location.search).get('register') === '1' && !state.user) {
      setAuthMode('signup');
      openModal(els.authModal);
      document.getElementById('auth-message').className = 'form-message success';
      document.getElementById('auth-message').textContent = 'Erstelle dein Konto mit derselben Telefonnummer, die du bei GiGi Beauty angegeben hast.';
    }
  }).catch(error => { console.error(error); showToast('Die Terminbuchung konnte nicht geladen werden.'); });
})();
