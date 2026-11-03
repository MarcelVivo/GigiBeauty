(() => {
  'use strict';
  const config = window.GIGI_SUPABASE || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.url || '') && !String(config.anonKey || '').startsWith('YOUR-');
  const db = configured && window.supabase ? window.supabase.createClient(config.url, config.anonKey) : null;
  const state = { user: null, profile: null, settings: null, services: [], profiles: [], customers: [], appointments: [], blocks: [], invoices: [], campaigns: [], payments: [], expenses: [], inventory: [], serviceInventory: [], waitlist: [], tasks: [], communications: [], automations: [], marketingEvents: [], packages: [], giftCards: [], auditLog: [], servicePriceItems: [], siteContentBlocks: [], testimonials: [], customerMedia: [], aiPreviewRequests: [], week: startOfWeek(new Date()), customerFilter: '', customerSegment: 'all', period: { mode: 'month', start: monthStart(new Date()) } };
  const $ = id => document.getElementById(id);
  const panelMeta = {
    overview: ['Guten Tag, Liliane', 'Das Wichtigste auf einen Blick.'],
    calendar: ['Terminkalender', 'Termine eintragen, verschieben und Zeiten sperren.'],
    tasks: ['Smart CRM', 'Die wichtigsten nächsten Schritte, automatisch priorisiert.'],
    customers: ['Kunden', 'Kontaktdaten, Historie und Marketing-Einwilligungen.'],
    messages: ['Nachrichten', 'Fotos & Wünsche, die Kundinnen über ihr Konto geschickt haben.'],
    'ai-preview': ['KI Farbwünsche', 'Presets und Farbtöne aus dem GiGi AI Beauty Preview.'],
    waitlist: ['Warteliste', 'Freie Zeitfenster schneller mit passenden Kundinnen besetzen.'],
    invoices: ['Finanzen', 'Einnahmen, Ausgaben, Rechnungen und Profitabilität.'],
    inventory: ['Lager', 'Bestände, Materialkosten und Nachbestellungen.'],
    marketing: ['Marketing', 'Kampagnen für Kundinnen mit Einwilligung erstellen.'],
    content: ['Website-Inhalte', 'Behandlungstexte und Preislisten direkt auf der Website pflegen.'],
    settings: ['Einstellungen', 'Öffnungszeiten und Kontaktdaten pflegen.']
  };

  const WEEKDAY_LABELS = { '1': 'Montag', '2': 'Dienstag', '3': 'Mittwoch', '4': 'Donnerstag', '5': 'Freitag', '6': 'Samstag', '7': 'Sonntag' };

  function startOfDay(value) { const d = new Date(value); d.setHours(0, 0, 0, 0); return d; }
  function startOfWeek(value) { const d = startOfDay(value); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function addDays(value, days) { const d = new Date(value); d.setDate(d.getDate() + days); return d; }
  function dayKey(value) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function fmt(value, options) { return new Intl.DateTimeFormat('de-CH', options).format(new Date(value)); }
  function money(value) { return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(Number(value || 0)); }
  function compactMoney(value) { return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0)); }
  function percent(value, total) { return total ? Math.round((Number(value || 0) / total) * 100) : 0; }
  function monthStart(value = new Date()) { const d = new Date(value); d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
  function addMonths(value, months) { const d = new Date(value); d.setMonth(d.getMonth() + months); return d; }
  function sameMonth(value, reference) { const d = new Date(value); return d.getMonth() === reference.getMonth() && d.getFullYear() === reference.getFullYear(); }
  function phoneKey(value) { return String(value || '').replace(/\D/g, '').slice(-9); }
  function swissPhone(value) { const key = phoneKey(value); return key ? `41${key}` : ''; }
  function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
  function localInput(value) { const d = new Date(value); return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  function labelStatus(status) { return ({ booked: 'Gebucht', completed: 'Abgeschlossen', cancelled: 'Storniert', no_show: 'Nicht erschienen', draft: 'Entwurf', sent: 'Gesendet', scheduled: 'Geplant', paid: 'Bezahlt', void: 'Storniert' })[status] || status; }
  function actionableTasks(now = new Date()) { return state.tasks.filter(task => task.status === 'open' && (!task.snoozed_until || new Date(task.snoozed_until) <= now)); }
  function statusPill(status) { return `<span class="status status-${esc(status)}">${esc(labelStatus(status))}</span>`; }
  function loginErrorMessage(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    if (code.includes('email_not_confirmed') || message.includes('email not confirmed')) return 'Die E-Mail-Adresse ist noch nicht bestätigt. Bitte das Konto zuerst in Supabase bestätigen.';
    if (code.includes('invalid_credentials') || message.includes('invalid login credentials')) return 'E-Mail-Adresse oder Passwort ist nicht korrekt.';
    if (message.includes('failed to fetch') || message.includes('network')) return 'Supabase ist momentan nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.';
    if (message.includes('timeout')) return 'Die Anmeldung hat zu lange gedauert. Bitte Seite neu laden und erneut versuchen.';
    return error?.message || 'Die Anmeldung ist fehlgeschlagen.';
  }

  async function init() {
    if (!db) { $('login-message').textContent = 'Supabase ist noch nicht konfiguriert. Bitte assets/js/supabase-config.js ergänzen.'; return; }
    const { data } = await db.auth.getSession();
    if (data.session?.user) await enterDashboard(data.session.user);
  }

  async function enterDashboard(user) {
    $('login-message').textContent = 'Login erfolgreich. Die Admin-Berechtigung wird geprüft.';
    let adminResult;
    try {
      adminResult = await Promise.race([
        db.rpc('is_admin'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin check timeout')), 10000))
      ]);
    } catch (error) {
      $('login-message').textContent = 'Die Admin-Berechtigung konnte nicht geprüft werden. Bitte Seite neu laden.';
      return;
    }
    if (adminResult.error || adminResult.data !== true) {
      // Nicht abmelden: im selben Browser angemeldete Kundinnen (oder
      // Liliane als Testkundin) blieben sonst auch im Kundenkonto draussen.
      // Eine Admin-Anmeldung im Formular ersetzt die Sitzung ohnehin.
      $('login-message').textContent = adminResult.error ? `Admin-Prüfung fehlgeschlagen: ${adminResult.error.message}` : `Angemeldet als ${user.email} (Kundenkonto). Für das Dashboard bitte mit dem Admin-Konto anmelden.`;
      return;
    }
    const profile = {
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin',
      email: user.email
    };
    state.user = user;
    state.profile = profile;
    $('login-message').textContent = 'Admin bestätigt. Das Dashboard wird geladen.';
    $('admin-name').textContent = profile.full_name;
    $('admin-email-label').textContent = profile.email;
    $('login-screen').hidden = true;
    $('dashboard').hidden = false;
    await db.rpc('generate_daily_crm_tasks');
    await loadAll();
    subscribeRealtime();
    watchSession();
  }

  // Live updates: new bookings and new customer messages/photos (chat +
  // AI-preview requests) appear without needing a manual page reload.
  // Requires the tables to be added to the `supabase_realtime` publication
  // -- see supabase/migrations/202608250001_dashboard_realtime.sql.
  // Abgelaufene oder anderswo beendete Sitzung nicht stillschweigend als
  // leeren Kalender zeigen; beim Zurückkehren zum Tab Daten auffrischen.
  let sessionWatched = false;
  function watchSession() {
    if (sessionWatched || !db) return;
    sessionWatched = true;
    db.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && state.user) { toast('Sitzung beendet. Bitte neu anmelden.'); setTimeout(() => location.reload(), 1500); }
    });
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || !state.user) return;
      const { data } = await db.auth.getSession();
      if (!data.session) { location.reload(); return; }
      if (![...document.querySelectorAll('.modal-backdrop')].some(m => !m.hidden)) loadAll();
    });
  }

  let realtimeChannel = null;
  function subscribeRealtime() {
    if (!db || realtimeChannel) return;
    let reloadTimer = null;
    // Neu laden baut Listen, Editoren und Auswahlfelder neu auf. Solange
    // Liliane in einem Fenster oder Eingabefeld arbeitet, wird verschoben,
    // damit nichts Ungespeichertes verloren geht.
    const busyEditing = () => [...document.querySelectorAll('.modal-backdrop')].some(m => !m.hidden)
      || (document.activeElement && document.activeElement.matches('input, textarea, select, [contenteditable]') && document.activeElement.closest('.dash-main'));
    const scheduleReload = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(function attempt() {
        if (busyEditing()) { reloadTimer = setTimeout(attempt, 4000); return; }
        loadAll();
      }, 700);
    };
    realtimeChannel = db.channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, payload => {
        if (payload.eventType === 'INSERT') toast('Neuer Termin eingegangen.');
        else if (payload.eventType === 'UPDATE' && payload.new?.status === 'cancelled' && payload.old?.status !== 'cancelled') toast('Ein Termin wurde storniert.');
        scheduleReload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_times' }, scheduleReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customer_media' }, payload => {
        if (payload.new?.sender === 'customer') toast('Neue Nachricht oder Foto von einer Kundin.');
        scheduleReload();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_preview_requests' }, () => {
        toast('Neue KI-Vorschau-Anfrage.');
        scheduleReload();
      })
      .subscribe();
  }

  // Supabase liefert pro Abfrage höchstens 1000 Zeilen -- wachsende Tabellen
  // seitenweise vollständig laden (stabile Sortierung über id).
  async function fetchAll(makeQuery, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await makeQuery().order('id').range(from, from + pageSize - 1);
      if (error) return { data: null, error };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) return { data: rows, error: null };
    }
  }

  async function loadAll() {
    let results;
    try {
      results = await Promise.race([
        Promise.all([
          db.from('services').select('*').order('sort_order'),
          db.from('business_settings').select('*').maybeSingle(),
          db.from('profiles').select('*').order('full_name'),
          fetchAll(() => db.from('customers').select('*').order('full_name')),
          fetchAll(() => db.from('appointments').select('*, services(name, price_chf)').order('starts_at')),
          db.from('blocked_times').select('*').order('starts_at'),
          db.from('invoices').select('*').order('created_at', { ascending: false }),
          db.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
          fetchAll(() => db.from('payments').select('*, appointments(customer_name, customer_email, starts_at), customers(full_name)').order('paid_at', { ascending: false })),
          db.from('expenses').select('*').order('expense_date', { ascending: false }),
          db.from('inventory_items').select('*').order('name'),
          db.from('service_inventory').select('*'),
          db.from('waitlist_entries').select('*, services(name)').order('priority', { ascending: false }).order('created_at'),
          fetchAll(() => db.from('crm_tasks').select('*, customers(full_name, email, phone)').order('due_at')),
          fetchAll(() => db.from('customer_communications').select('*').order('occurred_at', { ascending: false })),
          db.from('automation_rules').select('*').order('name'),
          fetchAll(() => db.from('marketing_events').select('*').order('occurred_at', { ascending: false })),
          db.from('customer_packages').select('*, customers(full_name), services(name)').order('purchased_at', { ascending: false }),
          db.from('gift_cards').select('*').order('created_at', { ascending: false }),
          db.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(50),
          db.from('service_price_items').select('*').order('sort_order'),
          db.from('site_content_blocks').select('*').order('sort_order'),
          db.from('testimonials').select('*').order('sort_order'),
          fetchAll(() => db.from('customer_media').select('*, customers(full_name)').eq('category', 'chat').order('created_at', { ascending: false })),
          db.from('ai_preview_requests').select('*').order('created_at', { ascending: false }).limit(200)
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Dashboard data timeout')), 30000))
      ]);
    } catch (error) {
      toast('Dashboard-Daten konnten nicht rechtzeitig geladen werden. Bitte Seite neu laden.');
      return;
    }
    const failed = results.find(result => result.error);
    if (failed) return toast(`Daten konnten nicht geladen werden: ${failed.error.message}`);
    state.services = results[0].data || [];
    state.settings = results[1].data || null;
    [state.profiles, state.customers, state.appointments, state.blocks, state.invoices, state.campaigns, state.payments, state.expenses, state.inventory, state.serviceInventory, state.waitlist, state.tasks, state.communications, state.automations, state.marketingEvents, state.packages, state.giftCards, state.auditLog, state.servicePriceItems, state.siteContentBlocks, state.testimonials, state.customerMedia, state.aiPreviewRequests] = results.slice(2).map(result => result.data || []);
    fillServiceSelect();
    renderAll();
  }

  function renderAll() { renderOverview(); renderCalendar(); renderTasks(); renderCustomers(); renderMessages(); renderAiPreviewRequests(); renderWaitlist(); renderInvoices(); renderInventory(); renderCampaigns(); renderContent(); renderSettings(); }

  const AI_PREVIEW_SERVICE_LABELS = {
    'gel-acryl-nails': 'Gel & Acryl Nails',
    'permanent-make-up': 'Permanent Make-up',
    'kosmetische-pedicure': 'Kosmetische Pedicure',
    fillers: 'Fillers',
    lashes: 'Lashes',
    'korean-cosmetics': 'Korean Cosmetics',
    'natural-make-up': 'Natural Make Up'
  };

  async function signedAiPreviewPhotoUrl(path) {
    const { data } = await db.storage.from('ai-preview-photos').createSignedUrl(path, 3600);
    return data?.signedUrl || '';
  }

  async function renderAiPreviewRequests() {
    const table = $('ai-preview-table');
    if (!table) return;
    if (!state.aiPreviewRequests.length) {
      table.innerHTML = '<tr><td colspan="7" class="empty">Noch keine KI-Vorschau-Anfragen.</td></tr>';
      return;
    }
    table.innerHTML = '';
    for (const item of state.aiPreviewRequests) {
      const colorChips = Object.values(item.colors || {}).map(c => `<span class="ai-color-chip"><span class="ai-color-dot" style="background:${esc(c.hex)}"></span>${esc(c.areaLabel)}: ${esc(c.label)} <code>${esc(c.hex)}</code></span>`).join('');
      const row = document.createElement('tr');
      row.innerHTML = `<td>${esc(fmt(item.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</td><td class="ai-preview-photo-cell">${item.photo_path ? '<span class="muted">Lädt …</span>' : '<span class="muted">Kein Foto</span>'}</td><td>${esc(AI_PREVIEW_SERVICE_LABELS[item.service_type] || item.service_type)}</td><td>${esc(item.customer_name || '–')}</td><td>${esc(item.preset_label || '–')}</td><td>${colorChips || '<span class="muted">–</span>'}</td><td>${esc(item.wish_note || '–')}</td>`;
      table.appendChild(row);
      if (item.photo_path) {
        signedAiPreviewPhotoUrl(item.photo_path).then(url => {
          const cell = row.querySelector('.ai-preview-photo-cell');
          if (cell && url) cell.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img class="ai-preview-thumb" src="${esc(url)}" alt="Foto der Kundin" loading="lazy"></a>`;
        });
      }
    }
  }

  function renderMessages() {
    const unread = state.customerMedia.filter(item => item.sender === 'customer' && !item.admin_read_at);
    const badge = $('messages-badge');
    badge.hidden = !unread.length;
    badge.textContent = unread.length > 99 ? '99+' : String(unread.length);

    $('messages-table').innerHTML = state.customerMedia.length ? state.customerMedia.map(item => {
      const isUnread = item.sender === 'customer' && !item.admin_read_at;
      const preview = `${item.message ? esc(item.message) : ''}${item.photo_path ? ' 📎' : ''}` || '–';
      const who = item.sender === 'customer' ? esc(item.customers?.full_name || 'Unbekannt') : `${esc(item.customers?.full_name || 'Unbekannt')} <span class="muted">(Antwort von Liliane)</span>`;
      return `<tr class="${isUnread ? 'is-unread' : ''}"><td>${esc(fmt(item.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</td><td>${who}</td><td>${preview}</td><td>${isUnread ? '<span class="segment segment-new">Neu</span>' : (item.sender === 'customer' ? '<span class="muted">Gelesen</span>' : '')}</td><td><button class="link-button" type="button" data-open-customer-chat="${item.customer_id}">Öffnen</button></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">Noch keine Nachrichten von Kundinnen.</td></tr>';
    document.querySelectorAll('[data-open-customer-chat]').forEach(button => button.onclick = () => { openCustomer(button.dataset.openCustomerChat, { focusChat: true }); showPanel('customers'); });
  }

  function appointmentRevenue(appointment) {
    return appointment.status === 'completed' && !appointment.is_private ? Number(appointment.amount_chf ?? appointment.services?.price_chf ?? 0) : 0;
  }


  function trend(current, previous, positiveIsGood = true) {
    if (!current && !previous) return { text: '–', className: 'neutral' };
    if (!previous) return { text: '+100%', className: positiveIsGood ? 'up' : 'down' };
    const change = Math.round(((current - previous) / Math.abs(previous)) * 100);
    const good = positiveIsGood ? change > 0 : change < 0;
    return { text: `${change > 0 ? '+' : ''}${change}%`, className: change === 0 ? 'neutral' : good ? 'up' : 'down' };
  }

  function metricCard(label, value, detail, change = null, attrs = '') {
    return `<article class="metric${attrs ? ' is-interactive' : ''}"${attrs}><span>${esc(label)}</span><strong>${esc(value)}</strong><div class="metric-foot"><small>${esc(detail)}</small>${change ? `<em class="trend ${change.className}">${esc(change.text)}</em>` : ''}</div></article>`;
  }

  // Interaktive Übersicht: jedes anklickbare Diagramm-Element trägt
  // data-action (Schlüssel in overviewActions, bei jedem renderOverview()
  // neu befüllt) und optional data-tip-value/-label für den Tooltip. Ein
  // delegierter Listener auf dem Übersichts-Panel bedient alle Grafiken.
  let overviewActions = new Map();
  function interactive(action, tipValue = null, tipLabel = '') {
    const key = String(overviewActions.size + 1);
    overviewActions.set(key, action);
    const tip = tipValue == null ? '' : ` data-tip-value="${esc(tipValue)}" data-tip-label="${esc(tipLabel)}"`;
    return ` data-action="${key}" tabindex="0" role="button"${tip}`;
  }
  function tipOnly(tipValue, tipLabel = '') { return ` data-tip-value="${esc(tipValue)}" data-tip-label="${esc(tipLabel)}"`; }

  function showChartTip(target, x, y) {
    const tip = $('chart-tooltip');
    $('chart-tooltip-value').textContent = target.dataset.tipValue;
    $('chart-tooltip-label').textContent = target.dataset.tipLabel || '';
    $('chart-tooltip-label').hidden = !target.dataset.tipLabel;
    tip.hidden = false;
    const rect = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - rect.width - 8))}px`;
    tip.style.top = `${Math.max(8, y - rect.height - 12 < 8 ? y + 18 : y - rect.height - 12)}px`;
  }
  function hideChartTip() { $('chart-tooltip').hidden = true; }

  function bindOverviewInteractions() {
    const panel = document.querySelector('[data-view-panel="overview"]');
    panel.addEventListener('pointermove', event => {
      // Auf Touch-Geräten kein Hover: Antippen öffnet direkt das Detailfenster.
      if (event.pointerType === 'touch') { hideChartTip(); return; }
      const target = event.target.closest('[data-tip-value]');
      if (target && panel.contains(target)) showChartTip(target, event.clientX, event.clientY); else hideChartTip();
    });
    panel.addEventListener('pointerleave', hideChartTip);
    window.addEventListener('scroll', hideChartTip, { capture: true, passive: true });
    panel.addEventListener('focusin', event => {
      const target = event.target.closest('[data-tip-value]');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      showChartTip(target, rect.left + rect.width / 2, rect.top);
    });
    panel.addEventListener('focusout', hideChartTip);
    const run = event => {
      const target = event.target.closest('[data-action]');
      if (!target || !panel.contains(target)) return false;
      const action = overviewActions.get(target.dataset.action);
      if (!action) return false;
      hideChartTip();
      action();
      return true;
    };
    panel.addEventListener('click', run);
    panel.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action]:not(button)') && run(event)) event.preventDefault();
    });
  }

  // Detailfenster hinter einer Grafik: Liste der Termine oder Kundinnen, je
  // ein Klick öffnet den Termin bzw. das Kundenprofil.
  async function completePastAppointments(list) {
    const ids = list.filter(a => new Date(a.ends_at) <= new Date()).map(a => a.id);
    if (!ids.length || !confirm(`${ids.length} vergangene Termine als «Abgeschlossen» markieren? Die Kundinnen erhalten dabei keine E-Mails.`)) { $('insight-action').disabled = false; return; }
    const { data, error } = await db.rpc('complete_past_appointments', { appointment_ids: ids });
    if (error) {
      $('insight-action').disabled = false;
      if ($('insight-modal').hidden) toast(`Fehler: ${error.message}`); else $('insight-message').textContent = `Fehler: ${error.message}`;
      return;
    }
    closeModal('insight-modal');
    await loadAll();
    toast(`${data ?? ids.length} Termine als abgeschlossen markiert.`);
  }

  function openInsight({ title, subtitle = '', appointments = null, customers = null, action = null }) {
    $('insight-title').textContent = title;
    let rows = '';
    if (appointments) {
      const list = [...appointments].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
      const revenue = list.reduce((sum, a) => sum + appointmentRevenue(a), 0);
      $('insight-subtitle').textContent = subtitle || `${list.length} Termin${list.length === 1 ? '' : 'e'}${revenue ? ` · ${money(revenue)} Umsatz` : ''}`;
      rows = list.map(a => {
        const amount = a.status === 'completed' ? money(appointmentRevenue(a)) : a.status === 'booked' ? money(Number(a.amount_chf ?? a.services?.price_chf ?? 0)) : '';
        return `<button class="insight-row" type="button" data-insight-appointment="${a.id}"><time>${esc(fmt(a.starts_at, { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }))} · ${esc(fmt(a.starts_at, { hour: '2-digit', minute: '2-digit' }))}</time><span class="insight-main"><strong>${esc(a.customer_name)}</strong><small>${esc(a.services?.name || 'Privat')}</small></span>${statusPill(a.status)}<b>${esc(amount)}</b></button>`;
      }).join('');
    } else if (customers) {
      const list = customers.map(customer => ({ customer, stats: customerStats(customer) })).sort((a, b) => b.stats.totalBookings - a.stats.totalBookings || String(a.customer.full_name).localeCompare(String(b.customer.full_name), 'de'));
      $('insight-subtitle').textContent = subtitle || `${list.length} Kundin${list.length === 1 ? '' : 'nen'}`;
      rows = list.map(({ customer, stats }) => `<button class="insight-row" type="button" data-insight-customer="${customer.id}"><span class="insight-main"><strong>${esc(customer.full_name)}</strong><small>${esc([customer.phone, customer.email].filter(Boolean).join(' · ') || 'Keine Kontaktdaten')}</small></span><span class="segment segment-${stats.segment.key}">${esc(stats.segment.label)}</span><b>${stats.totalBookings} Termin${stats.totalBookings === 1 ? '' : 'e'}</b></button>`).join('');
    }
    $('insight-list').innerHTML = rows || '<div class="empty">Keine Einträge in diesem Bereich.</div>';
    // Optionale Sammelaktion unter der Liste (z. B. "alle abschliessen").
    $('insight-actions').hidden = !action || !rows;
    $('insight-message').textContent = '';
    if (action && rows) {
      $('insight-action').textContent = action.label;
      $('insight-action-note').textContent = action.note || '';
      $('insight-action').disabled = false;
      $('insight-action').onclick = async () => { $('insight-action').disabled = true; await action.run(); };
    }
    $('insight-list').querySelectorAll('[data-insight-appointment]').forEach(button => button.onclick = () => { closeModal('insight-modal'); openAppointment(button.dataset.insightAppointment); });
    $('insight-list').querySelectorAll('[data-insight-customer]').forEach(button => button.onclick = () => { closeModal('insight-modal'); openCustomer(button.dataset.insightCustomer); });
    openModal('insight-modal');
  }

  // Gewählter Auswertungszeitraum der Übersicht: ein Kalendermonat oder ein
  // Kalenderjahr, plus der unmittelbar davor liegende Vergleichszeitraum.
  function periodRange(period = state.period) {
    const step = period.mode === 'year' ? 12 : 1;
    const start = period.mode === 'year' ? new Date(period.start.getFullYear(), 0, 1) : monthStart(period.start);
    return {
      start,
      end: addMonths(start, step),
      previousStart: addMonths(start, -step),
      label: period.mode === 'year' ? String(start.getFullYear()) : fmt(start, { month: 'long', year: 'numeric' }),
      previousLabel: period.mode === 'year' ? 'Vorjahr' : 'Vormonat'
    };
  }

  // Jahr: 12 Monatspunkte. Monat: ein Punkt pro Tag.
  function periodRevenueSeries(range) {
    const days = range.end - range.start > 40 * 86400000 ? null : Math.round((range.end - range.start) / 86400000);
    const buckets = days
      ? Array.from({ length: days }, (_, index) => { const start = addDays(range.start, index); return { start, end: addDays(start, 1), label: `${start.getDate()}.`, title: fmt(start, { weekday: 'short', day: '2-digit', month: '2-digit' }) }; })
      : Array.from({ length: 12 }, (_, index) => { const start = addMonths(range.start, index); return { start, end: addMonths(start, 1), label: fmt(start, { month: 'short' }), title: fmt(start, { month: 'long', year: 'numeric' }) }; });
    return buckets.map(bucket => {
      const appointments = state.appointments.filter(a => !a.is_private && new Date(a.starts_at) >= bucket.start && new Date(a.starts_at) < bucket.end);
      const now = new Date();
      const value = list => list.reduce((sum, a) => sum + Number(a.amount_chf ?? a.services?.price_chf ?? 0), 0);
      const open = appointments.filter(a => a.status === 'booked' && new Date(a.starts_at) < now);
      const upcoming = appointments.filter(a => a.status === 'booked' && new Date(a.starts_at) >= now);
      return {
        ...bucket,
        revenue: appointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0),
        completed: appointments.filter(a => a.status === 'completed').length,
        open: value(open), openCount: open.length,
        upcoming: value(upcoming), upcomingCount: upcoming.length
      };
    });
  }

  // Umsatz als gestapelte Balken (Monat: pro Tag, Jahr: pro Monat):
  // abgeschlossen + vergangen mit offenem Status + noch gebucht. Farben mit
  // dataviz/validate_palette.js geprüft (CVD, Helligkeit, Kontrast).
  const REVENUE_SERIES = [
    { key: 'revenue', label: 'Abgeschlossen', color: '#9a4a6b' },
    { key: 'open', label: 'Vergangen, Status offen', color: '#b8862f' },
    { key: 'upcoming', label: 'Gebucht', color: '#3f7fc0' }
  ];
  function revenueStackChart(series, attrsFor = () => '', labelEvery = 1, width = 760) {
    const height = 235, left = 52, right = 12, top = 18, bottom = 32;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const total = item => REVENUE_SERIES.reduce((sum, part) => sum + item[part.key], 0);
    // Achse in runden Schritten (4 Intervalle à 1/2/2.5/5 × Zehnerpotenz).
    const rawMax = Math.max(100, ...series.map(total));
    const magnitude = 10 ** Math.floor(Math.log10(rawMax / 4));
    const maximum = 4 * magnitude * [1, 2, 2.5, 5, 10].find(f => f * magnitude * 4 >= rawMax);
    const slot = plotWidth / series.length;
    const barWidth = Math.max(4, Math.min(38, slot * .62));
    const grid = Array.from({ length: 5 }, (_, index) => {
      const lineY = top + (index / 4) * plotHeight;
      const value = maximum * (1 - index / 4);
      return `<line class="chart-grid-line" x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}"/><text class="chart-axis-label" x="${left - 7}" y="${lineY + 3}" text-anchor="end">${esc(compactMoney(value))}</text>`;
    }).join('');
    const peak = series.reduce((best, item, index) => total(item) > (best < 0 ? 0 : total(series[best])) ? index : best, -1);
    const bars = series.map((item, index) => {
      const x = left + slot * index + (slot - barWidth) / 2;
      let baseline = top + plotHeight;
      const segments = REVENUE_SERIES.map(part => {
        const h = (item[part.key] / maximum) * plotHeight;
        if (h <= 0) return '';
        const segmentHeight = Math.max(2, h - (baseline < top + plotHeight ? 2 : 0));
        baseline -= h;
        return `<rect class="chart-bar" x="${x}" y="${baseline + (h - segmentHeight)}" width="${barWidth}" height="${segmentHeight}" rx="2" fill="${part.color}"/>`;
      }).join('');
      const label = index === peak ? `<text class="chart-value-label" x="${x + barWidth / 2}" y="${baseline - 5}" text-anchor="middle">${esc(compactMoney(total(item)))}</text>` : '';
      const axis = index % labelEvery === 0 || index === series.length - 1 ? `<text class="chart-axis-label" x="${left + slot * (index + .5)}" y="${height - 8}" text-anchor="middle">${esc(item.label)}</text>` : '';
      return `<g class="chart-hit"${attrsFor(item, index)}><rect class="chart-hit-area" x="${left + slot * index}" y="${top}" width="${slot}" height="${plotHeight}"/>${segments}${label}</g>${axis}`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Umsatzentwicklung">${grid}<line class="chart-baseline" x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}"/>${bars}</svg>`;
  }

  // Donut als SVG-Ring: jedes Segment ist ein eigener Kreisbogen (Hover +
  // Klick), die Legende daneben ist dieselbe Aktion als Zeile mit Anteil.
  function renderDonut(chartId, legendId, segments, centerValue, centerLabel) {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const radius = 54, circumference = 2 * Math.PI * radius, gap = total && segments.filter(s => s.value).length > 1 ? 2 : 0;
    let offset = 0;
    const arcs = total ? segments.map(segment => {
      if (!segment.value) return '';
      const length = (segment.value / total) * circumference;
      const arc = `<circle class="donut-seg" cx="67.5" cy="67.5" r="${radius}" stroke="${segment.color}" stroke-dasharray="${Math.max(0, length - gap)} ${circumference}" stroke-dashoffset="${-offset}"${segment.attrs || ''}/>`;
      offset += length;
      return arc;
    }).join('') : '';
    const chart = $(chartId);
    chart.classList.add('is-svg');
    chart.style.background = '';
    chart.innerHTML = `<svg viewBox="0 0 135 135" aria-hidden="false"><circle cx="67.5" cy="67.5" r="${radius}" fill="none" stroke="#eee9e3" stroke-width="22"/><g transform="rotate(-90 67.5 67.5)">${arcs}</g></svg><div class="donut-center"><strong>${esc(centerValue)}</strong><span>${esc(centerLabel)}</span></div>`;
    $(legendId).innerHTML = segments.map(segment => `<div class="legend-row${segment.attrs ? ' is-interactive' : ''}"${segment.attrs || ''}><i class="legend-dot" style="background:${segment.color}"></i><span>${esc(segment.label)}</span><strong>${segment.value}<small>${percent(segment.value, total)}%</small></strong></div>`).join('');
  }

  function availableSlots(from, to) {
    const hours = state.settings?.opening_hours || {};
    let slots = 0;
    for (let date = startOfDay(from); date < to; date = addDays(date, 1)) {
      const range = hours[String(date.getDay())];
      if (!range) continue;
      const minutes = value => Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]);
      slots += Math.max(0, Math.floor((minutes(range[1]) - minutes(range[0])) / 90));
    }
    const blocked = state.blocks.filter(block => new Date(block.starts_at) < to && new Date(block.ends_at) > from).reduce((sum, block) => sum + Math.ceil((new Date(block.ends_at) - new Date(block.starts_at)) / 5400000), 0);
    return Math.max(0, slots - blocked);
  }

  // Der Buchungsraster steht weiterhin auf 90 Minuten (jeder Termin startet
  // auf einem 90-Minuten-Raster), aber seit es Positionen mit abweichender
  // Dauer gibt (z. B. 3 Stunden für Permanent-Make-up), belegt ein einzelner
  // Termin nicht mehr zwingend nur ein Zeitfenster -- ein 3-Stunden-Termin
  // blockiert zwei aufeinanderfolgende 90-Minuten-Slots.
  function appointmentSlotUnits(appointment) {
    return Math.max(1, Math.ceil((new Date(appointment.ends_at) - new Date(appointment.starts_at)) / 5400000));
  }

  function upcomingBirthday(customer, days = 30) {
    if (!customer.birth_date) return false;
    const now = startOfDay(new Date());
    const birth = new Date(`${customer.birth_date}T12:00:00`);
    let next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
    if (next < now) next.setFullYear(next.getFullYear() + 1);
    return next <= addDays(now, days);
  }

  function renderOverview() {
    overviewActions = new Map();
    const now = new Date();
    const today = dayKey(now);
    const range = periodRange();
    const periodStart = range.start;
    const booked = state.appointments.filter(a => a.status === 'booked');
    const todayAppointments = booked.filter(a => dayKey(a.starts_at) === today).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const currentMonthAppointments = state.appointments.filter(a => !a.is_private && a.status !== 'cancelled' && new Date(a.starts_at) >= range.start && new Date(a.starts_at) < range.end);
    const previousMonthAppointments = state.appointments.filter(a => !a.is_private && a.status !== 'cancelled' && new Date(a.starts_at) >= range.previousStart && new Date(a.starts_at) < range.start);
    const currentRevenue = currentMonthAppointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
    const previousRevenue = previousMonthAppointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
    const customerAnalytics = state.customers.map(customer => ({ customer, stats: customerStats(customer) }));
    const customersWithHistory = customerAnalytics.filter(item => item.stats.totalBookings > 0);
    const repeatCustomers = customerAnalytics.filter(item => item.stats.totalBookings >= 2).length;
    const reachableCustomers = state.customers.filter(customer => customer.email && customer.marketing_consent && !customer.do_not_contact).length;
    const customersWithEmail = state.customers.filter(customer => customer.email).length;
    const capacityEnd = addDays(startOfDay(now), 30);
    const capacity = availableSlots(startOfDay(now), capacityEnd);
    const occupied = booked.filter(a => new Date(a.starts_at) >= startOfDay(now) && new Date(a.starts_at) < capacityEnd).reduce((sum, a) => sum + appointmentSlotUnits(a), 0);
    const openInvoices = state.invoices.filter(invoice => ['draft', 'sent'].includes(invoice.status));
    const openInvoiceTotal = openInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_chf || 0), 0);

    // Hinweis ganz oben, unabhängig vom gewählten Zeitraum: alle vergangenen
    // Termine, die noch auf "Gebucht" stehen (zählen sonst nirgends).
    const allOverdue = booked.filter(a => !a.is_private && new Date(a.ends_at) <= now);
    const overdueValue = allOverdue.reduce((sum, a) => sum + Number(a.amount_chf ?? a.services?.price_chf ?? 0), 0);
    $('overdue-banner').hidden = !allOverdue.length;
    $('overdue-banner').innerHTML = allOverdue.length
      ? `<div><strong>${allOverdue.length} vergangene Termine stehen noch auf «Gebucht»</strong><span>${esc(money(overdueValue))} fehlen deshalb im Umsatz. Kundinnen, die nicht erschienen sind, zuerst in der Liste auf «Nicht erschienen» setzen.</span></div><div class="overdue-actions"><button class="secondary" type="button" id="overdue-list">Liste ansehen</button><button class="primary" type="button" id="overdue-complete">Alle ${allOverdue.length} abschliessen</button></div>`
      : '';
    const overdueInsight = () => openInsight({ title: 'Vergangene Termine, Status offen', subtitle: `${allOverdue.length} Termine liegen in der Vergangenheit und stehen noch auf «Gebucht». Erst als «Abgeschlossen» zählen sie als Umsatz. Einzelne No-Shows zuerst per Klick auf den Termin auf «Nicht erschienen» setzen.`, appointments: allOverdue, action: { label: `Alle ${allOverdue.length} als abgeschlossen markieren`, note: 'Ohne Mails an die Kundinnen und ohne Lagerabzug.', run: () => completePastAppointments(allOverdue) } });
    if (allOverdue.length) {
      $('overdue-list').onclick = overdueInsight;
      $('overdue-complete').onclick = async () => { $('overdue-complete').disabled = true; await completePastAppointments(allOverdue); if ($('overdue-complete')) $('overdue-complete').disabled = false; };
    }

    $('analytics-period-label').textContent = `Auswertung ${range.label} · Vergleich mit ${range.previousLabel}`;
    $('period-label').textContent = range.label;
    document.querySelectorAll('[data-period-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.periodMode === state.period.mode)));
    // Vorwärts bis 3 Jahre ab heute (künftige Monate zeigen gebuchte Termine).
    $('period-next').disabled = range.start.getFullYear() >= now.getFullYear() + 3;
    $('period-today').hidden = range.start <= now && now < range.end;
    const completedInRange = currentMonthAppointments.filter(a => a.status === 'completed');
    const bookedNext30 = booked.filter(a => !a.is_private && new Date(a.starts_at) >= startOfDay(now) && new Date(a.starts_at) < capacityEnd);
    $('metrics').innerHTML = [
      metricCard(`Umsatz ${range.label}`, money(currentRevenue), 'abgeschlossene Behandlungen', trend(currentRevenue, previousRevenue),
        interactive(() => openInsight({ title: `Umsatz ${range.label}`, appointments: completedInRange }), money(currentRevenue), `${range.previousLabel}: ${money(previousRevenue)} · Klick für Details`)),
      metricCard(`Termine ${range.label}`, currentMonthAppointments.length, `${completedInRange.length} abgeschlossen`, trend(currentMonthAppointments.length, previousMonthAppointments.length),
        interactive(() => openInsight({ title: `Termine ${range.label}`, appointments: currentMonthAppointments }), `${currentMonthAppointments.length} Termine`, `${range.previousLabel}: ${previousMonthAppointments.length} · Klick für Details`)),
      metricCard('Auslastung 30 Tage', `${percent(occupied, capacity)}%`, `${occupied} von ${capacity} Zeitfenstern`, null,
        interactive(() => openInsight({ title: 'Gebucht in den nächsten 30 Tagen', appointments: bookedNext30 }), `${bookedNext30.length} gebuchte Termine`, `${Math.max(0, capacity - occupied)} Zeitfenster frei · Klick für Details`)),
      metricCard('Kundenbindung', `${percent(repeatCustomers, customersWithHistory.length)}%`, `${repeatCustomers} Wiederkehrende`, null,
        interactive(() => openInsight({ title: 'Wiederkehrende Kundinnen', customers: customerAnalytics.filter(item => item.stats.totalBookings >= 2).map(item => item.customer) }), `${repeatCustomers} von ${customersWithHistory.length}`, 'Kundinnen mit 2+ Terminen · Klick für Liste')),
      metricCard('Marketing-Reichweite', `${percent(reachableCustomers, customersWithEmail)}%`, `${reachableCustomers} von ${customersWithEmail} per E-Mail`, null,
        interactive(() => openInsight({ title: 'Per E-Mail-Marketing erreichbar', customers: state.customers.filter(customer => customer.email && customer.marketing_consent && !customer.do_not_contact) }), `${reachableCustomers} erreichbar`, 'mit E-Mail und Einwilligung · Klick für Liste')),
      metricCard('Offene Forderungen', money(openInvoiceTotal), `${openInvoices.length} Rechnungen`, null,
        interactive(() => showPanel('invoices'), money(openInvoiceTotal), 'Klick öffnet Rechnungen'))
    ].join('');

    const series = periodRevenueSeries(range);
    const periodRevenue = series.reduce((sum, item) => sum + item.revenue, 0);
    const periodCompleted = series.reduce((sum, item) => sum + item.completed, 0);
    const sumOf = key => series.reduce((sum, item) => sum + item[key], 0);
    const dayAppointments = item => state.appointments.filter(a => !a.is_private && a.status !== 'cancelled' && new Date(a.starts_at) >= item.start && new Date(a.starts_at) < item.end);
    const breakdown = item => REVENUE_SERIES.filter(part => item[part.key]).map(part => `${part.label} ${money(item[part.key])}`).join(' · ') || 'Kein Umsatz';
    const isYear = state.period.mode === 'year';
    const chartWidth = Math.max(300, Math.round($('revenue-chart').clientWidth || 760));
    $('revenue-chart').innerHTML = `<div class="chart-legend-row">${REVENUE_SERIES.map(part => `<span><i style="background:${part.color}"></i>${esc(part.label)} <b>${esc(money(sumOf(part.key)))}</b></span>`).join('')}</div>`
      + revenueStackChart(series, item => interactive(
        isYear ? () => { state.period = { mode: 'month', start: item.start }; renderOverview(); } : () => openInsight({ title: `Termine ${item.title}`, appointments: dayAppointments(item) }),
        money(item.revenue + item.open + item.upcoming), `${item.title} · ${breakdown(item)}${isYear ? ' · Klick öffnet Monat' : ''}`), isYear ? (chartWidth < 480 ? 2 : 1) : 5, chartWidth);
    $('revenue-chart-summary').innerHTML = `<strong>${esc(money(periodRevenue))}</strong><span>${periodCompleted} abgeschlossen · ${esc(range.label)}</span>`;

    const selectedYearStart = new Date(range.start.getFullYear(), 0, 1);
    const yearRevenue = state.appointments.filter(a => new Date(a.starts_at) >= selectedYearStart && new Date(a.starts_at) < new Date(range.start.getFullYear() + 1, 0, 1)).reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
    const averageTicket = periodCompleted ? periodRevenue / periodCompleted : 0;
    const paidInvoices = state.invoices.filter(invoice => invoice.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.amount_chf || 0), 0);
    const selectedYear = range.start.getFullYear();
    $('finance-summary').innerHTML = [
      [selectedYear === now.getFullYear() ? 'Umsatz laufendes Jahr' : `Umsatz ${selectedYear}`, money(yearRevenue), '',
        interactive(() => { state.period = { mode: 'year', start: new Date(selectedYear, 0, 1) }; renderOverview(); }, money(yearRevenue), `Klick zeigt Jahresansicht ${selectedYear}`)],
      ['Ø Behandlung', money(averageTicket), '',
        interactive(() => openInsight({ title: `Abgeschlossene Behandlungen ${range.label}`, appointments: completedInRange }), money(averageTicket), `${periodCompleted} Behandlungen · Klick für Details`)],
      ['Bezahlte No-Show-Rechnungen', money(paidInvoices), '', interactive(() => showPanel('invoices'), money(paidInvoices), 'Klick öffnet Rechnungen')],
      ['Noch ausstehend', money(openInvoiceTotal), openInvoiceTotal ? 'is-warning' : '', interactive(() => showPanel('invoices'), money(openInvoiceTotal), 'Klick öffnet Rechnungen')]
    ].map(([label, value, className, attrs]) => `<div class="finance-row is-interactive ${className}"${attrs}><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

    // Gebuchter Umsatz folgt dem gewählten Zeitraum: was in diesem Monat/Jahr
    // gebucht, aber nicht abgeschlossen ist -- getrennt nach "kommt noch" und
    // "liegt in der Vergangenheit, Status nie nachgetragen" (zählt sonst
    // nirgends als Umsatz).
    const bookedValue = list => list.reduce((sum, a) => sum + Number(a.amount_chf ?? a.services?.price_chf ?? 0), 0);
    const bookedInRange = booked.filter(a => !a.is_private && new Date(a.starts_at) >= range.start && new Date(a.starts_at) < range.end);
    const bookedUpcoming = bookedInRange.filter(a => new Date(a.starts_at) >= now);
    const bookedOverdue = bookedInRange.filter(a => new Date(a.starts_at) < now);
    const expectedTotal = currentRevenue + bookedValue(bookedInRange);
    $('booking-pipeline-title').textContent = `Gebuchter Umsatz ${range.label}`;
    $('booking-pipeline').innerHTML = [
      metricCard(`Gebucht ${range.label}`, money(bookedValue(bookedInRange)), `${bookedInRange.length} Termine, noch nicht abgeschlossen`, null,
        interactive(() => openInsight({ title: `Gebucht ${range.label}`, appointments: bookedInRange }), money(bookedValue(bookedInRange)), `${bookedInRange.length} Termine · Klick für Details`)),
      metricCard('Davon bevorstehend', money(bookedValue(bookedUpcoming)), `${bookedUpcoming.length} kommende Termine`, null,
        interactive(() => openInsight({ title: `Bevorstehend ${range.label}`, appointments: bookedUpcoming }), money(bookedValue(bookedUpcoming)), `${bookedUpcoming.length} Termine · Klick für Details`)),
      `<article class="metric is-interactive${bookedOverdue.length ? ' is-warning' : ''}"${interactive(() => openInsight({ title: `Vergangen, Status offen · ${range.label}`, subtitle: `${bookedOverdue.length} Termine liegen in der Vergangenheit und stehen noch auf «Gebucht». Erst als «Abgeschlossen» zählen sie als Umsatz. Einzelne No-Shows zuerst per Klick auf den Termin auf «Nicht erschienen» setzen.`, appointments: bookedOverdue, action: { label: `Alle ${bookedOverdue.length} als abgeschlossen markieren`, note: 'Ohne Mails an die Kundinnen und ohne Lagerabzug.', run: () => completePastAppointments(bookedOverdue) } }), `${bookedOverdue.length} Termine`, 'Status nachtragen · Klick für Liste')}><span>Status nachtragen</span><strong>${bookedOverdue.length}</strong><div class="metric-foot"><small>${esc(money(bookedValue(bookedOverdue)))} vergangen, noch «Gebucht»</small></div></article>`,
      metricCard(`Erwartet ${range.label}`, money(expectedTotal), 'abgeschlossen + gebucht', null,
        interactive(() => openInsight({ title: `Erwartet ${range.label}`, appointments: [...completedInRange, ...bookedInRange] }), money(expectedTotal), `${money(currentRevenue)} abgeschlossen + ${money(bookedValue(bookedInRange))} gebucht`))
    ].join('');

    const periodAppointments = state.appointments.filter(a => new Date(a.starts_at) >= periodStart && new Date(a.starts_at) < range.end && new Date(a.starts_at) <= now && !a.is_private);
    const serviceRows = state.services.map(service => {
      const appointments = periodAppointments.filter(a => a.service_id === service.id && a.status === 'completed');
      const revenue = appointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
      return { name: service.name, count: appointments.length, revenue, margin: revenue - appointments.length * Number(service.material_cost_chf || 0), appointments };
    }).sort((a, b) => b.revenue - a.revenue || b.count - a.count).slice(0, 6);
    const serviceMaximum = Math.max(1, ...serviceRows.map(row => row.revenue || row.count));
    $('service-performance').innerHTML = serviceRows.length ? serviceRows.map(row => `<div class="bar-row is-interactive"${interactive(() => openInsight({ title: `${row.name} · ${range.label}`, appointments: row.appointments }), money(row.revenue), `${row.count} Behandlungen · Deckungsbeitrag ${money(row.margin)}`)}><div class="bar-row-head"><span>${esc(row.name)}</span><strong>${esc(money(row.revenue))} · DB ${esc(money(row.margin))} · ${row.count}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, ((row.revenue || row.count) / serviceMaximum) * 100)}%"></div></div></div>`).join('') : '<div class="empty">Noch keine Behandlungsdaten.</div>';

    const customersIn = keys => customerAnalytics.filter(item => keys.includes(item.stats.segment.key)).map(item => item.customer);
    const retentionSegments = [
      { label: 'VIP (10+)', keys: ['vip'], color: '#c7973f' },
      { label: 'Stammkundinnen', keys: ['loyal'], color: '#6e384c' },
      { label: 'Wiederkehrend', keys: ['repeat'], color: '#4f8273' },
      { label: 'Neu / Kontakt', keys: ['new', 'lead'], color: '#9aa7b8' }
    ].map(segment => {
      const list = customersIn(segment.keys);
      return { ...segment, value: list.length, attrs: interactive(() => openInsight({ title: segment.label, customers: list }), `${list.length} Kundinnen`, `${segment.label} · ${percent(list.length, state.customers.length)}%`) };
    });
    renderDonut('retention-chart', 'retention-legend', retentionSegments, state.customers.length, 'Kundinnen');

    const statusSegments = [
      { label: 'Abgeschlossen', status: 'completed', color: '#4f8273' },
      { label: 'Gebucht', status: 'booked', color: '#6d83a1' },
      { label: 'Storniert', status: 'cancelled', color: '#afa59e' },
      { label: 'No-Show', status: 'no_show', color: '#a65353' }
    ].map(segment => {
      const list = periodAppointments.filter(a => a.status === segment.status);
      return { ...segment, value: list.length, attrs: interactive(() => openInsight({ title: `${segment.label} · ${range.label}`, appointments: list }), `${list.length} Termine`, segment.label) };
    });
    const completedOrLost = statusSegments.reduce((sum, item) => sum + item.value, 0);
    renderDonut('appointment-status-chart', 'appointment-status-legend', statusSegments, `${percent(statusSegments[0].value, completedOrLost)}%`, 'Abschlussquote');

    const ranking = [...customerAnalytics].sort((a, b) => b.stats.totalBookings - a.stats.totalBookings || b.stats.revenue - a.stats.revenue).slice(0, 7);
    $('customer-ranking').innerHTML = ranking.length ? ranking.map((item, index) => `<button class="ranking-row" type="button" data-open-customer="${item.customer.id}"><span class="rank-number">${index + 1}</span><span class="ranking-customer"><strong>${esc(item.customer.full_name)}</strong><span>${esc(item.customer.email || item.customer.phone || 'Kontakt ergänzen')}</span></span><span class="ranking-stat"><small>Status</small><span class="segment segment-${item.stats.segment.key}">${esc(item.stats.segment.label)}</span></span><span class="ranking-stat"><small>Termine</small><strong>${item.stats.totalBookings}</strong></span><span class="ranking-stat"><small>Umsatz erfasst</small><strong>${esc(money(item.stats.revenue))}</strong></span></button>`).join('') : '<div class="empty">Noch keine Kundendaten.</div>';

    const missingEmail = state.customers.filter(customer => !customer.email).length;
    const missingPhone = state.customers.filter(customer => !customer.phone).length;
    const birthdays = state.customers.filter(customer => upcomingBirthday(customer)).length;
    const inactive = customerAnalytics.filter(item => item.stats.last && new Date(item.stats.last) < addDays(now, -180) && !item.stats.next).length;
    $('customer-opportunities').innerHTML = [
      ['@', 'E-Mail ergänzen', 'Für Login, Bestätigung und Erinnerung', missingEmail, state.customers.filter(customer => !customer.email)],
      ['☎', 'Telefon ergänzen', 'Für Rückfragen und Profilabgleich', missingPhone, state.customers.filter(customer => !customer.phone)],
      ['✦', 'Geburtstage in 30 Tagen', 'Persönliche Nachricht vorbereiten', birthdays, state.customers.filter(customer => upcomingBirthday(customer))],
      ['↻', 'Reaktivierung', 'Seit über 180 Tagen ohne Besuch', inactive, customerAnalytics.filter(item => item.stats.last && new Date(item.stats.last) < addDays(now, -180) && !item.stats.next).map(item => item.customer)]
    ].map(([icon, title, detail, value, list]) => `<div class="opportunity is-interactive"${interactive(() => openInsight({ title, customers: list }), `${value} Kundinnen`, 'Klick für Liste')}><span class="opportunity-icon">${icon}</span><span><strong>${esc(title)}</strong><span>${esc(detail)}</span></span><b>${value}</b></div>`).join('');

    const funnelRows = [
      ['Alle Kontakte', state.customers],
      ['Mit E-Mail erreichbar', state.customers.filter(customer => customer.email)],
      ['Marketing-Einwilligung', state.customers.filter(customer => customer.email && customer.marketing_consent && !customer.do_not_contact)],
      [`Neu ${range.label}`, state.customers.filter(customer => new Date(customer.created_at) >= periodStart && new Date(customer.created_at) < range.end)]
    ];
    $('marketing-funnel').innerHTML = funnelRows.map(([label, list]) => `<div class="funnel-row is-interactive"${interactive(() => openInsight({ title: label, customers: list }), `${list.length} Kontakte`, `${percent(list.length, state.customers.length)}% aller Kontakte · Klick für Liste`)}><div class="funnel-fill" style="width:${percent(list.length, state.customers.length)}%"></div><div class="funnel-copy"><span>${esc(label)}</span><strong>${list.length}<small>${percent(list.length, state.customers.length)}%</small></strong></div></div>`).join('');

    const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].map((label, day) => ({ label, day, value: periodAppointments.filter(a => a.status !== 'cancelled' && new Date(a.starts_at).getDay() === day).length }));
    const orderedWeekdays = [...weekdays.slice(1), weekdays[0]];
    const weekdayMaximum = Math.max(1, ...orderedWeekdays.map(item => item.value));
    const weekdayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    $('weekday-chart').innerHTML = orderedWeekdays.map(item => `<div class="weekday-column is-interactive"${interactive(() => openInsight({ title: `${weekdayNames[item.day]}e · ${range.label}`, appointments: periodAppointments.filter(a => a.status !== 'cancelled' && new Date(a.starts_at).getDay() === item.day) }), `${item.value} Termine`, `${weekdayNames[item.day]} · ${range.label}`)}><div class="weekday-bar-wrap"><div class="weekday-bar" style="height:${Math.max(3, (item.value / weekdayMaximum) * 100)}%"></div></div><strong>${esc(item.label)}</strong><span>${item.value}</span></div>`).join('');

    const upcoming = booked.filter(a => new Date(a.starts_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 7);
    $('upcoming').innerHTML = upcoming.length ? upcoming.map(a => `<button class="upcoming-item" type="button" data-edit-appointment="${a.id}" style="width:100%;background:transparent;text-align:left;cursor:pointer"><span class="upcoming-time">${fmt(a.starts_at, { hour: '2-digit', minute: '2-digit' })}</span><span><strong>${esc(a.customer_name)}</strong><small>${esc(a.services?.name || 'Privat')} · ${fmt(a.starts_at, { weekday: 'short', day: '2-digit', month: '2-digit' })}</small><span class="calendar-event-origin">${esc(appointmentOriginLabel(appointmentOrigin(a)))}</span></span>${statusPill(a.status)}</button>`).join('') : '<div class="empty">Keine kommenden Termine.</div>';
    const todaySlots = availableSlots(startOfDay(now), addDays(startOfDay(now), 1));
    const todayOccupiedSlots = todayAppointments.reduce((sum, a) => sum + appointmentSlotUnits(a), 0);
    $('today-capacity').textContent = `${todayOccupiedSlots} von ${todaySlots} verfügbaren Zeitfenstern belegt`;
    $('today-summary').innerHTML = todayAppointments.length ? todayAppointments.map(a => `<button class="today-item" type="button" data-edit-appointment="${a.id}"><time>${fmt(a.starts_at, { hour: '2-digit', minute: '2-digit' })}–${fmt(a.ends_at, { hour: '2-digit', minute: '2-digit' })}</time><strong>${esc(a.customer_name)}</strong><span>${esc(a.services?.name || 'Privat')}</span><span class="calendar-event-origin">${esc(appointmentOriginLabel(appointmentOrigin(a)))}</span></button>`).join('') : '<div class="empty">Heute sind keine Termine eingetragen.</div>';

    const openTasks = actionableTasks(now);
    const urgentTasks = openTasks.filter(task => ['urgent', 'high'].includes(task.priority)).length;
    const expectedToday = todayAppointments.reduce((sum, appointment) => sum + Number(appointment.amount_chf ?? appointment.services?.price_chf ?? 0), 0);
    const freeToday = Math.max(0, todaySlots - todayOccupiedSlots);
    $('daily-brief-title').textContent = `${todayAppointments.length} Termine · ${money(expectedToday)} Potenzial · ${freeToday} freie Zeitfenster`;
    $('daily-brief-copy').textContent = urgentTasks ? `${urgentTasks} wichtige CRM-Aufgaben warten auf Bearbeitung. Die Warteliste enthält ${state.waitlist.filter(item => item.status === 'open').length} offene Wünsche.` : `Keine dringenden CRM-Aufgaben. Die Warteliste enthält ${state.waitlist.filter(item => item.status === 'open').length} offene Wünsche.`;
    $('daily-brief-actions').innerHTML = `<button class="brief-button" type="button" data-go="tasks"><strong>${openTasks.length}</strong><span>CRM-Aufgaben</span></button><button class="brief-button" type="button" data-go="waitlist"><strong>${state.waitlist.filter(item => item.status === 'open').length}</strong><span>Warteliste</span></button><button class="brief-button" type="button" data-go="invoices"><strong>${openInvoices.length}</strong><span>Forderungen</span></button>`;

    document.querySelectorAll('[data-edit-appointment]').forEach(button => button.onclick = () => openAppointment(button.dataset.editAppointment));
    document.querySelectorAll('[data-open-customer]').forEach(button => button.onclick = () => openCustomer(button.dataset.openCustomer));
    document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => showPanel(button.dataset.go));
  }

  // Kundentermine, die online über die Buchungsseite entstanden sind, tragen
  // dieselbe profile-id in customer_id UND created_by (die Kundin hat sich
  // selbst gebucht). Termine, die Liliane im Dashboard für eine Kundin
  // einträgt, haben kein verknüpftes Kundenprofil (customer_id ist leer) --
  // dieses Muster braucht kein neues Datenbankfeld, es steckt schon in den
  // bestehenden Spalten.
  function appointmentOrigin(appointment) {
    if (appointment.is_private) return 'private';
    if (appointment.customer_id && appointment.customer_id === appointment.created_by) return 'online';
    return 'admin';
  }
  function appointmentOriginLabel(origin) {
    return { private: 'Privat', online: 'Online gebucht', admin: 'Von Liliane erfasst' }[origin] || '';
  }
  function appointmentOriginClass(origin) {
    return { private: 'is-private', online: 'is-online', admin: 'is-admin-entered' }[origin] || '';
  }

  // Zeitraster-Kalender: 72px pro Stunde (siehe passende repeating-linear-
  // gradient-Zeilenhöhe in dashboard.css .admin-day-body) -- beide Werte
  // müssen synchron bleiben, sonst driften Stundenlinien und Terminhöhen
  // auseinander. 15-Minuten-Raster beim Ziehen, das ist feiner als der
  // öffentliche 90-Minuten-Buchungsraster (booking.js SLOT_MINUTES), aber
  // Liliane trägt Termine im Dashboard ohnehin frei nach Bedarf ein.
  const CAL_PX_PER_MIN = 1.2;
  const CAL_SLOT_MINUTES = 15;

  // Ermittelt den sichtbaren Zeitbereich der aktuellen Woche: mindestens die
  // Öffnungszeiten, aber zusätzlich erweitert um jeden tatsächlich
  // eingetragenen Termin/Sperrzeit dieser Woche, damit ein früher oder
  // später liegender Eintrag nie oberhalb/unterhalb des Rasters abgeschnitten
  // wird. Auf volle Stunden gerundet, plus eine Pufferstunde unten.
  function calendarBounds(days) {
    const toMin = value => Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]);
    const hours = state.settings?.opening_hours || {};
    let min = null, max = null;
    Object.values(hours).forEach(range => {
      if (!range) return;
      const start = toMin(range[0]), end = toMin(range[1]);
      min = min === null ? start : Math.min(min, start);
      max = max === null ? end : Math.max(max, end);
    });
    if (min === null) { min = 9 * 60; max = 18 * 60; }
    const keys = new Set(days.map(dayKey));
    // Mehrtägige Sperren (Ferien) würden das Raster auf 0–24 Uhr ausdehnen.
    [...state.appointments, ...state.blocks.filter(b => dayKey(b.starts_at) === dayKey(b.ends_at))].forEach(item => {
      if (item.status === 'cancelled' || !keys.has(dayKey(item.starts_at))) return;
      const s = new Date(item.starts_at), e = new Date(item.ends_at);
      min = Math.min(min, s.getHours() * 60 + s.getMinutes());
      max = Math.max(max, e.getHours() * 60 + e.getMinutes());
    });
    min = Math.max(0, Math.floor(min / 60) * 60);
    max = Math.min(24 * 60, Math.ceil(max / 60) * 60 + 60);
    return { min, max };
  }

  // Handy: Tagesansicht in voller Breite statt 7 Spalten mit seitlichem
  // Scrollen. Oben eine Leiste mit den Tagen der Woche (Anzahl Termine),
  // Pfeile und Wischen wechseln tageweise. Computer/Tablet: Wochenansicht.
  const isCompactCalendar = () => window.matchMedia('(max-width: 720px)').matches;
  // Ansicht: gewählt (state.calView) oder Standard -- Handy Tag, sonst Woche.
  const calendarView = () => state.calView || (isCompactCalendar() ? 'day' : 'week');
  function shiftCalendar(direction) {
    const view = calendarView();
    if (view === 'month') { const d = addMonths(monthStart(state.calDay), direction); setCalendarDay(d); }
    else setCalendarDay(addDays(state.calDay, view === 'week' ? 7 * direction : direction));
  }
  function setCalendarDay(date) {
    state.calDay = startOfDay(date);
    state.week = startOfWeek(state.calDay);
    renderCalendar();
  }

  function renderDayStrip() {
    const strip = $('calendar-day-strip');
    strip.hidden = calendarView() !== 'day';
    if (strip.hidden) return;
    const today = dayKey(new Date()), selected = dayKey(state.calDay);
    strip.innerHTML = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(state.week, index), key = dayKey(date);
      const count = state.appointments.filter(a => a.status !== 'cancelled' && !a.is_private && dayKey(a.starts_at) === key).length;
      return `<button type="button" class="day-strip-day${key === selected ? ' is-selected' : ''}${key === today ? ' is-today' : ''}" data-strip-day="${key}" aria-pressed="${key === selected}" aria-label="${esc(fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }))}, ${count} Termine"><span>${esc(fmt(date, { weekday: 'short' }).replace('.', ''))}</span><strong>${date.getDate()}</strong><small>${count ? count : ''}</small></button>`;
    }).join('');
    strip.querySelectorAll('[data-strip-day]').forEach(button => button.onclick = () => {
      const [y, m, d] = button.dataset.stripDay.split('-').map(Number);
      setCalendarDay(new Date(y, m - 1, d));
    });
  }

  // Ein Termin/eine Sperre als Listenzeile (Wochenliste auf dem Handy).
  function agendaItem(item) {
    const time = `${fmt(item.starts_at, { hour: '2-digit', minute: '2-digit' })}–${fmt(item.ends_at, { hour: '2-digit', minute: '2-digit' })}`;
    if (item.type === 'block') return `<button type="button" class="agenda-item is-block" data-delete-block="${item.id}"><time>${time}</time><span><strong>Gesperrt</strong><small>${esc(item.reason || '')}</small></span></button>`;
    const origin = appointmentOrigin(item);
    return `<button type="button" class="agenda-item ${appointmentOriginClass(origin)} status-${item.status}" title="${esc(labelStatus(item.status))}" data-edit-appointment="${item.id}"><time>${time}</time><span><strong>${esc(item.customer_name)}</strong><small>${esc(item.services?.name || 'Privat')}</small></span></button>`;
  }

  function dayItems(key) {
    return [
      ...state.appointments.filter(a => a.status !== 'cancelled' && dayKey(a.starts_at) === key).map(a => ({ ...a, type: 'appointment' })),
      ...blocksOnDay(key)
    ].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }

  function bindCalendarListActions(root) {
    root.querySelectorAll('[data-edit-appointment]').forEach(button => button.onclick = () => { if (!suppressCalendarClick) openAppointment(button.dataset.editAppointment); });
    root.querySelectorAll('[data-delete-block]').forEach(button => button.onclick = () => removeBlock(button.dataset.deleteBlock));
    root.querySelectorAll('[data-goto-day]').forEach(button => button.onclick = () => {
      const [y, m, d] = button.dataset.gotoDay.split('-').map(Number);
      state.calView = 'day';
      setCalendarDay(new Date(y, m - 1, d));
    });
  }

  // Woche auf dem Handy: 7 Tage untereinander statt 7 Spalten.
  function renderWeekAgenda() {
    const today = dayKey(new Date());
    const hours = state.settings?.opening_hours || {};
    $('admin-calendar').innerHTML = `<div class="cal-agenda">${Array.from({ length: 7 }, (_, index) => {
      const date = addDays(state.week, index), key = dayKey(date), items = dayItems(key);
      const appointments = items.filter(i => i.type === 'appointment' && !i.is_private).length;
      const closed = !hours[String(date.getDay())];
      return `<section class="agenda-day${key === today ? ' is-today' : ''}"><button type="button" class="agenda-head" data-goto-day="${key}"><strong>${esc(fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }))}</strong><span>${appointments ? `${appointments} Termin${appointments === 1 ? '' : 'e'}` : closed ? 'Geschlossen' : 'Frei'} ›</span></button>${items.length ? items.map(agendaItem).join('') : ''}</section>`;
    }).join('')}</div>`;
    bindCalendarListActions($('admin-calendar'));
  }

  // Monat: Raster Mo–So, pro Tag Anzahl Termine (am Computer zusätzlich
  // die ersten Termine). Tipp auf einen Tag öffnet die Tagesansicht.
  function renderMonthView() {
    const first = monthStart(state.calDay), gridStart = startOfWeek(first);
    const last = addDays(addMonths(first, 1), -1), gridEnd = addDays(startOfWeek(last), 6);
    const today = dayKey(new Date()), selected = dayKey(state.calDay), wide = !isCompactCalendar();
    const cells = [];
    for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
      const key = dayKey(date), items = dayItems(key).filter(i => i.type === 'appointment');
      const preview = wide ? items.slice(0, 3).map(i => `<span class="month-entry">${esc(fmt(i.starts_at, { hour: '2-digit', minute: '2-digit' }))} ${esc(i.customer_name)}</span>`).join('') + (items.length > 3 ? `<span class="month-more">+${items.length - 3} weitere</span>` : '') : '';
      cells.push(`<button type="button" class="month-cell${date.getMonth() !== first.getMonth() ? ' is-other' : ''}${key === today ? ' is-today' : ''}${key === selected ? ' is-selected' : ''}" data-goto-day="${key}" aria-label="${esc(fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }))}, ${items.length} Termine"><span class="month-num">${date.getDate()}</span>${items.length ? `<span class="month-count">${items.length}</span>` : ''}${preview}</button>`);
    }
    const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => `<span>${d}</span>`).join('');
    $('admin-calendar').innerHTML = `<div class="cal-month"><div class="cal-month-head">${weekdays}</div><div class="cal-month-grid">${cells.join('')}</div></div>`;
    bindCalendarListActions($('admin-calendar'));
  }

  function renderCalendar() {
    const view = calendarView();
    if (!state.calDay || startOfWeek(state.calDay).getTime() !== state.week.getTime()) {
      const today = startOfDay(new Date());
      state.calDay = startOfWeek(today).getTime() === state.week.getTime() ? today : new Date(state.week);
    }
    const compact = view === 'day';
    const end = addDays(state.week, 6);
    $('week-title').textContent = view === 'month' ? fmt(state.calDay, { month: 'long', year: 'numeric' })
      : compact ? fmt(state.calDay, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : `${fmt(state.week, { day: '2-digit', month: 'short' })} bis ${fmt(end, { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const unit = { day: ['Vorheriger Tag', 'Nächster Tag'], week: ['Vorherige Woche', 'Nächste Woche'], month: ['Vorheriger Monat', 'Nächster Monat'] }[view];
    $('week-prev').setAttribute('aria-label', unit[0]);
    $('week-next').setAttribute('aria-label', unit[1]);
    document.querySelectorAll('[data-cal-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.calView === view)));
    const calendar = $('admin-calendar');
    calendar.classList.toggle('is-day-view', compact);
    calendar.classList.toggle('is-list-view', view === 'month' || (view === 'week' && isCompactCalendar()));
    renderDayStrip();
    if (view === 'month') { renderMonthView(); return; }
    if (view === 'week' && isCompactCalendar()) { renderWeekAgenda(); return; }
    const days = compact ? [state.calDay] : Array.from({ length: 7 }, (_, index) => addDays(state.week, index));

    const { min, max } = calendarBounds(days);
    const gridHeight = (max - min) * CAL_PX_PER_MIN;
    const hourMarks = [];
    for (let m = Math.ceil(min / 60) * 60; m <= max; m += 60) hourMarks.push(m);
    // Die Zeitleiste hat eine unsichtbare Kopfzeile im selben Aufbau wie die
    // Tage, damit die Stunden exakt auf den Rasterlinien stehen (die Höhe der
    // Kopfzeile hängt von der Schrift ab).
    const gutter = `<div class="admin-time-gutter"><div class="admin-day-head admin-gutter-head" aria-hidden="true"><strong>&nbsp;</strong><span>&nbsp;</span></div><div class="admin-gutter-body">${hourMarks.map(m => `<span style="top:${(m - min) * CAL_PX_PER_MIN}px">${String(Math.floor(m / 60)).padStart(2, '0')}:00</span>`).join('')}</div></div>`;

    const dayCols = days.map(date => {
      const key = dayKey(date);
      const events = state.appointments.filter(a => dayKey(a.starts_at) === key && a.status !== 'cancelled').map(a => ({ ...a, type: 'appointment' }));
      const blocks = blocksOnDay(key);
      const body = [...events, ...blocks].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).map(event => {
        const s = new Date(event.starts_at), e = new Date(event.ends_at);
        const startMin = event.type === 'block' ? Math.max(event.dayStartMin, min) : s.getHours() * 60 + s.getMinutes();
        const endMin = event.type === 'block' ? Math.min(event.dayEndMin, max) : e.getHours() * 60 + e.getMinutes();
        const top = Math.max(0, (startMin - min) * CAL_PX_PER_MIN);
        const height = Math.max(28, (endMin - startMin) * CAL_PX_PER_MIN);
        const style = `top:${top}px;height:${height}px`;
        const time = event.multiDay
          ? `<time>${fmt(event.starts_at, { day: '2-digit', month: '2-digit' })}–${fmt(new Date(e - 1), { day: '2-digit', month: '2-digit' })}</time>`
          : `<time>${fmt(event.starts_at, { hour: '2-digit', minute: '2-digit' })}–${fmt(event.ends_at, { hour: '2-digit', minute: '2-digit' })}</time>`;
        // Kurze Termine (< ~75 Min., < 96px hoch) haben keinen Platz für alle
        // vier Zeilen -- Service/Herkunfts-Badge würden abgeschnitten. Statt
        // Text zu verstecken (der User weiss dann nicht, was fehlt), zeigen
        // wir dort nur Zeit+Name; alles Weitere bleibt im Bearbeiten-Dialog
        // einen Klick entfernt.
        const compact = height < 96;
        if (event.type === 'block') {
          const detail = compact ? '' : `<small>${esc(event.reason)}</small>`;
          return `<button class="calendar-event is-block" type="button" style="${style}" data-delete-block="${event.id}">${time}<strong>Gesperrt</strong>${detail}</button>`;
        }
        const origin = appointmentOrigin(event);
        const detail = compact ? '' : `<small>${esc(event.services?.name || 'Privat')}</small><span class="calendar-event-origin">${esc(appointmentOriginLabel(origin))}</span>`;
        const handles = event.status === 'booked' ? '<span class="cal-resize is-top" data-resize="top" title="Ziehen zum Verlängern/Verkürzen"></span><span class="cal-resize is-bottom" data-resize="bottom" title="Ziehen zum Verlängern/Verkürzen"></span>' : '';
        return `<button class="calendar-event ${appointmentOriginClass(origin)} status-${event.status}" title="${esc(labelStatus(event.status))}" type="button" draggable="${isTouchDevice() ? 'false' : 'true'}" style="${style}" data-edit-appointment="${event.id}" data-movable>${time}<strong>${esc(event.customer_name)}</strong>${detail}${handles}</button>`;
      }).join('');
      return `<section class="admin-day" data-date="${key}"><div class="admin-day-head"><strong>${fmt(date, { weekday: 'short' })}</strong><span>${fmt(date, { day: '2-digit', month: '2-digit' })}</span></div><div class="admin-day-body" style="height:${gridHeight}px">${body}</div></section>`;
    }).join('');

    $('admin-calendar').innerHTML = gutter + dayCols;
    document.querySelectorAll('[data-edit-appointment]').forEach(button => button.onclick = () => { if (!suppressCalendarClick) openAppointment(button.dataset.editAppointment); });
    document.querySelectorAll('[data-delete-block]').forEach(button => button.onclick = () => removeBlock(button.dataset.deleteBlock));
    calendarGrid = { min, max };
    attachCalendarDragHandlers(min, max);
    attachCalendarMoveHandlers();
    attachCalendarResizeHandlers(min, max);
    attachCalendarGapHandlers(min, max);
  }

  // Sperrzeiten, die einen Tag berühren -- auch mehrtägige (Ferien), auf
  // den Tag zugeschnitten (Minuten ab Mitternacht, Tagesende = 1440).
  function blocksOnDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d), dayEnd = addDays(dayStart, 1);
    return state.blocks.filter(b => new Date(b.starts_at) < dayEnd && new Date(b.ends_at) > dayStart).map(b => {
      const s = new Date(Math.max(new Date(b.starts_at), dayStart)), e = new Date(Math.min(new Date(b.ends_at), dayEnd));
      return { ...b, type: 'block', dayStartMin: s.getHours() * 60 + s.getMinutes(), dayEndMin: e >= dayEnd ? 24 * 60 : e.getHours() * 60 + e.getMinutes(), multiDay: dayKey(b.starts_at) !== dayKey(new Date(new Date(b.ends_at) - 1)) };
    });
  }

  // Belegte Minuten-Intervalle eines Tages (Minuten ab Mitternacht, wie beim
  // Rendern), optional ohne einen bestimmten Termin -- Grundlage für die
  // Grenzen beim Verlängern/Verkürzen und für freie Lücken.
  function busyRangesOfDay(key, excludeId = null) {
    const toMin = value => { const d = new Date(value); return d.getHours() * 60 + d.getMinutes(); };
    return [
      ...state.appointments.filter(a => a.id !== excludeId && a.status !== 'cancelled' && dayKey(a.starts_at) === key)
        .map(item => ({ start: toMin(item.starts_at), end: dayKey(item.ends_at) === key ? toMin(item.ends_at) : 24 * 60 })),
      ...blocksOnDay(key).map(b => ({ start: b.dayStartMin, end: b.dayEndMin }))
    ];
  }

  function durationLabel(minutes) {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return [h ? `${h} Std.` : '', m ? `${m} Min.` : ''].filter(Boolean).join(' ');
  }

  // Verlängern/Verkürzen am oberen bzw. unteren Rand im 15-Minuten-Raster.
  // Pointer-Events statt nativem Drag & Drop, damit es sich nicht mit dem
  // Verschieben der ganzen Karte (dragstart) beisst. Die Karte folgt dem
  // Cursor live und stoppt an Nachbarterminen/Sperrzeiten, an 15 Min.
  // Mindest- und 4 Std. Höchstdauer (appointments_duration_check). Erst nach
  // "OK" im Sicherheitsdialog wird gespeichert, "Abbrechen" stellt die alte
  // Darstellung wieder her.
  let resizeState = null;
  let suppressCalendarClick = false;

  // Touch-Bedienung (Handy/Tablet): Ein Tipp, der eigentlich Scrollen war
  // oder eine laufende Scrollbewegung stoppt, darf nichts öffnen. Erkennt
  // Fingerbewegung > 10 px, vom Browser abgebrochene Gesten (Scrollen) und
  // Klicks bis 400 ms nach dem letzten Scroll-Ereignis.
  const isTouchDevice = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;
  let lastScrollAt = 0, lastPointer = null;
  window.addEventListener('scroll', () => { lastScrollAt = Date.now(); }, { capture: true, passive: true });
  document.addEventListener('pointerdown', event => {
    lastPointer = { type: event.pointerType, x: event.clientX, y: event.clientY, moved: false };
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', event => {
    if (lastPointer && event.pointerType !== 'mouse' && Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) > 10) lastPointer.moved = true;
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => { if (lastPointer) lastPointer.moved = true; }, { capture: true, passive: true });
  document.addEventListener('click', event => {
    if (!lastPointer || lastPointer.type === 'mouse') return;
    if (event.target.closest('input, select, textarea, label')) return;
    if (lastPointer.moved || Date.now() - lastScrollAt < 400) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  function attachCalendarResizeHandlers(gridMin, gridMax) {
    document.querySelectorAll('.calendar-event [data-resize]').forEach(handle => {
      // Maus: sofort ziehen. Finger: erst nach 350 ms ruhigem Halten (sonst
      // ist es Scrollen) -- dann kurze Vibration als Rückmeldung.
      let pendingTouch = null;
      const startResize = (pointerId, clientY) => {
        const card = handle.closest('.calendar-event');
        const appointment = state.appointments.find(a => a.id === card.dataset.editAppointment);
        if (!appointment) return false;
        const s = new Date(appointment.starts_at), e = new Date(appointment.ends_at);
        const startMin = s.getHours() * 60 + s.getMinutes();
        const endMin = startMin + Math.round((e - s) / 60000);
        const busy = busyRangesOfDay(dayKey(s), appointment.id);
        const edge = handle.dataset.resize;
        const limit = edge === 'top'
          ? Math.max(gridMin, endMin - 240, ...busy.filter(r => r.end <= startMin).map(r => r.end))
          : Math.min(gridMax, startMin + 240, ...busy.filter(r => r.start >= endMin).map(r => r.start));
        resizeState = { appointment, card, edge, startMin, endMin, limit, originY: clientY, newStart: startMin, newEnd: endMin, pointerId };
        card.draggable = false;
        card.classList.add('is-resizing');
        // Capture kann in einzelnen (Android-)WebViews fehlschlagen; Ziehen
        // funktioniert dann trotzdem, solange der Finger auf dem Griff bleibt.
        try { handle.setPointerCapture(pointerId); } catch {}
        return true;
      };
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (event.pointerType === 'mouse') { event.preventDefault(); startResize(event.pointerId, event.clientY); return; }
        const card = handle.closest('.calendar-event');
        card.classList.add('is-arming');
        pendingTouch = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: setTimeout(() => {
          card.classList.remove('is-arming');
          if (!pendingTouch) return;
          if (startResize(pendingTouch.pointerId, pendingTouch.y)) navigator.vibrate?.(15);
          pendingTouch = null;
        }, 350) };
      });
      const cancelPending = () => {
        if (!pendingTouch) return;
        clearTimeout(pendingTouch.timer);
        handle.closest('.calendar-event')?.classList.remove('is-arming');
        pendingTouch = null;
      };
      handle.addEventListener('pointermove', event => {
        if (pendingTouch && Math.hypot(event.clientX - pendingTouch.x, event.clientY - pendingTouch.y) > 8) cancelPending();
      });
      handle.addEventListener('pointerup', cancelPending);
      handle.addEventListener('pointercancel', cancelPending);
      // Während des Ziehens mit dem Finger die Seite nicht mitscrollen.
      handle.addEventListener('touchmove', event => { if (resizeState) event.preventDefault(); }, { passive: false });
      handle.addEventListener('pointermove', event => {
        const r = resizeState;
        if (!r || r.pointerId !== event.pointerId) return;
        const delta = (event.clientY - r.originY) / CAL_PX_PER_MIN;
        const snap = value => Math.round(value / CAL_SLOT_MINUTES) * CAL_SLOT_MINUTES;
        if (r.edge === 'top') r.newStart = Math.min(r.endMin - CAL_SLOT_MINUTES, Math.max(r.limit, snap(r.startMin + delta)));
        else r.newEnd = Math.max(r.startMin + CAL_SLOT_MINUTES, Math.min(r.limit, snap(r.endMin + delta)));
        r.card.style.top = `${(r.newStart - gridMin) * CAL_PX_PER_MIN}px`;
        r.card.style.height = `${Math.max(28, (r.newEnd - r.newStart) * CAL_PX_PER_MIN)}px`;
        const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        r.card.querySelector('time').textContent = `${clock(r.newStart)}–${clock(r.newEnd)} · ${durationLabel(r.newEnd - r.newStart)}`;
      });
      const finish = event => {
        const r = resizeState;
        if (!r || r.pointerId !== event.pointerId) return;
        resizeState = null;
        r.card.classList.remove('is-resizing');
        r.card.draggable = !isTouchDevice();
        // Der Klick nach dem Loslassen soll nicht den Bearbeiten-Dialog öffnen.
        suppressCalendarClick = true;
        setTimeout(() => { suppressCalendarClick = false; }, 60);
        if (event.type === 'pointercancel' || (r.newStart === r.startMin && r.newEnd === r.endMin)) { renderCalendar(); return; }
        const base = new Date(r.appointment.starts_at);
        base.setHours(0, 0, 0, 0);
        const at = minutes => { const d = new Date(base); d.setMinutes(minutes); return d; };
        openResizeConfirm(r.appointment, at(r.newStart), at(r.newEnd));
      };
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });
  }

  function openResizeConfirm(appointment, newStart, newEnd, mode = 'resize') {
    const oldStart = new Date(appointment.starts_at), oldEnd = new Date(appointment.ends_at);
    const oldMinutes = Math.round((oldEnd - oldStart) / 60000), newMinutes = Math.round((newEnd - newStart) / 60000);
    const range = (a, b) => `${fmt(a, { weekday: 'short', day: '2-digit', month: '2-digit' })}, ${fmt(a, { hour: '2-digit', minute: '2-digit' })}–${fmt(b, { hour: '2-digit', minute: '2-digit' })}`;
    const canEmail = !appointment.is_private && !!appointment.customer_email;
    $('resize-confirm-title').textContent = mode === 'move' ? 'Termin verschieben?' : newMinutes > oldMinutes ? 'Termin verlängern?' : newMinutes < oldMinutes ? 'Termin verkürzen?' : 'Termin anpassen?';
    $('resize-confirm-who').textContent = `${appointment.customer_name} · ${appointment.services?.name || 'Termin'}`;
    $('resize-confirm-old').textContent = `${range(oldStart, oldEnd)} (${durationLabel(oldMinutes)})`;
    $('resize-confirm-new').textContent = `${range(newStart, newEnd)} (${durationLabel(newMinutes)})`;
    $('resize-confirm-note').textContent = canEmail
      ? `Nach OK erhalten die Kundin (${appointment.customer_email}) und du eine Info-Mail.`
      : 'Nach OK erhältst du eine Info-Mail. Für die Kundin ist keine E-Mail-Adresse hinterlegt.';
    $('resize-confirm-message').textContent = '';
    $('resize-confirm-ok').disabled = false;
    $('resize-confirm-ok').onclick = () => saveResize(appointment, newStart, newEnd, canEmail, mode);
    $('resize-confirm-cancel').onclick = cancelResize;
    openModal('resize-confirm-modal');
    $('resize-confirm-ok').focus();
  }
  function cancelResize() { closeModal('resize-confirm-modal'); renderCalendar(); }

  async function saveResize(appointment, newStart, newEnd, canEmail, mode = 'resize') {
    const conflict = state.appointments.some(a => a.id !== appointment.id && a.status !== 'cancelled' && newStart < new Date(a.ends_at) && newEnd > new Date(a.starts_at))
      || state.blocks.some(b => newStart < new Date(b.ends_at) && newEnd > new Date(b.starts_at));
    if (conflict) { $('resize-confirm-message').textContent = 'Termin kollidiert mit einem bestehenden Termin oder einer Sperrzeit.'; return; }
    $('resize-confirm-ok').disabled = true;
    const result = await db.from('appointments').update({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() }).eq('id', appointment.id);
    if (result.error) { $('resize-confirm-ok').disabled = false; $('resize-confirm-message').textContent = result.error.message; return; }
    closeModal('resize-confirm-modal');
    if (mode === 'move') closeModal('appointment-modal');
    let mailError = null;
    if (canEmail) ({ error: mailError } = await db.rpc('queue_reschedule_email', { requested_appointment_id: appointment.id, change: mode === 'move' ? 'moved' : 'duration' }));
    await loadAll();
    // Verschobenen Termin im Kalender zeigen (Woche wechseln, falls nötig).
    if (mode === 'move') { state.calDay = startOfDay(newStart); state.week = startOfWeek(newStart); renderCalendar(); }
    pulseAppointment(appointment.id);
    const done = mode === 'move' ? 'Termin verschoben' : 'Termin angepasst';
    toast(mailError ? `${done}, Kundinnen-Mail fehlgeschlagen: ${mailError.message}` : canEmail ? `${done}. Info-Mails an Kundin und dich sind eingeplant.` : `${done}. Info-Mail an dich ist eingeplant.`);
  }

  // Klick in eine freie Fläche: kleines Fenster, in dem Liliane zuerst
  // die Dauer wählt (15 Min. bis 2 Std.) ab der angeklickten Viertelstunde;
  // Dauern, die nicht bis zum nächsten Termin/zur nächsten Sperrzeit
  // passen, sind deaktiviert. Danach öffnet sich der Termin-Dialog mit Tag,
  // Uhrzeit und Dauer. Mit der Maus zeigt eine Vorschau («+ 10:15»), welche
  // Viertelstunde ein Klick trifft.
  const clockLabel = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  function freeSlotAt(dateKey, body, clientY, gridMin, gridMax) {
    const offset = (clientY - body.getBoundingClientRect().top) / CAL_PX_PER_MIN;
    const start = gridMin + Math.floor(offset / CAL_SLOT_MINUTES) * CAL_SLOT_MINUTES;
    if (start < gridMin || start + CAL_SLOT_MINUTES > gridMax) return null;
    const busy = busyRangesOfDay(dateKey);
    if (busy.some(r => start < r.end && start + CAL_SLOT_MINUTES > r.start)) return null;
    return { start, gapEnd: Math.min(gridMax, ...busy.filter(r => r.start >= start + CAL_SLOT_MINUTES).map(r => r.start)) };
  }

  function attachCalendarGapHandlers(gridMin, gridMax) {
    document.querySelectorAll('.admin-day').forEach(day => {
      const body = day.querySelector('.admin-day-body');
      if (!body) return;
      const hover = document.createElement('div');
      hover.className = 'slot-hover';
      hover.hidden = true;
      body.appendChild(hover);
      body.addEventListener('mousemove', event => {
        const slot = event.target === body && !moveState && !resizeState ? freeSlotAt(day.dataset.date, body, event.clientY, gridMin, gridMax) : null;
        hover.hidden = !slot;
        if (!slot) return;
        hover.style.top = `${(slot.start - gridMin) * CAL_PX_PER_MIN}px`;
        hover.textContent = `+ ${clockLabel(slot.start)}`;
      });
      body.addEventListener('mouseleave', () => { hover.hidden = true; });
      body.addEventListener('click', event => {
        if (event.target !== body || suppressCalendarClick) return;
        const slot = freeSlotAt(day.dataset.date, body, event.clientY, gridMin, gridMax);
        if (!slot) return;
        hover.hidden = true;
        openGapMenu(day.dataset.date, slot.start, slot.gapEnd, event.clientX, event.clientY);
      });
    });
  }

  function openGapMenu(dateKey, startMin, gapEndMin, x, y) {
    const menu = $('gap-menu');
    const [year, month, dayOfMonth] = dateKey.split('-').map(Number);
    const at = minutes => { const d = new Date(year, month - 1, dayOfMonth, 0, 0, 0, 0); d.setMinutes(minutes); return d; };
    const start = at(startMin);
    $('gap-menu-title').textContent = `${fmt(start, { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${fmt(start, { hour: '2-digit', minute: '2-digit' })} Uhr`;
    $('gap-menu-hint').textContent = `Frei bis ${fmt(at(gapEndMin), { hour: '2-digit', minute: '2-digit' })} Uhr (${durationLabel(gapEndMin - startMin)})`;
    menu.querySelectorAll('[data-gap-minutes]').forEach(button => {
      const minutes = Number(button.dataset.gapMinutes);
      button.disabled = minutes > gapEndMin - startMin;
      button.onclick = () => { closeGapMenu(); openAppointment(null, { start, duration: minutes }); };
    });
    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector('[data-gap-minutes]:not(:disabled)')?.focus();
  }
  function closeGapMenu() { $('gap-menu').hidden = true; }

  // Verschieben mit Maus/Trackpad: natives Drag & Drop. Das Abbild, das
  // der Browser beim Ziehen mitführt, würde genau über der Vorschau liegen
  // und die neue Uhrzeit verdecken -- es wird durch ein unsichtbares Bild
  // ersetzt. Sichtbar ist stattdessen eine Vorschau-Karte im Raster (an der
  // Griffstelle ausgerichtet) mit neuer Uhrzeit und Name, plus Markierung
  // der Startzeit in der Zeitleiste; rot = Platz belegt. Halten über
  // «‹»/«›» wechselt die Woche (bindWeekDragToShift).
  let draggedAppointmentId = null;
  let draggedDurationMinutes = 0;
  let draggedGrabOffset = 0;
  let draggedName = '';
  const blankDragImage = new Image();
  blankDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  function clearDragPreview() {
    document.querySelectorAll('.admin-day.drop-target').forEach(el => el.classList.remove('drop-target'));
    document.querySelectorAll('.drop-ghost, .drag-time-marker').forEach(el => el.remove());
  }

  function attachCalendarDragHandlers(gridMin, gridMax) {
    document.querySelectorAll('.calendar-event[data-edit-appointment]').forEach(button => {
      button.addEventListener('dragstart', event => {
        if (resizeState) { event.preventDefault(); return; }
        draggedAppointmentId = button.dataset.editAppointment;
        const appointment = state.appointments.find(a => a.id === draggedAppointmentId);
        draggedDurationMinutes = appointment ? Math.round((new Date(appointment.ends_at) - new Date(appointment.starts_at)) / 60000) : 90;
        draggedGrabOffset = event.clientY - button.getBoundingClientRect().top;
        draggedName = appointment?.customer_name || '';
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedAppointmentId);
        if (blankDragImage.complete) event.dataTransfer.setDragImage(blankDragImage, 0, 0);
        button.classList.add('is-dragging');
        closeGapMenu();
      });
      button.addEventListener('dragend', () => {
        button.classList.remove('is-dragging');
        clearDragPreview();
        draggedAppointmentId = null;
      });
    });
    document.querySelectorAll('.admin-day').forEach(day => {
      const body = day.querySelector('.admin-day-body');
      if (!body) return;
      day.addEventListener('dragover', event => {
        if (!draggedAppointmentId) return;
        event.preventDefault();
        day.classList.add('drop-target');
        const raw = gridMin + (event.clientY - draggedGrabOffset - body.getBoundingClientRect().top) / CAL_PX_PER_MIN;
        const start = Math.max(gridMin, Math.min(gridMax - draggedDurationMinutes, Math.round(raw / CAL_SLOT_MINUTES) * CAL_SLOT_MINUTES));
        const valid = !busyRangesOfDay(day.dataset.date, draggedAppointmentId).some(r => start < r.end && start + draggedDurationMinutes > r.start);
        // Nur eine Vorschau gleichzeitig (auch beim Wechsel in eine andere Spalte).
        document.querySelectorAll('.drop-ghost').forEach(el => { if (el.parentElement !== body) el.remove(); });
        document.querySelectorAll('.admin-day.drop-target').forEach(el => { if (el !== day) el.classList.remove('drop-target'); });
        let ghost = body.querySelector('.drop-ghost');
        if (!ghost) { ghost = document.createElement('div'); ghost.className = 'drop-ghost'; ghost.innerHTML = '<time></time><strong></strong>'; body.appendChild(ghost); }
        ghost.style.top = `${(start - gridMin) * CAL_PX_PER_MIN}px`;
        ghost.style.height = `${Math.max(28, draggedDurationMinutes * CAL_PX_PER_MIN)}px`;
        ghost.classList.toggle('is-conflict', !valid);
        ghost.querySelector('time').textContent = valid ? `${clockLabel(start)}–${clockLabel(start + draggedDurationMinutes)}` : `${clockLabel(start)} · belegt`;
        ghost.querySelector('strong').textContent = draggedName;
        ghost.dataset.minutesOfDay = start;
        // Startzeit zusätzlich links in der Zeitleiste markieren.
        const gutter = $('admin-calendar').querySelector('.admin-time-gutter');
        if (gutter) {
          let marker = gutter.querySelector('.drag-time-marker');
          if (!marker) { marker = document.createElement('span'); marker.className = 'drag-time-marker'; gutter.appendChild(marker); }
          marker.style.top = `${body.getBoundingClientRect().top - gutter.getBoundingClientRect().top + (start - gridMin) * CAL_PX_PER_MIN}px`;
          marker.textContent = clockLabel(start);
          marker.classList.toggle('is-conflict', !valid);
        }
        ghost.dataset.valid = valid ? '1' : '';
        event.dataTransfer.dropEffect = valid ? 'move' : 'none';
      });
      day.addEventListener('dragleave', event => {
        if (day.contains(event.relatedTarget)) return;
        day.classList.remove('drop-target');
        body.querySelector('.drop-ghost')?.remove();
        $('admin-calendar').querySelector('.drag-time-marker')?.remove();
      });
      day.addEventListener('drop', event => {
        event.preventDefault();
        const ghost = body.querySelector('.drop-ghost');
        const minutesOfDay = ghost ? Number(ghost.dataset.minutesOfDay) : null;
        const valid = ghost?.dataset.valid === '1';
        clearDragPreview();
        if (!draggedAppointmentId || minutesOfDay === null) return;
        const id = draggedAppointmentId;
        draggedAppointmentId = null;
        if (!valid) { toast('Dort ist bereits ein Termin oder eine Sperrzeit.'); return; }
        rescheduleAppointment(id, day.dataset.date, minutesOfDay);
      });
    });
  }

  // Verschieben mit dem Finger (Handy/Tablet; natives Drag & Drop gibt es
  // dort nicht): nach 350 ms ruhigem Halten folgt die Terminkarte dem
  // Finger live im 15-Minuten-Raster, auch auf andere Tage der Ansicht; die
  // Zeit auf der Karte zeigt laufend die neue Uhrzeit, rot = Platz belegt.
  // Hält man die Karte über «‹»/«›», wechselt die Ansicht nach kurzer Zeit. Die Karte wird
  // dabei aus ihrem HTML neu erzeugt, weil renderCalendar() die Spalten neu
  // aufbaut; die Pointer-Listener hängen deshalb am document.
  let calendarGrid = { min: 0, max: 24 * 60 };
  let pendingMove = null;
  let moveState = null;

  function attachCalendarMoveHandlers() {
    document.querySelectorAll('.calendar-event[data-movable]').forEach(card => {
      card.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' || event.button !== 0 || event.target.closest('[data-resize]') || resizeState || moveState) return;
        const appointment = state.appointments.find(a => a.id === card.dataset.editAppointment);
        if (!appointment) return;
        const pending = { appointment, card, pointerId: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY, grabOffset: event.clientY - card.getBoundingClientRect().top };
        pendingMove = pending;
        card.classList.add('is-arming');
        pending.timer = setTimeout(() => {
          card.classList.remove('is-arming');
          if (pendingMove !== pending) return;
          pendingMove = null;
          beginMove(pending);
          navigator.vibrate?.(15);
        }, 350);
      });
    });
  }

  function cancelPendingMove() {
    if (!pendingMove) return;
    clearTimeout(pendingMove.timer);
    pendingMove.card.classList.remove('is-arming');
    pendingMove = null;
  }

  function beginMove(pending) {
    const start = new Date(pending.appointment.starts_at);
    moveState = {
      appointment: pending.appointment, pointerId: pending.pointerId, card: pending.card, html: pending.card.outerHTML,
      grabOffset: pending.grabOffset, duration: Math.round((new Date(pending.appointment.ends_at) - start) / 60000),
      dateKey: null, minutes: null, valid: false, holdTarget: null, holdTimer: null
    };
    pending.card.classList.add('is-moving');
    document.body.classList.add('is-moving-appointment');
    if ($('reschedule-flyout').classList.contains('is-visible')) hideRescheduleFlyout();
  }

  function updateMove(clientX, clientY) {
    const m = moveState;
    if (!m) return;
    const inside = (el, x, y) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    const arrow = [$('week-prev'), $('week-next')].find(button => inside(button, clientX, clientY)) || null;
    if (arrow !== m.holdTarget) {
      clearTimeout(m.holdTimer);
      m.holdTarget?.classList.remove('drop-target');
      m.holdTarget = arrow;
      if (arrow) {
        arrow.classList.add('drop-target');
        m.holdTimer = setTimeout(() => {
          arrow.classList.remove('drop-target');
          m.holdTarget = null;
          shiftCalendar(arrow.id === 'week-next' ? 1 : -1);
          updateMove(clientX, clientY);
        }, 650);
      }
    }
    const body = [...document.querySelectorAll('.admin-day-body')].find(el => { const r = el.getBoundingClientRect(); return clientX >= r.left && clientX <= r.right; });
    if (!body) return;
    if (!m.card.isConnected) {
      const template = document.createElement('template');
      template.innerHTML = m.html;
      m.card = template.content.firstElementChild;
      m.card.classList.remove('is-just-moved', 'is-arming');
      m.card.classList.add('is-moving');
    }
    if (m.card.parentElement !== body) body.appendChild(m.card);
    const { min, max } = calendarGrid;
    const raw = min + (clientY - m.grabOffset - body.getBoundingClientRect().top) / CAL_PX_PER_MIN;
    const start = Math.max(min, Math.min(max - m.duration, Math.round(raw / CAL_SLOT_MINUTES) * CAL_SLOT_MINUTES));
    const dateKey = body.closest('.admin-day').dataset.date;
    const valid = !busyRangesOfDay(dateKey, m.appointment.id).some(r => start < r.end && start + m.duration > r.start);
    Object.assign(m, { dateKey, minutes: start, valid });
    m.card.style.top = `${(start - min) * CAL_PX_PER_MIN}px`;
    m.card.classList.toggle('is-conflict', !valid);
    const time = m.card.querySelector('time');
    if (time) time.textContent = valid ? `${clockLabel(start)}–${clockLabel(start + m.duration)}` : `${clockLabel(start)} · belegt`;
  }

  function finishMove(cancelled) {
    const m = moveState;
    moveState = null;
    clearTimeout(m.holdTimer);
    m.holdTarget?.classList.remove('drop-target');
    document.body.classList.remove('is-moving-appointment');
    // Der Klick nach dem Loslassen soll nicht den Bearbeiten-Dialog öffnen.
    suppressCalendarClick = true;
    setTimeout(() => { suppressCalendarClick = false; }, 60);
    const old = new Date(m.appointment.starts_at);
    const unchanged = m.dateKey === dayKey(old) && m.minutes === old.getHours() * 60 + old.getMinutes();
    if (cancelled || m.minutes === null || unchanged) { renderCalendar(); return; }
    if (!m.valid) { renderCalendar(); toast('Dort ist bereits ein Termin oder eine Sperrzeit.'); return; }
    m.card.classList.remove('is-moving', 'is-conflict');
    m.card.classList.add('is-saving');
    rescheduleAppointment(m.appointment.id, m.dateKey, m.minutes);
  }

  // Einmalige Bindung am document (siehe oben).
  function bindCalendarMove() {
    const calendar = $('admin-calendar');
    document.addEventListener('pointermove', event => {
      if (pendingMove && pendingMove.pointerId === event.pointerId) {
        if (Math.hypot(event.clientX - pendingMove.x, event.clientY - pendingMove.y) > 8) cancelPendingMove();
      }
      if (!moveState || moveState.pointerId !== event.pointerId) return;
      // Am oberen/unteren Rand des Kalenders mitscrollen.
      const rect = calendar.getBoundingClientRect();
      if (event.clientY < rect.top + 40) calendar.scrollTop -= 14;
      else if (event.clientY > rect.bottom - 40) calendar.scrollTop += 14;
      updateMove(event.clientX, event.clientY);
    });
    document.addEventListener('pointerup', event => {
      if (pendingMove && pendingMove.pointerId === event.pointerId) cancelPendingMove();
      if (moveState && moveState.pointerId === event.pointerId) finishMove(false);
    });
    document.addEventListener('pointercancel', event => {
      if (pendingMove && pendingMove.pointerId === event.pointerId) cancelPendingMove();
      if (moveState && moveState.pointerId === event.pointerId) finishMove(true);
    });
    // Während des Verschiebens mit dem Finger die Seite nicht mitscrollen.
    document.addEventListener('touchmove', event => { if (moveState) event.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && moveState) finishMove(true); });
  }

  // Zieht einen Termin auf Tag+Uhrzeit (15-Minuten-Raster): Kollisionen
  // werden clientseitig geprüft (dieselbe Formel wie booking.js
  // slotStatus()), die DB-Exclusion-Constraint appointments_no_overlap
  // bleibt das eigentliche Sicherheitsnetz. Die Änderung wird sofort
  // gespeichert (kein Bestätigungsschritt, der jede Verschiebung ausbremst)
  // -- stattdessen zeigt das Flyout-Menü danach IMMER "Rückgängig" (1 Klick
  // stellt die alte Zeit wieder her) und, falls möglich, den optionalen
  // Mailversand. Der verschobene Termin pulsiert kurz, damit man ihn auf
  // Anhieb wiederfindet.
  async function rescheduleAppointment(appointmentId, dateKey, minutesOfDay) {
    const appointment = state.appointments.find(a => a.id === appointmentId);
    if (!appointment || !dateKey || minutesOfDay == null) return;
    const oldStart = new Date(appointment.starts_at);
    const oldEnd = new Date(appointment.ends_at);
    const [year, month, day] = dateKey.split('-').map(Number);
    const newStart = new Date(year, month - 1, day, 0, 0, 0, 0);
    newStart.setMinutes(minutesOfDay);
    if (newStart.getTime() === oldStart.getTime()) return;
    const newEnd = new Date(newStart.getTime() + (oldEnd - oldStart));
    const conflict = state.appointments.some(a => a.id !== appointmentId && a.status !== 'cancelled' && newStart < new Date(a.ends_at) && newEnd > new Date(a.starts_at))
      || state.blocks.some(b => newStart < new Date(b.ends_at) && newEnd > new Date(b.starts_at));
    if (conflict) { renderCalendar(); toast('Termin kollidiert mit einem bestehenden Termin oder einer Sperrzeit.'); return; }
    const result = await db.from('appointments').update({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() }).eq('id', appointmentId);
    if (result.error) { renderCalendar(); toast(result.error.message); return; }
    await loadAll();
    pulseAppointment(appointmentId);
    const canEmail = appointment.status === 'booked' && !appointment.is_private && !!appointment.customer_email;
    offerRescheduleEmail(appointmentId, oldStart, oldEnd, newStart, canEmail);
  }

  function pulseAppointment(appointmentId) {
    const el = document.querySelector(`.calendar-event[data-edit-appointment="${appointmentId}"]`);
    if (!el) return;
    el.classList.add('is-just-moved');
    setTimeout(() => el.classList.remove('is-just-moved'), 3000);
  }

  // Hält der Admin die Terminkarte beim Ziehen über "←"/"→" (Wochenwechsel),
  // springt der Kalender nach kurzer Verzögerung eine Woche weiter/zurück,
  // ohne den Drag abzubrechen -- so lässt sich ein Termin auch auf eine
  // andere Woche verschieben. Einmalige Bindung (die Buttons selbst werden
  // bei renderCalendar() nicht neu erzeugt, anders als die Terminkarten).
  let weekDragHoldTimer = null;
  function bindWeekDragToShift() {
    [$('week-prev'), $('week-next')].forEach(button => {
      button.addEventListener('dragover', event => {
        if (!draggedAppointmentId) return;
        event.preventDefault();
        button.classList.add('drop-target');
        if (weekDragHoldTimer) return;
        weekDragHoldTimer = setTimeout(() => { weekDragHoldTimer = null; button.click(); }, 650);
      });
      button.addEventListener('dragleave', () => {
        button.classList.remove('drop-target');
        clearTimeout(weekDragHoldTimer);
        weekDragHoldTimer = null;
      });
      button.addEventListener('drop', event => event.preventDefault());
    });
  }

  // Flyout nach jedem erfolgreichen Verschieben eines Termins (Drag & Drop
  // oder manuelle Bearbeitung im Dialog): erscheint IMMER, unabhängig davon,
  // ob eine E-Mail-Adresse hinterlegt ist -- "Rückgängig" macht die alte
  // Zeit mit einem Klick wieder her (die Verschiebung selbst ist ja längst
  // gespeichert, siehe rescheduleAppointment()), "Bestätigungsmail senden"
  // erscheint nur, wenn die Kundin überhaupt per Mail erreichbar ist. Der
  // eigentliche Versand läuft über die bestehende email_outbox/Resend-
  // Pipeline (RPC queue_reschedule_email, siehe Migration).
  let rescheduleFlyoutTimer = null;
  function offerRescheduleEmail(appointmentId, oldStart, oldEnd, newStart, canEmail) {
    const flyout = $('reschedule-flyout');
    const range = value => `${fmt(value, { weekday: 'short', day: '2-digit', month: '2-digit' })}, ${fmt(value, { hour: '2-digit', minute: '2-digit' })} Uhr`;
    $('reschedule-flyout-detail').textContent = canEmail
      ? `Von ${range(oldStart)} auf ${range(newStart)}. Soll die Kundin eine automatische Bestätigung per E-Mail erhalten?`
      : `Von ${range(oldStart)} auf ${range(newStart)}.`;
    $('reschedule-flyout-send').hidden = !canEmail;
    flyout.hidden = false;
    requestAnimationFrame(() => flyout.classList.add('is-visible'));
    clearTimeout(rescheduleFlyoutTimer);
    rescheduleFlyoutTimer = setTimeout(hideRescheduleFlyout, 45000);
    $('reschedule-flyout-send').onclick = async () => {
      hideRescheduleFlyout();
      const { error } = await db.rpc('queue_reschedule_email', { requested_appointment_id: appointmentId });
      toast(error ? error.message : 'Bestätigungsmail wurde eingeplant.');
    };
    $('reschedule-flyout-undo').onclick = async () => {
      hideRescheduleFlyout();
      const result = await db.from('appointments').update({ starts_at: oldStart.toISOString(), ends_at: oldEnd.toISOString() }).eq('id', appointmentId);
      if (result.error) { toast(result.error.message); return; }
      await loadAll();
      pulseAppointment(appointmentId);
      toast('Verschieben rückgängig gemacht.');
    };
    $('reschedule-flyout-close').onclick = hideRescheduleFlyout;
  }
  function hideRescheduleFlyout() {
    clearTimeout(rescheduleFlyoutTimer);
    const flyout = $('reschedule-flyout');
    flyout.classList.remove('is-visible');
    // Nur verstecken, wenn inzwischen keine neue Meldung angezeigt wird.
    setTimeout(() => { if (!flyout.classList.contains('is-visible')) flyout.hidden = true; }, 250);
  }

  function taskTypeLabel(type) {
    return ({ registration_invite: 'Kundenlogin', missing_email: 'Datenpflege', rebooking: 'Wiederbuchung', winback: 'Reaktivierung', birthday: 'Geburtstag', low_stock: 'Lager', waitlist: 'Warteliste', duplicate_check: 'Doppelprofil?' })[type] || 'CRM';
  }

  // Änderungsprotokoll: audit_log speichert bei jeder Änderung die
  // komplette alte/neue Zeile (old_data/new_data, siehe
  // audit_business_change() in den Migrationen) -- hier wird daraus eine
  // lesbare Zeile, insbesondere "wann war der Termin VORHER", damit sich
  // Testverschiebungen oder versehentliche Änderungen nachvollziehen lassen.
  function auditDetail(entry) {
    const before = entry.old_data || {};
    const after = entry.new_data || {};
    const dateTime = value => esc(fmt(value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
    if (entry.table_name === 'appointments') {
      const name = esc(after.customer_name || before.customer_name || 'Termin');
      if (entry.action === 'update' && before.starts_at && after.starts_at && before.starts_at !== after.starts_at) {
        return `${name}: ${dateTime(before.starts_at)} → ${dateTime(after.starts_at)}`;
      }
      if (entry.action === 'insert' && after.starts_at) return `${name} (${dateTime(after.starts_at)})`;
      if (entry.action === 'delete') return `${name} gelöscht`;
      return name;
    }
    if (entry.table_name === 'customers') return esc(after.full_name || before.full_name || entry.record_id || '–');
    return `<span class="muted">${esc(entry.record_id || '–')}</span>`;
  }

  function registrationActionButtons(customer, compact = false) {
    if (!customer || customer.profile_id || customer.do_not_contact) return '';
    const size = compact ? ' small' : '';
    return [
      customer.email ? `<button class="secondary${size}" type="button" data-registration-invite="${customer.id}" data-invite-channel="email">E-Mail-Einladung</button>` : `<button class="secondary${size}" type="button" data-capture-email="${customer.id}">E-Mail erfassen</button>`,
      phoneKey(customer.phone) ? `<button class="secondary${size}" type="button" data-registration-invite="${customer.id}" data-invite-channel="whatsapp">WhatsApp</button><button class="secondary${size}" type="button" data-registration-invite="${customer.id}" data-invite-channel="sms">SMS</button><a class="secondary${size}" href="tel:+${swissPhone(customer.phone)}">Anrufen</a>` : ''
    ].join('');
  }

  function bindRegistrationActions(scope = document) {
    scope.querySelectorAll('[data-capture-email]').forEach(button => button.onclick = () => {
      openCustomer(button.dataset.captureEmail);
      setTimeout(() => $('customer-email').focus(), 0);
    });
    scope.querySelectorAll('[data-registration-invite]').forEach(button => button.onclick = () => sendRegistrationInvite(button.dataset.registrationInvite, button.dataset.inviteChannel));
  }

  function renderTasks() {
    const now = new Date();
    const order = { urgent: 0, high: 1, normal: 2, low: 3 };
    const allOpen = state.tasks.filter(task => task.status === 'open');
    const open = actionableTasks(now).sort((a, b) => (order[a.priority] - order[b.priority]) || new Date(a.due_at || 0) - new Date(b.due_at || 0));
    const snoozed = allOpen.filter(task => task.snoozed_until && new Date(task.snoozed_until) > now).length;
    const overdue = open.filter(task => task.due_at && new Date(task.due_at) < now).length;
    const rebooking = open.filter(task => task.task_type === 'rebooking').length;
    const retention = open.filter(task => ['rebooking', 'winback', 'birthday'].includes(task.task_type)).length;
    const registrationInvites = open.filter(task => task.task_type === 'registration_invite').length;
    $('crm-task-count').textContent = `${open.length} offene Aufgaben`;
    $('task-kpis').innerHTML = [
      metricCard('Offen', open.length, overdue ? `${overdue} davon überfällig` : 'alles im Plan'),
      metricCard('Später', snoozed, 'erscheinen zum gewählten Zeitpunkt'),
      metricCard('Wiederbuchung', rebooking, 'direktes Umsatzpotenzial'),
      metricCard('Login-Einladungen', registrationInvites, 'bestehende Kundinnen aktivieren')
    ].join('');
    $('crm-task-list').innerHTML = open.length ? open.slice(0, 100).map(task => {
      const customer = task.customers;
      const due = task.due_at ? fmt(task.due_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Ohne Termin';
      const overdueClass = task.due_at && new Date(task.due_at) < now ? ' is-overdue' : '';
      const fullCustomer = state.customers.find(item => item.id === task.customer_id);
      const contextualActions = ['registration_invite', 'missing_email'].includes(task.task_type) ? registrationActionButtons(fullCustomer, true) : '';
      return `<article class="task-card priority-${task.priority}${overdueClass}"><div class="task-priority"><span>${esc(taskTypeLabel(task.task_type))}</span><strong>${esc(task.priority === 'urgent' ? 'Dringend' : task.priority === 'high' ? 'Hoch' : task.priority === 'low' ? 'Niedrig' : 'Normal')}</strong></div><div class="task-copy"><h3>${esc(task.title)}</h3><p>${esc(task.description || '')}</p><small>Fällig: ${esc(due)}${customer?.email ? ` · ${esc(customer.email)}` : customer?.phone ? ` · ${esc(customer.phone)}` : ''}</small></div><div class="task-actions">${contextualActions}${task.customer_id ? `<button class="link-button" type="button" data-open-customer="${task.customer_id}">Profil</button>` : ''}<button class="secondary small" type="button" data-snooze-task="${task.id}">Später</button><button class="secondary small" type="button" data-dismiss-task="${task.id}">Nicht relevant</button><button class="primary small" type="button" data-complete-task="${task.id}">Erledigt</button></div></article>`;
    }).join('') : '<div class="card empty">Alle Aufgaben sind erledigt. Das Business Cockpit ist aufgeräumt.</div>';
    const history = state.tasks.filter(task => ['done', 'dismissed'].includes(task.status)).sort((a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at)).slice(0, 30);
    $('task-history').innerHTML = history.length ? history.map(task => {
      const admin = state.profiles.find(profile => profile.id === task.completed_by);
      return `<tr><td>${task.completed_at ? esc(fmt(task.completed_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })) : '–'}</td><td><strong>${esc(task.title)}</strong></td><td>${task.status === 'done' ? '<span class="status status-completed">Erledigt</span>' : '<span class="status status-cancelled">Nicht relevant</span>'}</td><td>${esc(admin?.full_name || 'System')}</td><td>${esc(task.dismissed_reason || '–')}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">Noch keine abgeschlossenen Aufgaben.</td></tr>';
    $('audit-table').innerHTML = state.auditLog.length ? state.auditLog.slice(0, 25).map(entry => `<tr><td>${esc(fmt(entry.changed_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td><td>${esc(({ customers: 'Kundenprofil', appointments: 'Termin', payments: 'Zahlung', expenses: 'Ausgabe', inventory_items: 'Lagerprodukt', waitlist_entries: 'Warteliste', services: 'Website-Inhalt', service_price_items: 'Preisposition', site_content_blocks: 'Website-Text' })[entry.table_name] || entry.table_name)}</td><td>${esc(({ insert: 'Erstellt', update: 'Geändert', delete: 'Gelöscht' })[entry.action] || entry.action)}</td><td>${auditDetail(entry)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Noch keine Änderungen protokolliert.</td></tr>';
    document.querySelectorAll('[data-open-customer]').forEach(button => button.onclick = () => openCustomer(button.dataset.openCustomer));
    document.querySelectorAll('[data-complete-task]').forEach(button => button.onclick = () => completeTask(button.dataset.completeTask, 'done'));
    document.querySelectorAll('[data-snooze-task]').forEach(button => button.onclick = () => openTaskSnooze(button.dataset.snoozeTask));
    document.querySelectorAll('[data-dismiss-task]').forEach(button => button.onclick = () => openTaskDismiss(button.dataset.dismissTask));
    bindRegistrationActions($('crm-task-list'));
  }

  async function refreshCrmTasks() {
    const button = $('refresh-crm-tasks');
    button.disabled = true;
    const { data, error } = await db.rpc('generate_daily_crm_tasks');
    button.disabled = false;
    if (error) return toast(error.message);
    toast(`${data || 0} neue Aufgaben erkannt.`);
    await loadAll();
  }

  async function completeTask(id, status) {
    const { error } = await db.rpc('complete_crm_task', { requested_task_id: id, requested_status: status });
    if (error) return toast(error.message);
    toast('Aufgabe erledigt.');
    await loadAll();
  }

  function openTaskSnooze(id) {
    $('task-snooze-form').reset();
    $('task-snooze-id').value = id;
    $('task-snooze-preset').value = '7';
    $('task-snooze-custom-field').hidden = true;
    $('task-snooze-message').textContent = '';
    openModal('task-snooze-modal');
  }

  async function saveTaskSnooze(event) {
    event.preventDefault();
    const preset = $('task-snooze-preset').value;
    const until = preset === 'custom' ? new Date($('task-snooze-custom').value) : addDays(new Date(), Number(preset));
    if (Number.isNaN(until.getTime()) || until <= new Date()) return $('task-snooze-message').textContent = 'Bitte einen zukünftigen Zeitpunkt wählen.';
    const { error } = await db.rpc('snooze_crm_task', { requested_task_id: $('task-snooze-id').value, requested_until: until.toISOString(), requested_note: $('task-snooze-note').value.trim() || null });
    if (error) return $('task-snooze-message').textContent = error.message;
    closeModal('task-snooze-modal'); toast(`Aufgabe wird am ${fmt(until, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} wieder angezeigt.`); await loadAll();
  }

  function openTaskDismiss(id) {
    $('task-dismiss-form').reset();
    $('task-dismiss-id').value = id;
    $('task-dismiss-message').textContent = '';
    openModal('task-dismiss-modal');
  }

  async function saveTaskDismiss(event) {
    event.preventDefault();
    const reason = $('task-dismiss-reason').value.trim();
    if (!reason) return $('task-dismiss-message').textContent = 'Bitte eine Begründung eingeben.';
    const { error } = await db.rpc('dismiss_crm_task', { requested_task_id: $('task-dismiss-id').value, requested_reason: reason });
    if (error) return $('task-dismiss-message').textContent = error.message;
    closeModal('task-dismiss-modal'); toast('Aufgabe wurde als nicht relevant dokumentiert.'); await loadAll();
  }

  function customerStats(profile) {
    const email = profile.email?.toLowerCase();
    const now = new Date();
    // profile_id/customer_id are both null for offline/unregistered customers,
    // so every comparison must require a real (non-null) value on the left
    // side too -- otherwise `null === null` would match every appointment
    // without an account to every customer without an account.
    const items = state.appointments.filter(a => !a.is_private && (
      (profile.id && a.customer_ref_id === profile.id) ||
      (profile.profile_id && a.customer_id === profile.profile_id) ||
      (email && a.customer_email?.toLowerCase() === email)
    ));
    const validItems = items.filter(a => a.status !== 'cancelled');
    const past = validItems.filter(a => new Date(a.starts_at) < now).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    const upcoming = validItems.filter(a => a.status === 'booked' && new Date(a.starts_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const legacyBookings = Number(profile.legacy_booking_count || 0);
    const totalBookings = legacyBookings + validItems.length;
    const revenue = items.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
    const segment = totalBookings >= 10 ? { key: 'vip', label: 'VIP' } : totalBookings >= 5 ? { key: 'loyal', label: 'Stammkundin' } : totalBookings >= 2 ? { key: 'repeat', label: 'Wiederkehrend' } : totalBookings >= 1 ? { key: 'new', label: 'Neu' } : { key: 'lead', label: 'Kontakt' };
    return { items, validItems, upcoming, legacyBookings, totalBookings, revenue, last: past[0]?.starts_at || null, next: upcoming[0]?.starts_at || null, completed: items.filter(a => a.status === 'completed').length, noShows: items.filter(a => a.status === 'no_show').length, segment };
  }

  function renderCustomers() {
    const query = state.customerFilter.toLowerCase();
    const profiles = state.customers.filter(profile => {
      if (!`${profile.full_name} ${profile.email || ''} ${profile.phone || ''} ${(profile.tags || []).join(' ')}`.toLowerCase().includes(query)) return false;
      const stats = customerStats(profile);
      if (state.customerSegment === 'all') return true;
      if (state.customerSegment === 'missing_email') return !profile.email;
      if (state.customerSegment === 'at_risk') return stats.last && new Date(stats.last) < addDays(new Date(), -180) && !stats.next;
      return stats.segment.key === state.customerSegment;
    });
    $('customer-count').textContent = `${profiles.length} Kundenprofile`;
    $('customer-table').innerHTML = profiles.length ? profiles.map(p => {
      const stats = customerStats(p);
      const more = stats.upcoming.length - 1;
      const upcoming = stats.next
        ? `${fmt(stats.next, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${more > 0 ? `<span class="customer-meta">+ ${more} weitere${more === 1 ? 'r' : ''} Termin${more === 1 ? '' : 'e'}</span>` : ''}`
        : stats.last ? `Zuletzt ${esc(fmt(stats.last, { day: '2-digit', month: '2-digit' }))}` : '–';
      const contactPermission = p.do_not_contact ? '<span class="contact-state is-blocked">Gesperrt</span>' : p.marketing_consent && p.email ? '<span class="contact-state is-active">✓ E-Mail</span>' : p.marketing_consent ? '<span class="contact-state">Ohne E-Mail</span>' : '<span class="contact-state">Nur Service</span>';
      const rowHint = `${p.profile_id ? 'Login aktiv' : 'Kein Login'}${p.registration_invited_at ? ' · Eingeladen ' + esc(fmt(p.registration_invited_at, { day: '2-digit', month: '2-digit' })) : ''}`;
      return `<tr data-edit-customer="${p.id}" class="customer-row" title="${rowHint}"><td><strong class="customer-name">${esc(p.full_name)}</strong><span class="customer-contact">${esc(p.email || p.phone || 'Kein Kontakt')}</span></td><td><span class="segment segment-${stats.segment.key}">${esc(stats.segment.label)}</span></td><td><strong>${esc(money(stats.revenue))}</strong><span class="customer-meta">${stats.totalBookings} Termine</span></td><td>${upcoming}</td><td>${contactPermission}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">Keine Kunden gefunden.</td></tr>';
    document.querySelectorAll('[data-edit-customer]').forEach(row => row.onclick = () => openCustomer(row.dataset.editCustomer));
  }

  function renderWaitlist() {
    const open = state.waitlist.filter(item => item.status === 'open');
    const offered = state.waitlist.filter(item => item.status === 'offered');
    const vip = open.filter(item => Number(item.priority) >= 2).length;
    $('waitlist-metrics').innerHTML = [metricCard('Offene Wünsche', open.length, 'bereit für Angebote'), metricCard('Angebot gesendet', offered.length, 'Antwort ausstehend'), metricCard('Hohe Priorität', vip, 'VIP oder dringend'), metricCard('Mit E-Mail', open.filter(item => item.email).length, 'automatisch erreichbar')].join('');
    $('waitlist-table').innerHTML = state.waitlist.length ? state.waitlist.map(item => {
      const range = item.preferred_from || item.preferred_until ? `${item.preferred_from ? fmt(item.preferred_from, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'offen'} bis ${item.preferred_until ? fmt(item.preferred_until, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'offen'}` : 'Jederzeit';
      return `<tr><td><span class="priority-mark priority-${item.priority >= 2 ? 'urgent' : item.priority === 1 ? 'high' : 'normal'}">${item.priority >= 2 ? 'VIP' : item.priority === 1 ? 'Hoch' : 'Normal'}</span></td><td><strong>${esc(item.customer_name)}</strong><br><span class="muted">${esc(item.email || item.phone || 'Kontakt fehlt')}</span></td><td>${esc(item.services?.name || 'Alle')}</td><td>${esc(range)}</td><td>${item.flexible ? 'Flexibel' : 'Fix'}</td><td>${esc(({ open: 'Offen', offered: 'Angeboten', booked: 'Gebucht', expired: 'Abgelaufen', cancelled: 'Storniert' })[item.status] || item.status)}</td><td>${['open', 'offered'].includes(item.status) ? `<button class="link-button" type="button" data-offer-waitlist="${item.id}">Termin anbieten</button><button class="link-button" type="button" data-cancel-waitlist="${item.id}">Entfernen</button>` : '–'}</td></tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">Noch keine Wünsche auf der Warteliste.</td></tr>';
    document.querySelectorAll('[data-offer-waitlist]').forEach(button => button.onclick = () => offerWaitlist(button.dataset.offerWaitlist));
    document.querySelectorAll('[data-cancel-waitlist]').forEach(button => button.onclick = () => cancelWaitlist(button.dataset.cancelWaitlist));
  }

  async function offerWaitlist(id) {
    const suggested = localInput(nextRoundedSlot());
    const requested = prompt('Welches freie Zeitfenster soll angeboten werden? (YYYY-MM-DDTHH:MM)', suggested);
    if (!requested) return;
    const date = new Date(requested);
    if (Number.isNaN(date.getTime())) return toast('Ungültiges Datum.');
    const { error } = await db.rpc('offer_waitlist_entry', { requested_waitlist_id: id, requested_start: date.toISOString() });
    if (error) return toast(error.message);
    toast('Terminangebot wurde eingeplant.'); await loadAll();
  }

  async function cancelWaitlist(id) {
    if (!confirm('Diesen Wartelisteneintrag entfernen?')) return;
    const { error } = await db.from('waitlist_entries').update({ status: 'cancelled' }).eq('id', id);
    if (error) return toast(error.message);
    toast('Wartelisteneintrag geschlossen.'); await loadAll();
  }

  function openWaitlist() {
    $('waitlist-form').reset();
    $('waitlist-flexible').checked = true;
    $('waitlist-from').value = localInput(nextRoundedSlot());
    $('waitlist-until').value = localInput(addDays(nextRoundedSlot(), 30));
    $('waitlist-message').textContent = '';
    setPickerCustomer('waitlist', null);
    openModal('waitlist-modal');
  }

  // Wartelisten-Eintrag einer Kundin zuordnen: gewählte Kundin, sonst
  // E-Mail, Telefon (letzte 9 Ziffern) oder eindeutiger exakter Name --
  // gleiche Reihenfolge wie sync_appointment_customer(). Sonst neue Kundin.
  async function resolveWaitlistCustomer(name, email, phone) {
    const chosen = $('waitlist-customer-ref').value;
    if (chosen) return chosen;
    const byEmail = email && state.customers.find(c => c.email?.toLowerCase() === email);
    if (byEmail) return byEmail.id;
    const byPhone = phoneKey(phone).length === 9 ? state.customers.filter(c => phoneKey(c.phone) === phoneKey(phone)) : [];
    if (byPhone.length === 1) return byPhone[0].id;
    const byName = state.customers.filter(c => String(c.full_name || '').trim().toLowerCase() === name.toLowerCase());
    if (byName.length === 1) return byName[0].id;
    const { data, error } = await db.from('customers').insert({ full_name: name, email, phone, source: 'Warteliste' }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  async function saveWaitlist(event) {
    event.preventDefault();
    const email = $('waitlist-email').value.trim().toLowerCase() || null;
    const phone = $('waitlist-phone').value.trim() || null;
    let customerId;
    try { customerId = await resolveWaitlistCustomer($('waitlist-name').value.trim(), email, phone); }
    catch (error) { return $('waitlist-message').textContent = error.message; }
    const payload = { customer_id: customerId, service_id: $('waitlist-service').value || null, customer_name: $('waitlist-name').value.trim(), email, phone, preferred_from: $('waitlist-from').value ? new Date($('waitlist-from').value).toISOString() : null, preferred_until: $('waitlist-until').value ? new Date($('waitlist-until').value).toISOString() : null, flexible: $('waitlist-flexible').checked, priority: Number($('waitlist-priority').value), notes: $('waitlist-notes').value.trim() || null, created_by: state.user.id };
    const { error } = await db.from('waitlist_entries').insert(payload);
    if (error) return $('waitlist-message').textContent = error.message;
    closeModal('waitlist-modal'); toast('Wunsch wurde auf die Warteliste gesetzt.'); await loadAll();
  }

  function renderInvoices() {
    const now = new Date(), currentMonth = monthStart(now), nextMonth = addMonths(currentMonth, 1), yearStart = new Date(now.getFullYear(), 0, 1);
    const completedPayments = state.payments.filter(payment => payment.status === 'completed');
    const monthIncome = completedPayments.filter(payment => new Date(payment.paid_at) >= currentMonth && new Date(payment.paid_at) < nextMonth).reduce((sum, payment) => sum + Number(payment.amount_chf || 0) + Number(payment.tip_chf || 0), 0);
    const yearIncome = completedPayments.filter(payment => new Date(payment.paid_at) >= yearStart).reduce((sum, payment) => sum + Number(payment.amount_chf || 0) + Number(payment.tip_chf || 0), 0);
    const monthExpenses = state.expenses.filter(expense => new Date(`${expense.expense_date}T12:00:00`) >= currentMonth && new Date(`${expense.expense_date}T12:00:00`) < nextMonth).reduce((sum, expense) => sum + Number(expense.amount_chf || 0), 0);
    const openTotal = state.invoices.filter(invoice => ['draft', 'sent'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount_chf || 0), 0);
    $('finance-live-metrics').innerHTML = [metricCard('Einnahmen Monat', money(monthIncome), 'inkl. Trinkgeld'), metricCard('Ausgaben Monat', money(monthExpenses), 'erfasste Kosten'), metricCard('Ergebnis Monat', money(monthIncome - monthExpenses), 'vor weiteren Kosten'), metricCard('Einnahmen Jahr', money(yearIncome), 'effektive Zahlungen'), metricCard('Offene Forderungen', money(openTotal), 'No-Show-Rechnungen')].join('');
    $('payment-table').innerHTML = state.payments.length ? state.payments.slice(0, 12).map(payment => `<tr><td>${esc(fmt(payment.paid_at, { day: '2-digit', month: '2-digit', year: 'numeric' }))}</td><td><strong>${esc(payment.customers?.full_name || payment.appointments?.customer_name || 'Nicht zugeordnet')}</strong></td><td>${esc(({ cash: 'Bar', card: 'Karte', twint: 'TWINT', bank: 'Bank', invoice: 'Rechnung', gift_card: 'Gutschein', package: 'Paket', other: 'Andere' })[payment.method] || payment.method)}</td><td><strong>${esc(money(Number(payment.amount_chf || 0) + Number(payment.tip_chf || 0)))}</strong></td></tr>`).join('') : '<tr><td colspan="4" class="empty">Noch keine Zahlungen erfasst.</td></tr>';
    $('expense-table').innerHTML = state.expenses.length ? state.expenses.slice(0, 12).map(expense => `<tr><td>${esc(fmt(`${expense.expense_date}T12:00:00`, { day: '2-digit', month: '2-digit', year: 'numeric' }))}</td><td>${esc(expense.category)}</td><td><strong>${esc(expense.description)}</strong><br><span class="muted">${esc(expense.supplier || '')}</span></td><td>${esc(money(expense.amount_chf))}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Noch keine Ausgaben erfasst.</td></tr>';
    $('gift-card-table').innerHTML = state.giftCards.length ? state.giftCards.slice(0, 12).map(card => `<tr><td><strong>${esc(card.code)}</strong></td><td>${esc(card.recipient_name || '–')}</td><td>${esc(money(card.balance_chf))}</td><td>${esc(({ active: 'Aktiv', redeemed: 'Eingelöst', expired: 'Abgelaufen', cancelled: 'Storniert' })[card.status] || card.status)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Noch keine Gutscheine.</td></tr>';
    $('package-table').innerHTML = state.packages.length ? state.packages.slice(0, 12).map(item => `<tr><td><strong>${esc(item.customers?.full_name || '–')}</strong></td><td>${esc(item.name)}<br><span class="muted">${esc(item.services?.name || '')}</span></td><td>${item.sessions_remaining} / ${item.sessions_total}</td><td>${esc(({ active: 'Aktiv', used: 'Aufgebraucht', expired: 'Abgelaufen', cancelled: 'Storniert' })[item.status] || item.status)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Noch keine Pakete.</td></tr>';
    $('invoice-table').innerHTML = state.invoices.length ? state.invoices.map(invoice => `<tr>
      <td>#${String(invoice.invoice_number).padStart(5, '0')}</td><td><strong>${esc(invoice.customer_name)}</strong><br><span class="muted">${esc(invoice.customer_email || '')}</span></td><td>${esc(invoice.reason)}</td><td>${money(invoice.amount_chf)}</td><td>${fmt(`${invoice.due_at}T12:00:00`, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
      <td>${invoice.status === 'draft' && invoice.customer_email ? `<button class="primary small" type="button" data-send-invoice="${invoice.id}">Senden</button> ` : ''}<select data-invoice-status="${invoice.id}"><option value="draft" ${invoice.status === 'draft' ? 'selected' : ''}>Entwurf</option><option value="sent" ${invoice.status === 'sent' ? 'selected' : ''}>Gesendet</option><option value="paid" ${invoice.status === 'paid' ? 'selected' : ''}>Bezahlt</option><option value="void" ${invoice.status === 'void' ? 'selected' : ''}>Storniert</option></select></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Noch keine Rechnungen.</td></tr>';
    document.querySelectorAll('[data-invoice-status]').forEach(select => select.onchange = () => updateInvoice(select.dataset.invoiceStatus, select.value));
    document.querySelectorAll('[data-send-invoice]').forEach(button => button.onclick = async () => {
      const invoice = state.invoices.find(item => item.id === button.dataset.sendInvoice);
      if (!invoice || !confirm(`Rechnung #${String(invoice.invoice_number).padStart(5, '0')} über ${money(invoice.amount_chf)} jetzt an ${invoice.customer_email} senden?`)) return;
      button.disabled = true;
      const { error } = await db.rpc('send_invoice', { requested_invoice_id: invoice.id });
      if (error) { button.disabled = false; toast(error.message); return; }
      toast('Rechnung wird in der nächsten Minute verschickt.');
      await loadAll();
    });
  }

  function renderInventory() {
    const active = state.inventory.filter(item => item.active);
    const low = active.filter(item => Number(item.stock_quantity) <= Number(item.minimum_quantity));
    const value = active.reduce((sum, item) => sum + Number(item.stock_quantity || 0) * Number(item.unit_cost_chf || 0), 0);
    const suppliers = new Set(active.map(item => item.supplier).filter(Boolean)).size;
    $('inventory-metrics').innerHTML = [metricCard('Produkte', active.length, 'aktive Lagerartikel'), metricCard('Nachbestellen', low.length, low.length ? 'unter Mindestbestand' : 'Bestand ausreichend'), metricCard('Warenwert', money(value), 'aktueller Bestand'), metricCard('Lieferanten', suppliers, 'hinterlegte Partner')].join('');
    $('inventory-table').innerHTML = active.length ? active.map(item => {
      const isLow = Number(item.stock_quantity) <= Number(item.minimum_quantity);
      return `<tr data-edit-inventory="${item.id}" style="cursor:pointer"><td><strong>${esc(item.name)}</strong></td><td>${esc(item.sku || '–')}<br><span class="muted">${esc(item.category || '')}</span></td><td><strong>${Number(item.stock_quantity)} ${esc(item.unit)}</strong></td><td>${Number(item.minimum_quantity)} ${esc(item.unit)}</td><td>${esc(money(Number(item.stock_quantity) * Number(item.unit_cost_chf)))}</td><td>${esc(item.supplier || '–')}</td><td><span class="stock-status ${isLow ? 'is-low' : 'is-ok'}">${isLow ? 'Nachbestellen' : 'OK'}</span></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">Noch keine Lagerartikel erfasst.</td></tr>';
    $('service-economics-table').innerHTML = state.services.map(service => `<tr><td><strong>${esc(service.name)}</strong></td><td>${esc(money(service.price_chf))}</td><td><input class="table-input" type="number" min="0" step="0.05" value="${Number(service.material_cost_chf || 0)}" data-service-cost="${service.id}"></td><td><strong>${esc(money(Number(service.price_chf || 0) - Number(service.material_cost_chf || 0)))}</strong></td><td><input class="table-input" type="number" min="1" max="365" value="${Number(service.rebooking_days || 28)}" data-service-rebook="${service.id}"> Tage</td><td><button class="link-button" type="button" data-save-service-economics="${service.id}">Speichern</button></td></tr>`).join('');
    document.querySelectorAll('[data-edit-inventory]').forEach(row => row.onclick = () => openInventory(row.dataset.editInventory));
    document.querySelectorAll('[data-save-service-economics]').forEach(button => button.onclick = () => saveServiceEconomics(button.dataset.saveServiceEconomics));
  }

  async function saveServiceEconomics(id) {
    const cost = document.querySelector(`[data-service-cost="${id}"]`);
    const rebooking = document.querySelector(`[data-service-rebook="${id}"]`);
    const { error } = await db.from('services').update({ material_cost_chf: Number(cost.value), rebooking_days: Number(rebooking.value) }).eq('id', id);
    if (error) return toast(error.message);
    toast('Behandlungskalkulation gespeichert.'); await loadAll();
  }

  function openPayment() {
    $('payment-form').reset();
    $('payment-tip').value = '0';
    $('payment-date').value = localInput(new Date());
    const candidates = [...state.appointments].filter(item => !item.is_private && item.status !== 'cancelled').sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 150);
    $('payment-appointment').innerHTML = `<option value="">Ohne Terminzuordnung</option>${candidates.map(item => `<option value="${item.id}">${esc(fmt(item.starts_at, { day: '2-digit', month: '2-digit', year: 'numeric' }))} · ${esc(item.customer_name)} · ${esc(item.services?.name || '')}</option>`).join('')}`;
    fillPaymentBenefits();
    $('payment-message').textContent = '';
    openModal('payment-modal');
  }

  function fillPaymentAmount() {
    const appointment = state.appointments.find(item => item.id === $('payment-appointment').value);
    if (!appointment) return;
    const paid = state.payments.filter(payment => payment.appointment_id === appointment.id && payment.status === 'completed').reduce((sum, payment) => sum + Number(payment.amount_chf || 0), 0);
    $('payment-amount').value = Math.max(0, Number(appointment.amount_chf ?? appointment.services?.price_chf ?? 0) - paid).toFixed(2);
    fillPaymentBenefits();
  }

  function fillPaymentBenefits() {
    const method = $('payment-method').value;
    $('payment-benefit-field').hidden = !['gift_card', 'package'].includes(method);
    if (method === 'gift_card') {
      $('payment-benefit').innerHTML = state.giftCards.filter(card => card.status === 'active' && Number(card.balance_chf) > 0).map(card => `<option value="${card.id}">${esc(card.code)} · ${esc(card.recipient_name || '')} · ${esc(money(card.balance_chf))}</option>`).join('');
    } else if (method === 'package') {
      const appointment = state.appointments.find(item => item.id === $('payment-appointment').value);
      const customer = appointment?.customer_email ? state.customers.find(item => item.email?.toLowerCase() === appointment.customer_email.toLowerCase()) : null;
      $('payment-benefit').innerHTML = state.packages.filter(item => item.status === 'active' && (!customer || item.customer_id === customer.id) && (!appointment || !item.service_id || item.service_id === appointment.service_id)).map(item => `<option value="${item.id}">${esc(item.name)} · ${item.sessions_remaining} übrig</option>`).join('');
    } else $('payment-benefit').innerHTML = '';
  }

  async function savePayment(event) {
    event.preventDefault();
    const appointment = state.appointments.find(item => item.id === $('payment-appointment').value);
    const customer = appointment?.customer_email ? state.customers.find(item => item.email?.toLowerCase() === appointment.customer_email.toLowerCase()) : null;
    const method = $('payment-method').value;
    const benefitId = $('payment-benefit').value || null;
    const { error } = await db.from('payments').insert({ customer_id: customer?.id || null, appointment_id: appointment?.id || null, amount_chf: Number($('payment-amount').value), tip_chf: Number($('payment-tip').value || 0), method, package_id: method === 'package' ? benefitId : null, gift_card_id: method === 'gift_card' ? benefitId : null, paid_at: new Date($('payment-date').value).toISOString(), notes: $('payment-notes').value.trim() || null, created_by: state.user.id });
    if (error) return $('payment-message').textContent = error.message;
    closeModal('payment-modal'); toast('Zahlung wurde verbucht.'); await loadAll();
  }

  function openExpense() {
    $('expense-form').reset();
    $('expense-date').value = dayKey(new Date());
    $('expense-message').textContent = '';
    openModal('expense-modal');
  }

  async function saveExpense(event) {
    event.preventDefault();
    const { error } = await db.from('expenses').insert({ expense_date: $('expense-date').value, category: $('expense-category').value, supplier: $('expense-supplier').value.trim() || null, description: $('expense-description').value.trim(), amount_chf: Number($('expense-amount').value), recurring: $('expense-recurring').checked, created_by: state.user.id });
    if (error) return $('expense-message').textContent = error.message;
    closeModal('expense-modal'); toast('Ausgabe wurde gespeichert.'); await loadAll();
  }

  function openInventory(id = null) {
    const item = id ? state.inventory.find(entry => entry.id === id) : null;
    $('inventory-form').reset();
    $('inventory-id').value = item?.id || '';
    $('inventory-modal-title').textContent = item ? 'Lagerprodukt bearbeiten' : 'Lagerprodukt hinzufügen';
    $('inventory-name').value = item?.name || '';
    $('inventory-sku').value = item?.sku || '';
    $('inventory-category').value = item?.category || '';
    $('inventory-unit').value = item?.unit || 'Stk.';
    $('inventory-stock').value = item?.stock_quantity ?? 0;
    $('inventory-minimum').value = item?.minimum_quantity ?? 0;
    $('inventory-cost').value = item?.unit_cost_chf ?? 0;
    $('inventory-supplier').value = item?.supplier || '';
    $('inventory-services').innerHTML = state.services.filter(service => service.active).map(service => `<option value="${service.id}" ${item && state.serviceInventory.some(link => link.inventory_item_id === item.id && link.service_id === service.id) ? 'selected' : ''}>${esc(service.name)}</option>`).join('');
    const firstUsage = item ? state.serviceInventory.find(link => link.inventory_item_id === item.id) : null;
    $('inventory-usage').value = firstUsage?.quantity_used ?? 1;
    $('inventory-message').textContent = '';
    openModal('inventory-modal');
  }

  async function saveInventory(event) {
    event.preventDefault();
    const id = $('inventory-id').value;
    const payload = { name: $('inventory-name').value.trim(), sku: $('inventory-sku').value.trim() || null, category: $('inventory-category').value.trim() || null, unit: $('inventory-unit').value.trim() || 'Stk.', stock_quantity: Number($('inventory-stock').value), minimum_quantity: Number($('inventory-minimum').value), unit_cost_chf: Number($('inventory-cost').value), supplier: $('inventory-supplier').value.trim() || null };
    const result = id ? await db.from('inventory_items').update(payload).eq('id', id).select().single() : await db.from('inventory_items').insert(payload).select().single();
    if (result.error) return $('inventory-message').textContent = result.error.message;
    const itemId = result.data.id;
    await db.from('service_inventory').delete().eq('inventory_item_id', itemId);
    const selectedServices = [...$('inventory-services').selectedOptions].map(option => option.value);
    if (selectedServices.length) {
      const { error: linkError } = await db.from('service_inventory').insert(selectedServices.map(serviceId => ({ service_id: serviceId, inventory_item_id: itemId, quantity_used: Number($('inventory-usage').value) })));
      if (linkError) return $('inventory-message').textContent = linkError.message;
    }
    closeModal('inventory-modal'); toast('Lagerprodukt gespeichert.'); await loadAll();
  }

  async function toggleAutomation(id, active) {
    const { error } = await db.from('automation_rules').update({ active }).eq('id', id);
    if (error) return toast(error.message);
    toast(active ? 'Automation aktiviert.' : 'Automation pausiert.'); await loadAll();
  }

  function customerOptions(includeEmpty = false) {
    return `${includeEmpty ? '<option value="">Nicht zugeordnet</option>' : ''}${state.customers.map(customer => `<option value="${customer.id}">${esc(customer.full_name)}${customer.email ? ` · ${esc(customer.email)}` : ''}</option>`).join('')}`;
  }

  function openGiftCard() {
    $('gift-card-form').reset();
    $('gift-code').value = `GIGI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    $('gift-purchaser').innerHTML = customerOptions(true);
    $('gift-expires').value = dayKey(addMonths(new Date(), 12));
    $('gift-message').textContent = '';
    openModal('gift-card-modal');
  }

  async function saveGiftCard(event) {
    event.preventDefault();
    const value = Number($('gift-value').value);
    const { error } = await db.from('gift_cards').insert({ code: $('gift-code').value.trim().toUpperCase(), purchaser_customer_id: $('gift-purchaser').value || null, recipient_name: $('gift-recipient').value.trim() || null, initial_value_chf: value, balance_chf: value, expires_at: $('gift-expires').value ? new Date(`${$('gift-expires').value}T23:59:59`).toISOString() : null });
    if (error) return $('gift-message').textContent = error.message;
    closeModal('gift-card-modal'); toast('Geschenkgutschein erstellt.'); await loadAll();
  }

  function openPackage() {
    $('package-form').reset();
    $('package-customer').innerHTML = customerOptions();
    $('package-service').innerHTML = `<option value="">Gemischt</option>${state.services.filter(service => service.active).map(service => `<option value="${service.id}">${esc(service.name)}</option>`).join('')}`;
    $('package-sessions').value = '5';
    $('package-expires').value = dayKey(addMonths(new Date(), 12));
    $('package-message').textContent = '';
    openModal('package-modal');
  }

  async function savePackage(event) {
    event.preventDefault();
    const sessions = Number($('package-sessions').value);
    const { error } = await db.from('customer_packages').insert({ customer_id: $('package-customer').value, name: $('package-name').value.trim(), service_id: $('package-service').value || null, sessions_total: sessions, sessions_remaining: sessions, price_chf: Number($('package-price').value), expires_at: $('package-expires').value ? new Date(`${$('package-expires').value}T23:59:59`).toISOString() : null });
    if (error) return $('package-message').textContent = error.message;
    closeModal('package-modal'); toast('Behandlungspaket gespeichert.'); await loadAll();
  }

  function renderCampaigns() {
    const consent = state.customers.filter(p => p.marketing_consent && p.email && !p.do_not_contact).length;
    $('marketing-audience').textContent = `${consent} Kundinnen haben dem Marketingversand zugestimmt.`;
    const sent = state.communications.filter(item => item.status === 'sent' && item.channel === 'email').length;
    const clicks = state.marketingEvents.filter(event => event.event_type === 'clicked').length;
    const attributedBookings = state.marketingEvents.filter(event => event.event_type === 'booked').length;
    const attributedRevenue = state.marketingEvents.filter(event => event.event_type === 'revenue').reduce((sum, event) => sum + Number(event.revenue_chf || 0), 0);
    $('marketing-live-metrics').innerHTML = [metricCard('Zielgruppe', consent, 'mit Einwilligung + E-Mail'), metricCard('E-Mails gesendet', sent, 'Journeys und Kampagnen'), metricCard('Klicks', clicks, 'gemessene Reaktionen'), metricCard('Buchungen', attributedBookings, 'Marketing zugeordnet'), metricCard('Kampagnenumsatz', money(attributedRevenue), 'direkt zugeordnet')].join('');
    $('automation-rules').innerHTML = state.automations.length ? state.automations.map(rule => `<article class="automation-card ${rule.active ? 'is-active' : ''}"><div class="automation-icon">${rule.active ? '●' : '○'}</div><div class="automation-body"><h3>${esc(rule.name)}</h3><p>${esc(rule.description || '')}</p><span>${rule.requires_marketing_consent ? 'Nur mit Einwilligung' : 'Transaktional'}${rule.delay_hours ? ` · nach ${rule.delay_hours} Std.` : ''}</span>
      <div class="field"><label for="automation-subject-${rule.id}">Betreff der E-Mail</label><input id="automation-subject-${rule.id}" value="${esc(rule.subject_template || '')}"></div>
      <div class="field"><label for="automation-content-${rule.id}">${rule.rule_key === 'aftercare' ? 'Text der E-Mail (nur Rückfallwert – die eigentlichen Pflegehinweise pro Behandlung stehen unter „Website-Inhalte“)' : 'Text der E-Mail'}</label><textarea id="automation-content-${rule.id}" rows="3">${esc(rule.content_template || '')}</textarea></div>
      <button class="link-button" type="button" data-save-automation="${rule.id}">Text speichern</button>
    </div><label class="switch"><input type="checkbox" data-toggle-automation="${rule.id}" ${rule.active ? 'checked' : ''}><i></i></label></article>`).join('') : '<div class="empty">Automationen werden nach der Datenbank-Erweiterung angezeigt.</div>';
    $('campaign-table').innerHTML = state.campaigns.length ? state.campaigns.map(c => { const events = state.marketingEvents.filter(event => event.campaign_id === c.id); const revenue = events.filter(event => event.event_type === 'revenue').reduce((sum, event) => sum + Number(event.revenue_chf || 0), 0); return `<tr><td><strong>${esc(c.title)}</strong><br><span class="muted">${events.filter(event => event.event_type === 'clicked').length} Klicks · ${events.filter(event => event.event_type === 'booked').length} Buchungen · ${esc(money(revenue))}</span></td><td>${esc(c.subject)}</td><td>${c.scheduled_at ? fmt(c.scheduled_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'}</td><td>${statusPill(c.status)}</td><td>${!c.queued_at && (c.status === 'draft' || c.status === 'scheduled') ? `<button class="link-button" data-send-campaign="${c.id}">Versand einplanen</button>` : ''}</td></tr>`; }).join('') : '<tr><td colspan="5" class="empty">Noch keine Kampagnen.</td></tr>';
    document.querySelectorAll('[data-send-campaign]').forEach(button => button.onclick = () => queueCampaign(button.dataset.sendCampaign));
    document.querySelectorAll('[data-toggle-automation]').forEach(input => input.onchange = () => toggleAutomation(input.dataset.toggleAutomation, input.checked));
    document.querySelectorAll('[data-save-automation]').forEach(button => button.onclick = () => saveAutomationTemplate(button.dataset.saveAutomation));
  }

  async function saveAutomationTemplate(id) {
    const subject = $(`automation-subject-${id}`).value.trim();
    const content = $(`automation-content-${id}`).value.trim();
    const { error } = await db.from('automation_rules').update({ subject_template: subject || null, content_template: content || null }).eq('id', id);
    if (error) return toast(error.message);
    toast('E-Mail-Text gespeichert.'); await loadAll();
  }

  function renderContent() {
    const container = $('content-services');
    if (!container) return;
    const services = [...state.services].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    container.innerHTML = services.map(service => {
      const items = state.servicePriceItems.filter(item => item.service_id === service.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const activeItems = items.filter(item => item.active);
      const inactiveItems = items.filter(item => !item.active);
      return `<article class="card content-service-card">
        <div class="card-head"><div><h2>${esc(service.name)}</h2><p class="muted">${esc(service.slug)}</p></div></div>
        <div class="field"><label for="content-desc-${service.id}">Über diese Behandlung</label>
          <textarea id="content-desc-${service.id}" class="content-desc" rows="3" data-service-id="${service.id}">${esc(service.page_description || '')}</textarea>
        </div>
        <div class="content-desc-actions" style="display:flex;gap:8px;margin:8px 0 14px">
          <button class="secondary" type="button" data-save-desc="${service.id}">Text speichern</button>
          <button class="link-button" type="button" data-undo-desc="${service.id}">Letzte Änderung rückgängig machen</button>
        </div>
        <div class="field"><label for="content-aftercare-${service.id}">Pflegehinweise nach der Behandlung (E-Mail 2 Std. nach Termin-Abschluss)</label>
          <textarea id="content-aftercare-${service.id}" class="content-aftercare" rows="3" data-service-id="${service.id}" placeholder="z. B. Nicht kratzen, 24 Std. kein Wasser, direkte Sonne meiden...">${esc(service.aftercare_copy || '')}</textarea>
        </div>
        <div class="content-desc-actions" style="display:flex;gap:8px;margin:8px 0 14px">
          <button class="secondary" type="button" data-save-aftercare="${service.id}">Pflegetext speichern</button>
          <button class="link-button" type="button" data-undo-aftercare="${service.id}">Letzte Änderung rückgängig machen</button>
        </div>
        <div class="table-wrap embedded">
          <table>
            <thead><tr><th></th><th>Position</th><th>Preis (CHF)</th><th>Oder Text (z. B. „demnächst“)</th><th>Dauer (Min.)</th><th></th></tr></thead>
            <tbody class="price-item-body" data-service-id="${service.id}">
              ${activeItems.map(item => `<tr data-price-item="${item.id}">
                <td><span class="drag-handle" title="Ziehen zum Verschieben">⠿⠿</span></td>
                <td><input class="table-input table-input-wide" type="text" value="${esc(item.name)}" data-field="name"></td>
                <td><input class="table-input" type="number" min="0" step="0.05" value="${item.price_chf ?? ''}" data-field="price_chf"></td>
                <td><input class="table-input table-input-wide" type="text" value="${esc(item.price_label || '')}" data-field="price_label"></td>
                <td><input class="table-input" type="number" min="1" step="5" placeholder="${service.duration_minutes || 90}" value="${item.duration_minutes ?? ''}" data-field="duration_minutes"></td>
                <td><button class="link-button" type="button" data-save-price-item="${item.id}">Speichern</button> <button class="link-button" type="button" data-delete-price-item="${item.id}">Entfernen</button></td>
              </tr>
              <tr class="price-item-detail-row">
                <td></td>
                <td colspan="5">
                  <label style="display:block;font-size:.62rem;color:var(--dash-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Zusatzinfo (Info-Karte beim Anklicken)</label>
                  <textarea class="table-input table-input-wide" rows="2" data-detail-item="${item.id}" placeholder="Wird in der Info-Karte gezeigt, wenn Besucher auf diese Position klicken.">${esc(item.detail_copy || '')}</textarea>
                </td>
              </tr>`).join('') || '<tr><td colspan="6" class="empty">Noch keine Positionen.</td></tr>'}
            </tbody>
          </table>
        </div>
        <button class="secondary" type="button" data-add-price-item="${service.id}" style="margin-top:8px">+ Position</button>
        ${inactiveItems.length ? `<div class="subsection-head"><div><h3>Entfernte Positionen</h3><p class="muted">Wiederherstellen, falls versehentlich entfernt.</p></div></div>
        <div class="content-restore-list">${inactiveItems.map(item => `<span class="restore-chip">${esc(item.name)} <button class="link-button" type="button" data-restore-price-item="${item.id}">Wiederherstellen</button></span>`).join('')}</div>` : ''}
      </article>`;
    }).join('') || '<div class="empty">Keine Behandlungen gefunden.</div>';

    container.querySelectorAll('[data-save-desc]').forEach(button => button.onclick = () => saveServiceDescription(button.dataset.saveDesc));
    container.querySelectorAll('[data-undo-desc]').forEach(button => button.onclick = () => undoServiceDescription(button.dataset.undoDesc));
    container.querySelectorAll('[data-save-aftercare]').forEach(button => button.onclick = () => saveServiceAftercare(button.dataset.saveAftercare));
    container.querySelectorAll('[data-undo-aftercare]').forEach(button => button.onclick = () => undoServiceAftercare(button.dataset.undoAftercare));
    container.querySelectorAll('[data-save-price-item]').forEach(button => button.onclick = () => savePriceItem(button.dataset.savePriceItem));
    container.querySelectorAll('[data-delete-price-item]').forEach(button => button.onclick = () => deletePriceItem(button.dataset.deletePriceItem));
    container.querySelectorAll('[data-restore-price-item]').forEach(button => button.onclick = () => restorePriceItem(button.dataset.restorePriceItem));
    container.querySelectorAll('[data-add-price-item]').forEach(button => button.onclick = () => addPriceItem(button.dataset.addPriceItem));
    attachPriceItemDragHandlers(container);

    renderContentBlocks();
    renderTestimonials();
  }

  let draggedPriceItemId = null;

  function attachPriceItemDragHandlers(container) {
    container.querySelectorAll('tr[data-price-item]').forEach(row => {
      const handle = row.querySelector('.drag-handle');
      if (handle) {
        handle.setAttribute('draggable', 'true');
        handle.addEventListener('dragstart', event => {
          draggedPriceItemId = row.dataset.priceItem;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', draggedPriceItemId);
          row.classList.add('is-dragging');
        });
        handle.addEventListener('dragend', () => {
          row.classList.remove('is-dragging');
          container.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
          draggedPriceItemId = null;
        });
      }
      row.addEventListener('dragover', event => {
        if (!draggedPriceItemId || draggedPriceItemId === row.dataset.priceItem) return;
        event.preventDefault();
        const before = (event.clientY - row.getBoundingClientRect().top) < row.offsetHeight / 2;
        container.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
        row.classList.add(before ? 'drop-before' : 'drop-after');
      });
      row.addEventListener('drop', event => {
        if (!draggedPriceItemId || draggedPriceItemId === row.dataset.priceItem) return;
        event.preventDefault();
        const before = (event.clientY - row.getBoundingClientRect().top) < row.offsetHeight / 2;
        reorderPriceItem(draggedPriceItemId, row.dataset.priceItem, before);
        draggedPriceItemId = null;
      });
    });
  }

  async function reorderPriceItem(draggedId, targetId, before) {
    const dragged = state.servicePriceItems.find(item => item.id === draggedId);
    const target = state.servicePriceItems.find(item => item.id === targetId);
    if (!dragged || !target || dragged.service_id !== target.service_id) return;

    const ordered = state.servicePriceItems
      .filter(item => item.service_id === dragged.service_id && item.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const withoutDragged = ordered.filter(item => item.id !== draggedId);
    const targetIndex = withoutDragged.findIndex(item => item.id === targetId);
    if (targetIndex === -1) return;
    withoutDragged.splice(before ? targetIndex : targetIndex + 1, 0, dragged);

    const changes = withoutDragged
      .map((item, index) => ({ id: item.id, sort_order: index + 1 }))
      .filter(update => {
        const original = ordered.find(item => item.id === update.id);
        return !original || (original.sort_order || 0) !== update.sort_order;
      });
    if (!changes.length) return;
    const results = await Promise.all(changes.map(update => db.from('service_price_items').update({ sort_order: update.sort_order }).eq('id', update.id)));
    const failed = results.find(result => result.error);
    if (failed) return toast(`Reihenfolge konnte nicht gespeichert werden: ${failed.error.message}`);
    toast('Reihenfolge aktualisiert.'); await loadAll();
  }

  function renderContentBlocks() {
    const container = $('content-blocks');
    if (!container) return;
    const blocks = state.siteContentBlocks.filter(block => block.page === 'ueber-liliane').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    container.innerHTML = blocks.map(block => `<div class="field content-block-field">
        <label for="content-block-${block.id}">${esc(block.label)}</label>
        <textarea id="content-block-${block.id}" class="content-block-text" rows="${block.content.length > 200 ? 5 : 2}" data-block-id="${block.id}">${esc(block.content)}</textarea>
        <div class="content-desc-actions" style="display:flex;gap:8px;margin:6px 0 16px">
          <button class="secondary" type="button" data-save-block="${block.id}">Speichern</button>
          <button class="link-button" type="button" data-undo-block="${block.id}">Letzte Änderung rückgängig machen</button>
        </div>
      </div>`).join('') || '<div class="empty">Keine Inhalte gefunden.</div>';

    container.querySelectorAll('[data-save-block]').forEach(button => button.onclick = () => saveContentBlock(button.dataset.saveBlock));
    container.querySelectorAll('[data-undo-block]').forEach(button => button.onclick = () => undoContentBlock(button.dataset.undoBlock));
  }

  async function saveContentBlock(blockId) {
    const textarea = document.querySelector(`textarea.content-block-text[data-block-id="${blockId}"]`);
    const value = textarea.value.trim();
    if (!value) return toast('Der Text darf nicht leer sein.');
    const { error } = await db.from('site_content_blocks').update({ content: value }).eq('id', blockId);
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Text gespeichert.'); await loadAll();
  }

  async function undoContentBlock(blockId) {
    const { data, error } = await db.from('audit_log').select('*').eq('table_name', 'site_content_blocks').eq('record_id', blockId).order('changed_at', { ascending: false }).limit(10);
    if (error) return toast(`Fehler: ${error.message}`);
    const previous = (data || []).find(entry => entry.old_data && 'content' in entry.old_data);
    if (!previous) return toast('Keine frühere Version dieses Texts gefunden.');
    const { error: updateError } = await db.from('site_content_blocks').update({ content: previous.old_data.content }).eq('id', blockId);
    if (updateError) return toast(`Fehler: ${updateError.message}`);
    toast('Vorherige Version wiederhergestellt.'); await loadAll();
  }

  function renderTestimonials() {
    const container = $('testimonials-list');
    if (!container) return;
    const items = [...state.testimonials].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    container.innerHTML = items.map(item => `<div class="testimonial-row" data-testimonial="${item.id}">
        <div class="form-grid">
          <div class="field"><label>Name</label><input class="table-input table-input-wide" type="text" value="${esc(item.customer_name)}" data-field="customer_name"></div>
          <div class="field"><label>Sterne</label><select data-field="rating">${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${item.rating === n ? 'selected' : ''}>${n} Sterne</option>`).join('')}</select></div>
          <div class="field"><label>Behandlung (optional)</label><input class="table-input table-input-wide" type="text" value="${esc(item.service_name || '')}" data-field="service_name"></div>
          <div class="field"><label><input type="checkbox" data-field="active" ${item.active ? 'checked' : ''}> Sichtbar auf der Website</label></div>
        </div>
        <div class="field"><label>Zitat</label><textarea class="table-input table-input-wide" rows="2" data-field="quote">${esc(item.quote)}</textarea></div>
        <div class="content-desc-actions" style="display:flex;gap:8px;margin:6px 0 16px">
          <button class="secondary" type="button" data-save-testimonial="${item.id}">Speichern</button>
          <button class="link-button" type="button" data-delete-testimonial="${item.id}">Entfernen</button>
        </div>
      </div>`).join('') || '<div class="empty">Noch keine Bewertungen hinterlegt.</div>';

    container.querySelectorAll('[data-save-testimonial]').forEach(button => button.onclick = () => saveTestimonial(button.dataset.saveTestimonial));
    container.querySelectorAll('[data-delete-testimonial]').forEach(button => button.onclick = () => deleteTestimonial(button.dataset.deleteTestimonial));
  }

  async function saveTestimonial(id) {
    const row = document.querySelector(`[data-testimonial="${id}"]`);
    const customer_name = row.querySelector('[data-field="customer_name"]').value.trim();
    const quote = row.querySelector('[data-field="quote"]').value.trim();
    const service_name = row.querySelector('[data-field="service_name"]').value.trim();
    const rating = Number(row.querySelector('[data-field="rating"]').value);
    const active = row.querySelector('[data-field="active"]').checked;
    if (!customer_name || !quote) return toast('Bitte Name und Zitat angeben.');
    const { error } = await db.from('testimonials').update({ customer_name, quote, service_name: service_name || null, rating, active }).eq('id', id);
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Bewertung gespeichert.'); await loadAll();
  }

  async function deleteTestimonial(id) {
    if (!confirm('Diese Bewertung endgültig löschen?')) return;
    const { error } = await db.from('testimonials').delete().eq('id', id);
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Bewertung gelöscht.'); await loadAll();
  }

  async function addTestimonial() {
    const name = prompt('Name der Kundin:');
    if (!name || !name.trim()) return;
    const quote = prompt('Zitat der Bewertung:');
    if (!quote || !quote.trim()) return;
    const nextOrder = state.testimonials.length ? Math.max(...state.testimonials.map(item => item.sort_order || 0)) + 1 : 1;
    const { error } = await db.from('testimonials').insert({ customer_name: name.trim(), quote: quote.trim(), rating: 5, sort_order: nextOrder });
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Bewertung hinzugefügt.'); await loadAll();
  }

  async function saveServiceDescription(serviceId) {
    const textarea = document.querySelector(`textarea.content-desc[data-service-id="${serviceId}"]`);
    const value = textarea.value.trim();
    const { error } = await db.from('services').update({ page_description: value || null }).eq('id', serviceId);
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Behandlungstext gespeichert.'); await loadAll();
  }

  async function undoServiceDescription(serviceId) {
    const { data, error } = await db.from('audit_log').select('*').eq('table_name', 'services').eq('record_id', serviceId).order('changed_at', { ascending: false }).limit(10);
    if (error) return toast(`Fehler: ${error.message}`);
    const previous = (data || []).find(entry => entry.old_data && 'page_description' in entry.old_data);
    if (!previous) return toast('Keine frühere Version dieses Texts gefunden.');
    const { error: updateError } = await db.from('services').update({ page_description: previous.old_data.page_description }).eq('id', serviceId);
    if (updateError) return toast(`Fehler: ${updateError.message}`);
    toast('Vorherige Version wiederhergestellt.'); await loadAll();
  }

  async function saveServiceAftercare(serviceId) {
    const textarea = document.querySelector(`textarea.content-aftercare[data-service-id="${serviceId}"]`);
    const value = textarea.value.trim();
    const { error } = await db.from('services').update({ aftercare_copy: value || null }).eq('id', serviceId);
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Pflegetext gespeichert.'); await loadAll();
  }

  async function undoServiceAftercare(serviceId) {
    const { data, error } = await db.from('audit_log').select('*').eq('table_name', 'services').eq('record_id', serviceId).order('changed_at', { ascending: false }).limit(10);
    if (error) return toast(`Fehler: ${error.message}`);
    const previous = (data || []).find(entry => entry.old_data && 'aftercare_copy' in entry.old_data);
    if (!previous) return toast('Keine frühere Version dieses Texts gefunden.');
    const { error: updateError } = await db.from('services').update({ aftercare_copy: previous.old_data.aftercare_copy }).eq('id', serviceId);
    if (updateError) return toast(`Fehler: ${updateError.message}`);
    toast('Vorherige Version wiederhergestellt.'); await loadAll();
  }

  function renderSettings() {
    const grid = $('opening-hours-grid');
    if (!grid) return;
    const hours = state.settings?.opening_hours || {};
    grid.innerHTML = Object.keys(WEEKDAY_LABELS).map(key => {
      const range = Array.isArray(hours[key]) ? hours[key] : null;
      const isOpen = Boolean(range);
      return `<div class="opening-hours-row">
        <label class="opening-hours-day"><input type="checkbox" data-day-open="${key}" ${isOpen ? 'checked' : ''}> ${WEEKDAY_LABELS[key]}</label>
        <input type="time" data-day-from="${key}" value="${isOpen ? range[0] : '09:00'}" ${isOpen ? '' : 'disabled'}>
        <span>bis</span>
        <input type="time" data-day-to="${key}" value="${isOpen ? range[1] : '18:00'}" ${isOpen ? '' : 'disabled'}>
      </div>`;
    }).join('');
    grid.querySelectorAll('[data-day-open]').forEach(input => input.onchange = () => {
      const day = input.dataset.dayOpen;
      grid.querySelector(`[data-day-from="${day}"]`).disabled = !input.checked;
      grid.querySelector(`[data-day-to="${day}"]`).disabled = !input.checked;
    });

    if ($('settings-phone')) {
      $('settings-phone').value = state.settings?.public_phone || '';
      $('settings-email').value = state.settings?.public_email || '';
      $('settings-address1').value = state.settings?.address_line1 || '';
      $('settings-address2').value = state.settings?.address_line2 || '';
    }
  }

  async function saveOpeningHours() {
    const hours = {};
    Object.keys(WEEKDAY_LABELS).forEach(key => {
      const isOpen = document.querySelector(`[data-day-open="${key}"]`).checked;
      if (!isOpen) return;
      const from = document.querySelector(`[data-day-from="${key}"]`).value;
      const to = document.querySelector(`[data-day-to="${key}"]`).value;
      if (from && to) hours[key] = [from, to];
    });
    const { error } = await db.from('business_settings').update({ opening_hours: hours }).eq('id', true);
    if (error) return $('opening-hours-message').textContent = error.message;
    $('opening-hours-message').textContent = '';
    toast('Öffnungszeiten gespeichert.'); await loadAll();
  }

  async function saveContact() {
    const { error } = await db.from('business_settings').update({
      public_phone: $('settings-phone').value.trim() || null,
      public_email: $('settings-email').value.trim() || null,
      address_line1: $('settings-address1').value.trim() || null,
      address_line2: $('settings-address2').value.trim() || null
    }).eq('id', true);
    if (error) return $('settings-contact-message').textContent = error.message;
    $('settings-contact-message').textContent = '';
    toast('Kontaktdaten gespeichert.'); await loadAll();
  }

  async function savePriceItem(itemId) {
    const row = document.querySelector(`tr[data-price-item="${itemId}"]`);
    const name = row.querySelector('[data-field="name"]').value.trim();
    const priceRaw = row.querySelector('[data-field="price_chf"]').value.trim();
    const label = row.querySelector('[data-field="price_label"]').value.trim();
    const durationRaw = row.querySelector('[data-field="duration_minutes"]').value.trim();
    const detailTextarea = document.querySelector(`[data-detail-item="${itemId}"]`);
    const detail_copy = detailTextarea ? detailTextarea.value.trim() : '';
    if (!name) return toast('Bitte einen Namen eingeben.');
    const price_chf = priceRaw === '' ? null : Number(priceRaw);
    if (price_chf !== null && Number.isNaN(price_chf)) return toast('Ungültiger Preis.');
    if (price_chf === null && !label) return toast('Bitte einen Preis oder einen Text angeben.');
    const duration_minutes = durationRaw === '' ? null : Number(durationRaw);
    if (duration_minutes !== null && (Number.isNaN(duration_minutes) || duration_minutes <= 0)) return toast('Ungültige Dauer.');
    const { error } = await db.from('service_price_items').update({ name, price_chf, price_label: price_chf === null ? label : null, duration_minutes, detail_copy: detail_copy || null }).eq('id', itemId);
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Position gespeichert.'); await loadAll();
  }

  async function deletePriceItem(itemId) {
    if (!confirm('Diese Position von der Website entfernen? Sie lässt sich danach jederzeit wiederherstellen.')) return;
    const { error } = await db.from('service_price_items').update({ active: false }).eq('id', itemId);
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Entfernt.'); await loadAll();
  }

  async function restorePriceItem(itemId) {
    const { error } = await db.from('service_price_items').update({ active: true }).eq('id', itemId);
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Wiederhergestellt.'); await loadAll();
  }

  async function addPriceItem(serviceId) {
    const name = prompt('Name der neuen Position:');
    if (!name || !name.trim()) return;
    const priceRaw = prompt('Preis in CHF (leer lassen, um stattdessen einen Text wie „demnächst“ zu setzen):');
    let price_chf = null; let price_label = null;
    if (priceRaw && priceRaw.trim()) {
      price_chf = Number(priceRaw.trim());
      if (Number.isNaN(price_chf)) return toast('Ungültiger Preis.');
    } else {
      price_label = prompt('Text statt Preis (z. B. „demnächst“):');
      if (!price_label || !price_label.trim()) return toast('Bitte einen Preis oder einen Text angeben.');
    }
    const items = state.servicePriceItems.filter(item => item.service_id === serviceId);
    const nextOrder = items.length ? Math.max(...items.map(item => item.sort_order || 0)) + 1 : 1;
    const { error } = await db.from('service_price_items').insert({ service_id: serviceId, name: name.trim(), price_chf, price_label, sort_order: nextOrder });
    if (error) return toast(`Fehler: ${error.message}`);
    toast('Position hinzugefügt.'); await loadAll();
  }

  // Wird bei jeder Aktualisierung (auch Live-Updates im Hintergrund)
  // aufgerufen -- gewählte Werte offener Formulare bleiben erhalten.
  function fillServiceSelect() {
    const options = state.services.filter(service => service.active).map(service => `<option value="${service.id}">${esc(service.name)}</option>`).join('');
    const keep = ['appointment-service', 'waitlist-service', 'customer-preferred-service'].map(id => [id, $(id).value]);
    $('appointment-service').innerHTML = options;
    $('waitlist-service').innerHTML = `<option value="">Alle Behandlungen</option>${options}`;
    $('customer-preferred-service').innerHTML = `<option value="">Nicht festgelegt</option>${options}`;
    keep.forEach(([id, value]) => { if (value && [...$(id).options].some(option => option.value === value)) $(id).value = value; });
  }

  function fillPriceItemSelect(serviceId, selectedItemId = '') {
    const service = state.services.find(s => s.id === serviceId);
    const defaultMinutes = Number(service?.duration_minutes) || 90;
    const items = state.servicePriceItems
      .filter(item => item.service_id === serviceId && item.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const options = items.map(item => {
      const minutes = Number(item.duration_minutes) > 0 ? Number(item.duration_minutes) : defaultMinutes;
      return `<option value="${item.id}">${esc(item.name)} (${minutes} Min.)</option>`;
    }).join('');
    $('appointment-price-item').innerHTML = `<option value="">Keine bestimmte Position (${defaultMinutes} Min.)</option>${options}`;
    $('appointment-price-item').value = selectedItemId || '';
  }

  // Standarddauer laut Position bzw. Behandlung (Fallback 90 Min.).
  function defaultDurationMinutes(serviceId, priceItemId) {
    const priceItem = priceItemId ? state.servicePriceItems.find(item => item.id === priceItemId) : null;
    const service = state.services.find(s => s.id === serviceId);
    if (Number(priceItem?.duration_minutes) > 0) return Number(priceItem.duration_minutes);
    return Number(service?.duration_minutes) > 0 ? Number(service.duration_minutes) : 90;
  }

  // 15 Min. bis 4 Std. im Viertelstundenraster; eine abweichende bestehende
  // Dauer (z. B. 100 Min. aus einem Import) bleibt als eigene Option erhalten.
  function fillDurationSelect(minutes) {
    const values = Array.from({ length: 16 }, (_, index) => (index + 1) * 15);
    if (minutes > 0 && !values.includes(minutes)) values.push(minutes);
    values.sort((a, b) => a - b);
    $('appointment-duration').innerHTML = values.map(value => `<option value="${value}">${durationLabel(value)}</option>`).join('');
    $('appointment-duration').value = String(minutes > 0 ? minutes : 90);
  }

  // Kundensuche im Termin-Dialog: Name, E-Mail oder Telefon (letzte 9
  // Ziffern, wie phoneKey). Treffer, deren Name mit der Eingabe beginnt,
  // stehen oben.
  function searchCustomers(query) {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    // Telefon ohne Landes-/Ortsvorwahl-Präfix vergleichen: 079…, +41 79…
    // und 0041 79… sind dieselbe Nummer.
    const phoneCore = value => String(value || '').replace(/\D/g, '').replace(/^(00)?41/, '').replace(/^0/, '');
    const digits = phoneCore(text);
    const words = text.split(/\s+/);
    return state.customers
      .map(customer => {
        const name = String(customer.full_name || '').toLowerCase();
        const email = String(customer.email || '').toLowerCase();
        const nameHit = words.every(word => name.includes(word));
        const hit = nameHit || email.includes(text) || (digits.length >= 3 && /^[\d\s+()/-]+$/.test(text) && phoneCore(customer.phone).includes(digits));
        return hit ? { customer, rank: name.startsWith(text) ? 0 : nameHit ? 1 : 2 } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank || String(a.customer.full_name).localeCompare(String(b.customer.full_name), 'de'))
      .slice(0, 8)
      .map(entry => entry.customer);
  }

  // Kundensuche mit Auswahlfeld, wiederverwendet im Termin- und im
  // Wartelisten-Dialog. prefix = ID-Präfix der Elemente
  // (<prefix>-customer-search/-list/-chip/-ref …, <prefix>-name/-email/-phone).
  let customerPickerIndex = -1;
  function renderCustomerPicker(prefix) {
    const query = $(`${prefix}-customer-search`).value;
    const list = $(`${prefix}-customer-list`);
    if (!query.trim()) { list.hidden = true; $(`${prefix}-customer-search`).setAttribute('aria-expanded', 'false'); return; }
    const matches = searchCustomers(query);
    customerPickerIndex = matches.length ? 0 : -1;
    list.innerHTML = matches.map((customer, index) => {
      const stats = customerStats(customer);
      const meta = [customer.phone, customer.email].filter(Boolean).map(esc).join(' · ') || 'Keine Kontaktdaten';
      const visits = stats.totalBookings ? `${stats.totalBookings} Besuch${stats.totalBookings === 1 ? '' : 'e'}` : 'Noch kein Besuch';
      return `<button type="button" role="option" class="customer-picker-option${index === 0 ? ' is-active' : ''}" data-pick-customer="${customer.id}"><strong>${esc(customer.full_name)}</strong><span>${meta}</span><small>${visits}</small></button>`;
    }).join('') + `<button type="button" role="option" class="customer-picker-option is-new" data-pick-new><strong>+ Neue Kundin «${esc(query.trim())}»</strong></button>`;
    list.hidden = false;
    $(`${prefix}-customer-search`).setAttribute('aria-expanded', 'true');
    // mousedown verhindert nur den Fokusverlust des Suchfelds (sonst schliesst
    // onblur die Liste vor dem Klick), gewählt wird erst per click -- so
    // löst Scrollen der Liste auf dem Handy keine Auswahl aus.
    list.querySelectorAll('.customer-picker-option').forEach(button => button.onmousedown = event => event.preventDefault());
    list.querySelectorAll('[data-pick-customer]').forEach(button => button.onclick = () => selectPickerCustomer(prefix, button.dataset.pickCustomer));
    list.querySelector('[data-pick-new]').onclick = () => startNewPickerCustomer(prefix);
  }

  function moveCustomerPicker(prefix, step) {
    const options = [...$(`${prefix}-customer-list`).querySelectorAll('.customer-picker-option')];
    if (!options.length) return;
    customerPickerIndex = (customerPickerIndex + step + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle('is-active', index === customerPickerIndex));
    options[customerPickerIndex].scrollIntoView({ block: 'nearest' });
  }

  function setPickerCustomer(prefix, customer) {
    $(`${prefix}-customer-ref`).value = customer?.id || '';
    $(`${prefix}-customer-chip`).hidden = !customer;
    $(`${prefix}-customer-picker`).hidden = !!customer;
    $(`${prefix}-customer-hint`).hidden = !!customer;
    $(`${prefix}-customer-list`).hidden = true;
    $(`${prefix}-customer-search`).value = '';
    if (customer) $(`${prefix}-customer-chip-text`).innerHTML = `<strong>${esc(customer.full_name)}</strong>${[customer.phone, customer.email].filter(Boolean).map(value => ` · ${esc(value)}`).join('')}`;
  }

  function selectPickerCustomer(prefix, customerId) {
    const customer = state.customers.find(c => c.id === customerId);
    if (!customer) return;
    setPickerCustomer(prefix, customer);
    $(`${prefix}-name`).value = customer.full_name || '';
    $(`${prefix}-email`).value = customer.email || '';
    $(`${prefix}-phone`).value = customer.phone || '';
  }

  // Keine bestehende Kundin: Name übernehmen, E-Mail/Telefon erfassen --
  // das Profil entsteht beim Speichern (Termin: sync_appointment_customer(),
  // Warteliste: resolveWaitlistCustomer()).
  function startNewPickerCustomer(prefix) {
    const name = $(`${prefix}-customer-search`).value.trim();
    setPickerCustomer(prefix, null);
    $(`${prefix}-name`).value = name;
    $(`${prefix}-email`).value = '';
    $(`${prefix}-phone`).value = '';
    $(`${prefix}-phone`).focus();
  }

  function bindCustomerPicker(prefix, modalId) {
    const search = $(`${prefix}-customer-search`), list = $(`${prefix}-customer-list`);
    search.oninput = () => renderCustomerPicker(prefix);
    search.onkeydown = event => {
      if (list.hidden) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveCustomerPicker(prefix, event.key === 'ArrowDown' ? 1 : -1); }
      else if (event.key === 'Enter') {
        event.preventDefault();
        const active = list.querySelectorAll('.customer-picker-option')[customerPickerIndex];
        if (active?.dataset.pickCustomer) selectPickerCustomer(prefix, active.dataset.pickCustomer);
        else if (active) startNewPickerCustomer(prefix);
      } else if (event.key === 'Escape') { event.stopPropagation(); list.hidden = true; }
    };
    search.onblur = () => setTimeout(() => { list.hidden = true; }, 250);
    $(`${prefix}-customer-clear`).onclick = () => { setPickerCustomer(prefix, null); search.focus(); };
    $(`${prefix}-customer-open`).onclick = () => { const ref = $(`${prefix}-customer-ref`).value; if (ref) { closeModal(modalId); openCustomer(ref); } };
  }

  // Verschieben per Klick/Tippen (Handy, Tablet und Computer): im
  // Termin-Fenster wochenweise blättern (‹ › oder «+1 Woche» … «+4 Wochen»,
  // gerechnet ab der Woche des Termins); je Tag erscheinen alle freien
  // Startzeiten im 15-Minuten-Raster, egal zu welcher Uhrzeit. Frei =
  // innerhalb der Öffnungszeiten (abschaltbar), nicht in der Vergangenheit,
  // keine Überschneidung mit anderen Terminen oder Sperrzeiten bei gleicher
  // Dauer. Danach dieselbe Sicherheitsfrage und dieselben Info-Mails wie
  // beim Verlängern (openResizeConfirm 'move').
  let moveAppointmentId = null;
  let moveWeek = null;
  function openMovePanel(appointment) {
    moveAppointmentId = appointment.id;
    const start = new Date(appointment.starts_at);
    moveWeek = startOfWeek(start < new Date() ? new Date() : start);
    $('move-outside').checked = false;
    $('move-panel').hidden = false;
    renderMovePanel();
    $('move-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function freeMoveStarts(day, appointment, durationMs) {
    const toMin = value => Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]);
    const opening = (state.settings?.opening_hours || {})[String(day.getDay())];
    const outside = $('move-outside').checked;
    if (!opening && !outside) return null;
    const from = outside ? 7 * 60 : toMin(opening[0]);
    const until = outside ? 22 * 60 : toMin(opening[1]);
    const now = new Date();
    const busy = [
      ...state.appointments.filter(a => a.id !== appointment.id && a.status !== 'cancelled'),
      ...state.blocks
    ].map(item => [new Date(item.starts_at), new Date(item.ends_at)]);
    const starts = [];
    for (let minutes = from; minutes * 60000 + durationMs <= until * 60000; minutes += CAL_SLOT_MINUTES) {
      const start = new Date(day); start.setMinutes(minutes);
      const end = new Date(start.getTime() + durationMs);
      if (start <= now || busy.some(([s, e]) => start < e && end > s)) continue;
      starts.push(start);
    }
    return starts;
  }

  function renderMovePanel() {
    const appointment = state.appointments.find(a => a.id === moveAppointmentId);
    if (!appointment || !moveWeek) return;
    const oldStart = new Date(appointment.starts_at);
    const durationMs = new Date(appointment.ends_at) - oldStart;
    const appointmentWeek = startOfWeek(oldStart);
    const thisWeek = startOfWeek(new Date());
    $('move-duration').textContent = `Dauer ${durationLabel(Math.round(durationMs / 60000))}`;
    $('move-week-title').textContent = `${fmt(moveWeek, { day: '2-digit', month: 'short' })} – ${fmt(addDays(moveWeek, 6), { day: '2-digit', month: 'short', year: 'numeric' })}`;
    $('move-prev').disabled = moveWeek <= thisWeek;
    $('move-quick').innerHTML = [0, 1, 2, 3, 4].map(weeks => {
      const week = addDays(appointmentWeek, 7 * weeks);
      if (week < thisWeek) return '';
      const active = week.getTime() === moveWeek.getTime();
      return `<button type="button" data-move-week="${weeks}"${active ? ' class="is-active" aria-pressed="true"' : ''}>${weeks ? `+${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}` : 'Termin-Woche'}</button>`;
    }).join('');
    $('move-quick').querySelectorAll('[data-move-week]').forEach(button => button.onclick = () => {
      moveWeek = addDays(appointmentWeek, 7 * Number(button.dataset.moveWeek));
      renderMovePanel();
    });
    const days = Array.from({ length: 7 }, (_, index) => addDays(moveWeek, index)).map(day => {
      const starts = freeMoveStarts(day, appointment, durationMs);
      if (starts === null) return '';
      const label = fmt(day, { weekday: 'short', day: '2-digit', month: '2-digit' });
      const slots = starts.length
        ? starts.map(start => `<button type="button" class="move-slot" data-move-start="${start.toISOString()}">${fmt(start, { hour: '2-digit', minute: '2-digit' })}</button>`).join('')
        : '<span class="move-empty">ausgebucht</span>';
      return `<div class="move-dayrow${starts.length ? '' : ' is-full'}"><strong>${label}</strong><div class="move-slots">${slots}</div></div>`;
    }).join('');
    $('move-days').innerHTML = days || '<p class="move-empty">In dieser Woche ist geschlossen.</p>';
    $('move-days').querySelectorAll('[data-move-start]').forEach(button => button.onclick = () => {
      const start = new Date(button.dataset.moveStart);
      openResizeConfirm(appointment, start, new Date(start.getTime() + durationMs), 'move');
    });
  }

  function openAppointment(id = null, preset = null) {
    const item = id ? state.appointments.find(a => a.id === id) : null;
    $('appointment-modal-title').textContent = item ? 'Termin bearbeiten' : 'Termin eintragen';
    $('appointment-id').value = item?.id || '';
    $('appointment-kind').value = item?.is_private ? 'private' : 'customer';
    const serviceId = item?.service_id || state.services[0]?.id || '';
    $('appointment-service').value = serviceId;
    fillPriceItemSelect(serviceId, item?.price_item_id || '');
    $('appointment-start').value = localInput(item?.starts_at || preset?.start || nextRoundedSlot());
    fillDurationSelect(item
      ? Math.round((new Date(item.ends_at) - new Date(item.starts_at)) / 60000)
      : (preset?.duration || defaultDurationMinutes(serviceId, '')));
    $('appointment-status').value = item?.status || 'booked';
    $('appointment-name').value = item?.customer_name || '';
    $('appointment-email').value = item?.customer_email || '';
    $('appointment-phone').value = item?.customer_phone || '';
    $('appointment-notes').value = item?.notes || '';
    const linkedCustomer = state.customers.find(c => c.id === (item?.customer_ref_id || preset?.customerId));
    setPickerCustomer('appointment', linkedCustomer || null);
    if (!item && linkedCustomer) selectPickerCustomer('appointment', linkedCustomer.id);
    $('delete-appointment').hidden = !item || item.status === 'cancelled';
    updateNotifyField(item);
    $('move-appointment').hidden = !item || item.status !== 'booked';
    $('move-panel').hidden = true;
    moveAppointmentId = null;
    moveWeek = null;
    $('appointment-message').textContent = '';
    togglePrivateFields();
    openModal('appointment-modal');
  }

  // Kundinnen-Mails zu Dashboard-Terminen: neu -> Bestätigung + Erinnerung
  // (nur für künftige Termine), bestehend -> Absage bei Stornierung.
  // Ausgewertet von queue_appointment_emails() über notify_customer.
  function updateNotifyField(item = state.appointments.find(a => a.id === $('appointment-id').value)) {
    const privateEntry = $('appointment-kind').value === 'private';
    const start = new Date($('appointment-start').value);
    const future = !Number.isNaN(start.getTime()) && start > new Date();
    $('appointment-notify-field').hidden = privateEntry;
    if (!item) {
      $('appointment-notify').checked = future;
      $('appointment-notify').disabled = !future;
      $('appointment-notify-hint').textContent = future ? 'Bestätigung jetzt, Erinnerung vor dem Termin.' : 'Für vergangene Termine werden keine E-Mails verschickt.';
    } else {
      $('appointment-notify').disabled = false;
      $('appointment-notify').checked = item.notify_customer !== false;
      $('appointment-notify-hint').textContent = 'Gilt für Erinnerung und eine allfällige Stornierung.';
    }
  }

  function nextRoundedSlot() { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() < 30 ? 30 : 0); if (d.getMinutes() === 0) d.setHours(d.getHours() + 1); return d; }
  function togglePrivateFields() {
    const privateEntry = $('appointment-kind').value === 'private';
    // Behandlung/Position/Status/E-Mail/Telefon betreffen nur Kundentermine
    // -- "abgeschlossen"/"nicht erschienen" ergeben bei einem privaten
    // Eintrag (z. B. Arzt, Ferien) keinen Sinn, und Stornieren läuft ohnehin
    // über den eigenen Button. Bei privaten Einträgen blenden wir diese
    // Felder komplett aus, statt sie nur ausgegraut mit einem
    // stehengebliebenen Wert zu zeigen.
    ['appointment-service', 'appointment-price-item', 'appointment-status', 'appointment-email', 'appointment-phone'].forEach(id => {
      const field = $(id).closest('.field');
      if (field) field.hidden = privateEntry;
      $(id).disabled = privateEntry;
    });
    $('appointment-customer-field').hidden = privateEntry;
    $('appointment-name-label').textContent = privateEntry ? 'Bezeichnung' : 'Name';
    $('appointment-name').placeholder = privateEntry ? 'z. B. Arzttermin, Ferien' : '';
    if (privateEntry && !$('appointment-name').value) $('appointment-name').value = 'Privat, Liliane';
    if (!privateEntry && $('appointment-name').value === 'Privat, Liliane') $('appointment-name').value = '';
  }

  async function saveAppointment(event) {
    event.preventDefault();
    const id = $('appointment-id').value;
    const existing = id ? state.appointments.find(a => a.id === id) : null;
    const start = new Date($('appointment-start').value);
    const privateEntry = $('appointment-kind').value === 'private';
    const priceItemId = privateEntry ? '' : $('appointment-price-item').value;
    const durationMinutes = Number($('appointment-duration').value) || defaultDurationMinutes($('appointment-service').value, priceItemId);
    const customerRef = privateEntry ? null : ($('appointment-customer-ref').value || null);
    const payload = {
      notify_customer: !privateEntry && $('appointment-notify').checked,
      customer_ref_id: customerRef,
      service_id: privateEntry ? null : $('appointment-service').value,
      price_item_id: privateEntry ? null : (priceItemId || null),
      customer_name: $('appointment-name').value.trim(),
      customer_email: privateEntry ? null : $('appointment-email').value.trim() || null,
      customer_phone: privateEntry ? null : $('appointment-phone').value.trim() || null,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + durationMinutes * 60000).toISOString(),
      status: $('appointment-status').value,
      is_private: privateEntry,
      notes: $('appointment-notes').value.trim() || null
    };
    // Ersteller nur beim Anlegen setzen -- sonst wird eine bearbeitete
    // Online-Buchung als «von Liliane erfasst» angezeigt.
    if (!id) payload.created_by = state.user.id;
    // Andere Kundin gewählt: Konto-Verknüpfung (customer_id -> profiles,
    // steuert die Sicht im Kundenkonto) mitziehen. Unverändert = nicht
    // anfassen, damit Online-Buchungen ihr Konto behalten.
    if (customerRef && customerRef !== existing?.customer_ref_id) {
      payload.customer_id = state.customers.find(c => c.id === customerRef)?.profile_id || null;
    }
    const result = id ? await db.from('appointments').update(payload).eq('id', id) : await db.from('appointments').insert(payload);
    if (result.error) { $('appointment-message').textContent = result.error.message; return; }
    closeModal('appointment-modal'); await loadAll();
    if (payload.status === 'no_show' && existing?.status !== 'no_show') { toast('Rechnungsentwurf erstellt. Versand unter Finanzen → Rechnungen → «Senden».'); return; }
    if (existing && new Date(existing.starts_at).getTime() !== start.getTime()) {
      pulseAppointment(id);
      const canEmail = !privateEntry && payload.status === 'booked' && !!payload.customer_email;
      offerRescheduleEmail(id, new Date(existing.starts_at), new Date(existing.ends_at), start, canEmail);
    } else {
      toast(id ? 'Termin aktualisiert.' : 'Termin eingetragen.');
    }
  }

  async function cancelAppointment() {
    const id = $('appointment-id').value;
    const notify = $('appointment-notify').checked && !$('appointment-notify-field').hidden;
    if (!id || !confirm(`Diesen Termin wirklich stornieren? Der Verlauf bleibt erhalten.${notify ? ' Die Kundin erhält eine Absage per E-Mail.' : ' Die Kundin wird nicht per E-Mail informiert.'}`)) return;
    const { error } = await db.from('appointments').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), notify_customer: notify }).eq('id', id);
    if (error) return $('appointment-message').textContent = error.message;
    closeModal('appointment-modal'); toast('Termin storniert.'); await loadAll();
  }

  function openBlock() {
    const start = nextRoundedSlot();
    $('block-start').value = localInput(start);
    $('block-end').value = localInput(new Date(start.getTime() + 90 * 60000));
    $('block-message').textContent = '';
    openModal('block-modal');
  }

  async function saveBlock(event) {
    event.preventDefault();
    const start = new Date($('block-start').value);
    const end = new Date($('block-end').value);
    if (end <= start) return $('block-message').textContent = 'Das Enddatum muss nach dem Start liegen.';
    const { error } = await db.from('blocked_times').insert({ starts_at: start.toISOString(), ends_at: end.toISOString(), reason: $('block-reason').value.trim(), created_by: state.user.id });
    if (error) return $('block-message').textContent = error.message;
    closeModal('block-modal'); toast('Zeitraum gesperrt.'); await loadAll();
  }

  async function removeBlock(id) {
    if (!confirm('Diese Kalendersperre aufheben?')) return;
    const { error } = await db.from('blocked_times').delete().eq('id', id);
    if (error) return toast(error.message);
    toast('Sperre aufgehoben.'); await loadAll();
  }

  async function updateInvoice(id, status) {
    const { error } = await db.from('invoices').update({ status }).eq('id', id);
    if (error) return toast(error.message);
    toast('Rechnungsstatus gespeichert.'); await loadAll();
  }

  async function saveCampaign(event) {
    event.preventDefault();
    const scheduled = $('campaign-date').value ? new Date($('campaign-date').value).toISOString() : null;
    // Gespeichert wird als Entwurf; mit Versandzeit wird direkt eingeplant
    // (queue_marketing_campaign legt die Mails mit scheduled_for an) --
    // vorher blieb eine «geplante» Kampagne für immer liegen.
    const { data: created, error } = await db.from('marketing_campaigns').insert({ title: $('campaign-title').value.trim(), subject: $('campaign-subject').value.trim(), content: $('campaign-content').value.trim(), scheduled_at: scheduled, status: 'draft', created_by: state.user.id }).select('id').single();
    if (!error && scheduled && created?.id && confirm(`Kampagne für ${fmt(scheduled, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} an alle Kundinnen mit Marketing-Einwilligung einplanen?`)) {
      const { data: count, error: queueError } = await db.rpc('queue_marketing_campaign', { requested_campaign_id: created.id });
      if (queueError) { $('campaign-message').textContent = queueError.message; return; }
      closeModal('campaign-modal'); toast(`${count} E-Mails eingeplant.`); await loadAll(); return;
    }
    if (error) return $('campaign-message').textContent = error.message;
    closeModal('campaign-modal'); $('campaign-form').reset(); toast('Kampagne gespeichert.'); await loadAll();
  }

  async function queueCampaign(id) {
    if (!confirm('Kampagne an alle Kundinnen mit Marketing-Einwilligung einplanen?')) return;
    const { data, error } = await db.rpc('queue_marketing_campaign', { requested_campaign_id: id });
    if (error) return toast(error.message);
    toast(`${data} E-Mails wurden für den Versand eingeplant.`); await loadAll();
  }

  function openCustomer(id, { focusChat = false } = {}) {
    const customer = state.customers.find(item => item.id === id);
    if (!customer) return;
    const stats = customerStats(customer);
    $('customer-id').value = customer.id;
    $('customer-name').value = customer.full_name;
    $('customer-email').value = customer.email || '';
    $('customer-phone').value = customer.phone || '';
    $('customer-language').value = customer.language || '';
    $('customer-birth-date').value = customer.birth_date || '';
    $('customer-source').value = customer.acquisition_source || (customer.source === 'Treatwell CSV-Import' ? 'Treatwell' : customer.source || '');
    $('customer-preferred-service').value = customer.preferred_service_id || '';
    $('customer-tags').value = (customer.tags || []).join(', ');
    $('customer-consent-source').value = customer.marketing_consent_source || '';
    $('customer-consent-version').value = customer.marketing_consent_version || '';
    $('customer-do-not-contact').checked = customer.do_not_contact;
    $('customer-notes').value = customer.notes || '';
    $('customer-marketing').checked = customer.marketing_consent;
    const actualPayments = state.payments.filter(payment => payment.customer_id === customer.id || (payment.appointments?.customer_email && customer.email && payment.appointments.customer_email.toLowerCase() === customer.email.toLowerCase())).filter(payment => payment.status === 'completed').reduce((sum, payment) => sum + Number(payment.amount_chf || 0), 0);
    const activePackages = state.packages.filter(item => item.customer_id === customer.id && item.status === 'active').length;
    $('customer-insights').innerHTML = [
      ['Kundenstatus', `<span class="segment segment-${stats.segment.key}">${esc(stats.segment.label)}</span>`],
      ['Kundenlogin', customer.profile_id ? '<span class="login-state is-active">✓ Aktiv</span>' : '<span class="login-state">Noch nicht registriert</span>'],
      ['Termine gesamt', stats.totalBookings],
      ['Erfasster Umsatz', esc(money(stats.revenue))],
      ['Zahlungen', esc(money(actualPayments))],
      ['Aktive Pakete', activePackages],
      ['Empfehlungscode', esc(customer.referral_code || '–')],
      [stats.upcoming.length > 1 ? `Kommende Termine (${stats.upcoming.length})` : 'Nächster Termin', stats.upcoming.length ? stats.upcoming.map(a => esc(fmt(a.starts_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))).join('<br>') : 'Keiner']
    ].map(([label, value]) => `<div class="customer-insight"><span>${esc(label)}</span><strong>${value}</strong></div>`).join('');
    $('customer-registration').hidden = Boolean(customer.profile_id);
    $('customer-registration-title').textContent = customer.registration_invited_at ? 'Registrierung noch ausstehend' : 'Noch kein Kundenlogin';
    $('customer-registration-copy').textContent = customer.registration_invited_at
      ? `Letzte Einladung: ${fmt(customer.registration_invited_at, { day: '2-digit', month: '2-digit', year: 'numeric' })} per ${(customer.registration_invite_channel || 'Kontaktkanal').toUpperCase()}. Beim Signup wird dieses CRM-Profil automatisch verknüpft.`
      : 'Einladung über einen vorhandenen Kontaktkanal senden. Die Kundin registriert sich mit E-Mail und ihrer hinterlegten Telefonnummer.';
    $('customer-registration-actions').innerHTML = registrationActionButtons(customer);
    bindRegistrationActions($('customer-registration-actions'));
    // Kommende Termine immer vollständig, danach die letzten 8 vergangenen.
    const upcomingIds = new Set(stats.upcoming.map(a => a.id));
    const history = [...stats.upcoming, ...[...stats.items].filter(a => !upcomingIds.has(a.id)).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 8)];
    $('customer-history').innerHTML = `${stats.legacyBookings ? `<p class="muted">${stats.legacyBookings} historische Buchungen aus dem Kundenimport. Dafür liegen keine einzelnen Termin- oder Preisdaten vor.</p>` : ''}${history.length ? `<div class="history-list">${history.map(appointment => `<div class="history-item${upcomingIds.has(appointment.id) ? ' is-upcoming' : ''}"><span>${esc(fmt(appointment.starts_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} · ${esc(appointment.services?.name || 'Behandlung')}</span><strong>${upcomingIds.has(appointment.id) ? 'Geplant' : esc(labelStatus(appointment.status))}${appointment.status === 'completed' ? ` · ${esc(money(appointment.amount_chf ?? appointment.services?.price_chf ?? 0))}` : ''}</strong></div>`).join('')}</div>` : '<p class="muted">Noch keine einzelnen Termine im neuen Kalender erfasst.</p>'}`;
    const communications = state.communications.filter(item => item.customer_id === customer.id).slice(0, 8);
    $('customer-communications').innerHTML = `${communications.length ? `<div class="communication-list">${communications.map(item => `<div class="communication-item"><span class="communication-channel">${esc(({ email: 'E-Mail', phone: 'Telefon', sms: 'SMS', whatsapp: 'WhatsApp', in_person: 'Persönlich', system: 'System' })[item.channel] || item.channel)}</span><span><strong>${esc(item.subject || item.communication_type)}</strong><small>${esc(fmt(item.occurred_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} · ${esc(item.status)}</small></span></div>`).join('')}</div>` : '<p class="muted">Noch keine Kommunikation protokolliert.</p>'}`;
    $('customer-rebook-message').disabled = !customer.email || !customer.marketing_consent || customer.do_not_contact;
    // Doppelprofil-Vorschläge: gleiche Telefonnummer oder gleicher Name
    // (z. B. neues Online-Konto zu bestehender Kartei, siehe crm_tasks
    // 'duplicate_check' aus link_profile_to_customer()).
    const nameKey = value => String(value || '').trim().toLowerCase();
    const matches = state.customers.filter(item => item.id !== customer.id && (
      (phoneKey(customer.phone) && phoneKey(item.phone) === phoneKey(customer.phone))
      || (nameKey(customer.full_name) && nameKey(item.full_name) === nameKey(customer.full_name))));
    $('customer-merge-suggestions').hidden = !matches.length;
    $('customer-merge-suggestions').innerHTML = matches.length ? `<strong>Mögliche Doppelprofile gefunden</strong><p>Telefonnummer oder Name stimmen überein. Bitte nur zusammenführen, wenn es wirklich dieselbe Person ist.</p>${matches.map(item => `<div><span>${esc(item.full_name)} · ${esc([item.phone, item.email || 'ohne E-Mail'].filter(Boolean).join(' · '))}</span><button class="secondary small" type="button" data-merge-customer="${item.id}">Zusammenführen</button></div>`).join('')}` : '';
    document.querySelectorAll('[data-merge-customer]').forEach(button => button.onclick = () => mergeCustomerProfiles(customer.id, button.dataset.mergeCustomer));
    $('customer-message').textContent = '';
    $('customer-chat-text').value = '';
    $('customer-chat-message').textContent = '';
    $('customer-chat-filename').textContent = '';
    loadCustomerChat(customer.id);
    markCustomerMessagesRead(customer.id);
    openModal('customer-modal');
    const scroll = $('customer-modal').querySelector('.modal-scroll');
    if (scroll) {
      if (focusChat) $('customer-chat').scrollIntoView({ block: 'start' });
      else scroll.scrollTop = 0;
    }
  }

  async function markCustomerMessagesRead(customerId) {
    const unread = state.customerMedia.filter(item => item.customer_id === customerId && item.sender === 'customer' && !item.admin_read_at);
    if (!unread.length) return;
    const now = new Date().toISOString();
    const { error } = await db.from('customer_media').update({ admin_read_at: now }).in('id', unread.map(item => item.id));
    if (error) return;
    unread.forEach(item => { item.admin_read_at = now; });
    renderMessages();
  }

  async function signedCustomerPhotoUrl(path) {
    const { data } = await db.storage.from('customer-photos').createSignedUrl(path, 3600);
    return data?.signedUrl || '';
  }

  async function loadCustomerChat(customerId) {
    const chatEl = $('customer-chat');
    chatEl.innerHTML = '<div class="customer-chat-empty">Wird geladen ...</div>';
    const { data, error } = await db.from('customer_media').select('*').eq('customer_id', customerId).order('created_at');
    if (error) { chatEl.innerHTML = `<div class="customer-chat-empty">${esc(error.message)}</div>`; return; }
    const rows = data || [];
    if (!rows.length) { chatEl.innerHTML = '<div class="customer-chat-empty">Noch keine Fotos oder Nachrichten.</div>'; return; }
    chatEl.innerHTML = '';
    for (const row of rows) {
      const bubble = document.createElement('div');
      bubble.className = `customer-chat-bubble is-${row.category === 'result' ? 'result' : row.sender}`;
      let html = row.message ? `<p>${esc(row.message)}</p>` : '';
      if (row.photo_path) {
        const url = await signedCustomerPhotoUrl(row.photo_path);
        if (url) html += `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="" loading="lazy"></a>`;
      }
      html += `<time>${esc(fmt(row.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}${row.category === 'result' ? ' · Behandlungsfoto' : ''}</time>`;
      html += `<button class="link-button chat-delete" type="button" data-delete-media="${row.id}">Löschen</button>`;
      bubble.innerHTML = html;
      bubble.querySelector('[data-delete-media]').onclick = async () => {
        if (!confirm(row.photo_path ? 'Diese Nachricht inklusive Foto endgültig löschen?' : 'Diese Nachricht endgültig löschen?')) return;
        if (row.photo_path) await db.storage.from('customer-photos').remove([row.photo_path]);
        const { error: deleteError } = await db.from('customer_media').delete().eq('id', row.id);
        if (deleteError) return toast(deleteError.message);
        toast('Gelöscht.');
        loadCustomerChat(customerId);
      };
      chatEl.appendChild(bubble);
    }
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  async function sendCustomerChat() {
    const customerId = $('customer-id').value;
    if (!customerId) return;
    const message = $('customer-chat-message');
    const text = $('customer-chat-text').value.trim();
    const category = $('customer-chat-category').value;
    const file = $('customer-chat-photo').files[0];
    if (!text && !file) { message.textContent = 'Bitte einen Text oder ein Foto angeben.'; return; }
    if ($('customer-chat-send').disabled) return;
    $('customer-chat-send').disabled = true;
    setTimeout(() => { $('customer-chat-send').disabled = false; }, 1500);
    message.textContent = 'Wird gesendet ...';

    let photo_path = null;
    if (file) {
      photo_path = `${customerId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await db.storage.from('customer-photos').upload(photo_path, file);
      if (uploadError) { message.textContent = uploadError.message; return; }
    }

    const { error } = await db.from('customer_media').insert({
      customer_id: customerId,
      category,
      sender: 'admin',
      message: text || null,
      photo_path
    });
    if (error) { message.textContent = error.message; return; }

    message.textContent = '';
    $('customer-chat-text').value = '';
    $('customer-chat-photo').value = '';
    $('customer-chat-filename').textContent = '';
    loadCustomerChat(customerId);
  }

  async function saveCustomer(event) {
    event.preventDefault();
    const customerId = $('customer-id').value;
    const email = $('customer-email').value.trim().toLowerCase() || null;
    const { error } = await db.from('customers').update({ full_name: $('customer-name').value.trim(), email, phone: $('customer-phone').value.trim() || null, language: $('customer-language').value.trim() || null, birth_date: $('customer-birth-date').value || null, acquisition_source: $('customer-source').value || null, preferred_service_id: $('customer-preferred-service').value || null, tags: $('customer-tags').value.split(',').map(tag => tag.trim()).filter(Boolean), marketing_consent_source: $('customer-consent-source').value.trim() || null, marketing_consent_version: $('customer-consent-version').value.trim() || null, do_not_contact: $('customer-do-not-contact').checked, notes: $('customer-notes').value.trim() || null, marketing_consent: $('customer-marketing').checked }).eq('id', customerId);
    if (error) return $('customer-message').textContent = error.message;
    if (email) await db.from('crm_tasks').update({ status: 'done', completed_at: new Date().toISOString(), completed_by: state.user.id }).eq('customer_id', customerId).eq('task_type', 'missing_email').eq('status', 'open');
    closeModal('customer-modal'); toast('Kundenprofil gespeichert.'); await loadAll();
  }

  async function sendRegistrationInvite(customerId, channel) {
    const customer = state.customers.find(item => item.id === customerId);
    if (!customer) return;
    if (channel === 'whatsapp' || channel === 'sms') {
      const registrationUrl = 'https://www.gigibeauty.ch/pages/booking.html?register=1';
      const message = `Hallo ${customer.full_name.split(' ')[0]}\n\ndu kannst deine Termine bei GiGi Beauty neu direkt online verwalten und buchen. Erstelle hier dein persönliches Konto und verwende dabei bitte diese Telefonnummer: ${customer.phone}\n\n${registrationUrl}`;
      const target = channel === 'whatsapp'
        ? `https://wa.me/${swissPhone(customer.phone)}?text=${encodeURIComponent(message)}`
        : `sms:+${swissPhone(customer.phone)}?body=${encodeURIComponent(message)}`;
      window.open(target, '_blank', 'noopener');
    }
    const { error } = await db.rpc('queue_registration_invite', { requested_customer_id: customerId, requested_channel: channel });
    if (error) return toast(error.message);
    toast(channel === 'email' ? 'Die Registrierungseinladung ist für den E-Mail-Versand eingeplant.' : `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} ist vorbereitet. Bitte sende die Nachricht noch ab.`);
    await loadAll();
    if (!$('customer-modal').hidden) openCustomer(customerId);
  }

  async function queueCustomerRebooking() {
    const customerId = $('customer-id').value;
    if (!customerId) return;
    const { error } = await db.rpc('queue_customer_message', { requested_customer_id: customerId, requested_kind: 'rebooking' });
    if (error) return $('customer-message').textContent = error.message;
    toast('Wiederbuchungsnachricht wurde eingeplant.'); await loadAll(); openCustomer(customerId);
  }

  async function mergeCustomerProfiles(firstId, secondId) {
    const first = state.customers.find(item => item.id === firstId);
    const second = state.customers.find(item => item.id === secondId);
    if (!first || !second || !confirm(`${first.full_name} und ${second.full_name} wirklich zu einem Profil zusammenführen?`)) return;
    const primary = first.profile_id ? first : second.profile_id ? second : first.email ? first : second;
    const duplicate = primary.id === first.id ? second : first;
    const { data, error } = await db.rpc('merge_customers', { primary_customer_id: primary.id, duplicate_customer_id: duplicate.id });
    if (error) return $('customer-message').textContent = error.message;
    // Offene "Doppelprofil prüfen"-Aufgaben sind damit erledigt.
    await db.from('crm_tasks').update({ status: 'done', completed_at: new Date().toISOString(), completed_by: state.user.id }).eq('customer_id', data || primary.id).eq('task_type', 'duplicate_check').eq('status', 'open');
    closeModal('customer-modal'); toast('Kundenprofile wurden zusammengeführt.'); await loadAll(); openCustomer(data || primary.id);
  }

  // Endgültiges Löschen (RPC delete_customer_permanently, siehe Migration
  // 202611010006). Der Dialog zeigt vorher, was alles verschwindet, und
  // verlangt den Namen als Bestätigung. Kommende Termine blockieren.
  function openCustomerDelete() {
    const customer = state.customers.find(c => c.id === $('customer-id').value);
    if (!customer) return;
    const stats = customerStats(customer);
    const media = state.customerMedia.filter(m => m.customer_id === customer.id).length;
    $('customer-delete-lead').innerHTML = `<strong>${esc(customer.full_name)}</strong>${[customer.phone, customer.email].filter(Boolean).map(v => ` · ${esc(v)}`).join('')}`;
    $('customer-delete-list').innerHTML = [
      'Kundenprofil mit Notizen, Tags und Einwilligungen',
      'Chat-Nachrichten und Fotos' + (media ? ` (${media})` : ''),
      'Aufgaben, Kommunikationsverlauf und Wartelisten-Einträge',
      'Gesendete und geplante E-Mails, KI-Farbwünsche unter ihrem Namen',
      customer.profile_id ? 'Ihr Online-Login (Konto im Kundencenter)' : '',
      'Alle Kopien im Änderungsprotokoll'
    ].filter(Boolean).map(item => `<li>${esc(item)}</li>`).join('');
    $('customer-delete-confirm').value = '';
    $('customer-delete-submit').disabled = true;
    $('customer-delete-message').textContent = stats.upcoming.length
      ? `Sie hat noch ${stats.upcoming.length} kommende${stats.upcoming.length === 1 ? 'n Termin' : ' Termine'}. Diese bitte zuerst stornieren.`
      : '';
    $('customer-delete-confirm').disabled = stats.upcoming.length > 0;
    $('customer-delete-form').dataset.customerId = customer.id;
    openModal('customer-delete-modal');
    if (!stats.upcoming.length) $('customer-delete-confirm').focus();
  }

  async function deleteCustomerPermanently(event) {
    event.preventDefault();
    const customer = state.customers.find(c => c.id === $('customer-delete-form').dataset.customerId);
    if (!customer || $('customer-delete-confirm').value.trim().toLowerCase() !== customer.full_name.trim().toLowerCase()) return;
    $('customer-delete-submit').disabled = true;
    $('customer-delete-message').textContent = 'Wird gelöscht …';
    // Dateipfade vor dem Löschen der Zeilen einsammeln.
    const folder = await db.storage.from('customer-photos').list(customer.id, { limit: 1000 });
    const photoPaths = (folder.data || []).map(file => `${customer.id}/${file.name}`);
    const nameFilter = customer.full_name.trim().replace(/[\\%_]/g, char => `\\${char}`);
    const { data: previews } = await db.from('ai_preview_requests').select('photo_path').ilike('customer_name', nameFilter);
    const { error } = await db.rpc('delete_customer_permanently', { target_customer_id: customer.id });
    if (error) { $('customer-delete-submit').disabled = false; $('customer-delete-message').textContent = error.message; return; }
    const previewPaths = (previews || []).map(p => p.photo_path).filter(Boolean);
    const removals = await Promise.all([
      photoPaths.length ? db.storage.from('customer-photos').remove(photoPaths) : { error: null },
      previewPaths.length ? db.storage.from('ai-preview-photos').remove(previewPaths) : { error: null }
    ]);
    closeModal('customer-delete-modal');
    closeModal('customer-modal');
    await loadAll();
    toast(removals.some(r => r.error) ? `${customer.full_name} gelöscht. Einige Fotos konnten nicht entfernt werden.` : `${customer.full_name} wurde endgültig gelöscht.`);
  }

  // Speicher-Schlüssel erlauben keine Umlaute/Leerzeichen («Nägel Juni.jpg»).
  function safeFileName(name) {
    return String(name || 'foto.jpg').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'foto.jpg';
  }

  function openContactLog() {
    const customerId = $('customer-id').value;
    if (!customerId) return;
    $('contact-form').reset();
    $('contact-customer-id').value = customerId;
    $('contact-message').textContent = '';
    openModal('contact-modal');
  }

  async function saveContactLog(event) {
    event.preventDefault();
    const customerId = $('contact-customer-id').value;
    const { error } = await db.from('customer_communications').insert({ customer_id: customerId, channel: $('contact-channel').value, direction: $('contact-direction').value, communication_type: 'manual_note', subject: $('contact-subject').value.trim(), content: $('contact-content').value.trim(), status: 'sent', occurred_at: new Date().toISOString(), created_by: state.user.id });
    if (error) return $('contact-message').textContent = error.message;
    await db.from('customers').update({ last_contacted_at: new Date().toISOString() }).eq('id', customerId);
    closeModal('contact-modal'); closeModal('customer-modal'); toast('Kontakt wurde protokolliert.'); await loadAll(); openCustomer(customerId);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(field); field = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[index + 1] === '\n') index += 1;
        row.push(field); field = '';
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
      } else field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const headers = (rows.shift() || []).map(header => header.replace(/^\uFEFF/, '').trim());
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ''])));
  }

  function parseImportDate(value) {
    if (!value) return null;
    const match = value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
    return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }

  function parseImportTimestamp(value) {
    return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value || '') ? value.replace(' ', 'T') : null;
  }

  function importReference(fullName, phone) {
    const normalize = value => (value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `treatwell:${normalize(fullName)}:${normalize(phone) || 'ohne-telefon'}`;
  }

  async function upsertInBatches(records, onConflict) {
    for (let index = 0; index < records.length; index += 150) {
      const { error } = await db.from('customers').upsert(records.slice(index, index + 150), { onConflict });
      if (error) throw error;
    }
  }

  async function importCustomers(file) {
    const parsed = parseCsv(await file.text()).map(row => {
      const email = (row.Email || row['E-Mail'] || '').trim().toLowerCase() || null;
      const fullName = row.Name || [row.Vorname, row.Nachname].filter(Boolean).join(' ');
      const consent = (row.Einwilligungsstatus || '').toLowerCase();
      const phone = row.Telefon || null;
      const marketingConsent = /^(j|ja|yes|erteilt|zugestimmt|opt.?in|true)$/.test(consent);
      const createdAt = parseImportTimestamp(row.Erstellt);
      return { full_name: fullName.trim(), email, phone, notes: row.Info || null, gender: row.Geschlecht || null, language: row.Sprache || null, birth_date: parseImportDate(row.Geburtsdatum), marketing_consent: marketingConsent, marketing_consent_at: marketingConsent ? createdAt : null, marketing_consent_source: marketingConsent ? 'Treatwell Export' : null, marketing_consent_version: marketingConsent ? 'Import 2026-07-03' : null, acquisition_source: 'Treatwell', source: 'Treatwell CSV-Import', external_reference: email ? `treatwell:email:${email}` : importReference(fullName, phone), legacy_booking_count: Math.max(0, Number.parseInt(row['Anzahl der Buchungen'], 10) || 0), created_at: createdAt };
    }).filter(row => row.full_name);

    const recordsByKey = new Map();
    parsed.forEach(record => {
      const key = record.email || record.external_reference;
      const existing = recordsByKey.get(key);
      if (!existing) return recordsByKey.set(key, record);
      recordsByKey.set(key, {
        ...existing,
        phone: existing.phone || record.phone,
        notes: existing.notes || record.notes,
        gender: existing.gender || record.gender,
        language: existing.language || record.language,
        birth_date: existing.birth_date || record.birth_date,
        marketing_consent: existing.marketing_consent || record.marketing_consent,
        legacy_booking_count: Math.max(existing.legacy_booking_count, record.legacy_booking_count),
        created_at: [existing.created_at, record.created_at].filter(Boolean).sort()[0] || null
      });
    });

    // Bestehende Profile: Name, Notizen und Einwilligung von Liliane haben
    // Vorrang -- der Import ergänzt nur (Notizen werden angehängt, eine
    // Einwilligung nie entzogen, «Nicht kontaktieren» nie aufgehoben).
    const records = [...recordsByKey.values()].map(record => {
      const existing = state.customers.find(c => (record.email && c.email?.toLowerCase() === record.email) || (record.external_reference && c.external_reference === record.external_reference));
      if (!existing) return record;
      const notes = existing.notes && record.notes && !existing.notes.includes(record.notes) ? `${existing.notes}\n${record.notes}` : (existing.notes || record.notes);
      return { ...record, full_name: existing.full_name || record.full_name, notes, phone: existing.phone || record.phone,
        marketing_consent: existing.do_not_contact ? existing.marketing_consent : (existing.marketing_consent || record.marketing_consent),
        legacy_booking_count: Math.max(Number(existing.legacy_booking_count || 0), Number(record.legacy_booking_count || 0)) };
    });
    if (!records.length) return toast('Keine gültigen Kundenzeilen mit Name gefunden.');
    const withEmail = records.filter(row => row.email);
    const withoutEmail = records.filter(row => !row.email);
    try {
      await upsertInBatches(withEmail, 'email');
      await upsertInBatches(withoutEmail, 'external_reference');
    } catch (error) {
      return toast(`Import fehlgeschlagen: ${error.message}`);
    }
    toast(`${records.length} Kundenprofile importiert oder aktualisiert (${withoutEmail.length} ohne E-Mail).`); await loadAll();
  }

  function showPanel(name) {
    document.querySelectorAll('[data-panel]').forEach(button => button.classList.toggle('is-active', button.dataset.panel === name));
    document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== name; });
    [$('panel-title').textContent, $('panel-subtitle').textContent] = panelMeta[name];
    $('quick-add').hidden = !['overview', 'calendar'].includes(name);
  }

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  let toastTimer;
  function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4500); }

  $('admin-login').addEventListener('submit', async event => {
    event.preventDefault();
    if (!db) return;
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    $('login-message').textContent = 'Anmeldung läuft.';
    submit.disabled = true;
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Login timeout')), 12000));
      const { data, error } = await Promise.race([
        db.auth.signInWithPassword({ email: $('admin-email').value.trim(), password: $('admin-password').value }),
        timeout
      ]);
      if (error) { $('login-message').textContent = loginErrorMessage(error); return; }
      $('login-message').textContent = 'Passwort akzeptiert. Die Anmeldung wird abgeschlossen.';
      await enterDashboard(data.user);
    } catch (error) {
      $('login-message').textContent = loginErrorMessage(error);
    } finally {
      submit.disabled = false;
    }
  });
  $('logout').onclick = async () => { await db.auth.signOut(); location.reload(); };
  $('forgot-password').onclick = async () => {
    if (!db) return;
    const email = $('admin-email').value.trim();
    if (!email) { $('login-message').textContent = 'Bitte zuerst die E-Mail-Adresse eingeben.'; return; }
    $('login-message').textContent = 'Der Link wird verschickt.';
    const base = location.pathname.replace(/[^/]*$/, '');
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${base}reset-password.html` });
    $('login-message').textContent = error ? loginErrorMessage(error) : 'Falls ein Konto mit dieser E-Mail-Adresse besteht, wurde ein Link zum Zurücksetzen verschickt. Bitte auch den Spam-Ordner prüfen.';
  };
  document.querySelectorAll('[data-panel]').forEach(button => button.onclick = () => showPanel(button.dataset.panel));
  document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => showPanel(button.dataset.go));
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => closeModal(button.closest('.modal-backdrop').id));
  $('quick-add').onclick = () => openAppointment();
  $('add-appointment').onclick = () => openAppointment();
  $('add-block').onclick = openBlock;
  $('refresh-crm-tasks').onclick = refreshCrmTasks;
  $('add-waitlist').onclick = openWaitlist;
  $('add-payment').onclick = openPayment;
  $('add-expense').onclick = openExpense;
  $('add-inventory').onclick = () => openInventory();
  $('add-gift-card').onclick = openGiftCard;
  $('add-package').onclick = openPackage;
  $('new-campaign').onclick = () => { $('campaign-message').textContent = ''; openModal('campaign-modal'); };
  $('save-opening-hours').onclick = saveOpeningHours;
  $('save-contact').onclick = saveContact;
  $('add-testimonial').onclick = addTestimonial;
  $('week-prev').onclick = () => shiftCalendar(-1);
  $('week-next').onclick = () => shiftCalendar(1);
  document.querySelectorAll('[data-cal-view]').forEach(button => button.onclick = () => { state.calView = button.dataset.calView; renderCalendar(); });
  $('week-today').onclick = () => setCalendarDay(new Date());
  // Wischen (Handy): links = vor, rechts = zurück -- je nach Ansicht um
  // einen Tag, eine Woche oder einen Monat.
  (() => {
    let start = null;
    $('admin-calendar').addEventListener('touchstart', event => {
      start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY, t: Date.now() } : null;
    }, { passive: true });
    $('admin-calendar').addEventListener('touchend', event => {
      if (!start || !isTouchDevice() || resizeState) { start = null; return; }
      const touch = event.changedTouches[0], dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - start.t < 700) shiftCalendar(dx < 0 ? 1 : -1);
      start = null;
    }, { passive: true });
    let wasCompact = isCompactCalendar();
    window.addEventListener('resize', () => { const now = isCompactCalendar(); if (now !== wasCompact && state.user) { wasCompact = now; renderCalendar(); } });
  })();
  bindCalendarMove();
  bindWeekDragToShift();
  bindOverviewInteractions();
  // Tabellen werden auf dem Handy als Karten dargestellt (CSS, max-width
  // 720px); dafür trägt jede Zelle ihre Spaltenüberschrift als data-label.
  // Ein Observer beschriftet neu gerenderte Zeilen automatisch.
  function labelTableCells(root = document) {
    root.querySelectorAll('.table-wrap table').forEach(table => {
      const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(row => [...row.children].forEach((cell, index) => {
        if (cell.colSpan > 1) { cell.dataset.label = ''; return; }
        if (headers[index] && cell.dataset.label !== headers[index]) cell.dataset.label = headers[index];
        // Inhalt in einen Wrapper, damit er auf dem Handy als eigene Spalte
        // neben der Bezeichnung steht (Event-Listener bleiben beim Verschieben).
        if (!(cell.childNodes.length === 1 && cell.firstElementChild?.classList.contains('cell-value'))) {
          const wrapper = document.createElement('span');
          wrapper.className = 'cell-value';
          wrapper.append(...cell.childNodes);
          cell.append(wrapper);
        }
      }));
    });
  }
  let tableLabelFrame = null;
  new MutationObserver(() => {
    if (tableLabelFrame) return;
    tableLabelFrame = requestAnimationFrame(() => { tableLabelFrame = null; labelTableCells(); });
  }).observe(document.querySelector('.dash-main') || document.body, { childList: true, subtree: true });
  // Diagramm bei geänderter Breite (Handy drehen, Fenster) neu zeichnen.
  let chartResizeTimer = null, lastChartWidth = 0;
  window.addEventListener('resize', () => {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(() => {
      const width = $('revenue-chart').clientWidth;
      if (state.user && width && Math.abs(width - lastChartWidth) > 40) { lastChartWidth = width; renderOverview(); }
    }, 200);
  });
  $('appointment-kind').onchange = () => { togglePrivateFields(); updateNotifyField(); };
  $('appointment-start').addEventListener('change', () => { if (!$('appointment-id').value) updateNotifyField(null); });
  $('appointment-service').onchange = () => { fillPriceItemSelect($('appointment-service').value); fillDurationSelect(defaultDurationMinutes($('appointment-service').value, '')); };
  $('appointment-price-item').onchange = () => fillDurationSelect(defaultDurationMinutes($('appointment-service').value, $('appointment-price-item').value));
  $('resize-confirm-modal').addEventListener('click', event => { if (event.target === event.currentTarget) renderCalendar(); });
  document.addEventListener('pointerdown', event => { if (!$('gap-menu').hidden && !$('gap-menu').contains(event.target)) closeGapMenu(); });
  $('admin-calendar').addEventListener('scroll', closeGapMenu);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('gap-menu').hidden) { closeGapMenu(); return; }
    if (!$('resize-confirm-modal').hidden) { cancelResize(); return; }
    const open = [...document.querySelectorAll('.modal-backdrop')].filter(m => !m.hidden);
    if (open.length) closeModal(open[open.length - 1].id);
  });
  $('appointment-form').onsubmit = saveAppointment;
  bindCustomerPicker('appointment', 'appointment-modal');
  $('move-appointment').onclick = () => {
    const item = state.appointments.find(a => a.id === $('appointment-id').value);
    if (!item) return;
    if ($('move-panel').hidden) openMovePanel(item); else $('move-panel').hidden = true;
  };
  $('move-outside').onchange = renderMovePanel;
  $('move-prev').onclick = () => { moveWeek = addDays(moveWeek, -7); renderMovePanel(); };
  $('move-next').onclick = () => { moveWeek = addDays(moveWeek, 7); renderMovePanel(); };
  bindCustomerPicker('waitlist', 'waitlist-modal');
  $('customer-delete').onclick = openCustomerDelete;
  $('customer-delete-form').onsubmit = deleteCustomerPermanently;
  $('customer-delete-confirm').oninput = event => {
    const customer = state.customers.find(c => c.id === $('customer-delete-form').dataset.customerId);
    $('customer-delete-submit').disabled = !customer || event.target.value.trim().toLowerCase() !== customer.full_name.trim().toLowerCase();
  };
  $('customer-new-appointment').onclick = () => { const ref = $('customer-id').value; closeModal('customer-modal'); openAppointment(null, { customerId: ref }); };
  $('delete-appointment').onclick = cancelAppointment;
  $('block-form').onsubmit = saveBlock;
  $('campaign-form').onsubmit = saveCampaign;
  $('customer-form').onsubmit = saveCustomer;
  $('waitlist-form').onsubmit = saveWaitlist;
  $('payment-form').onsubmit = savePayment;
  $('expense-form').onsubmit = saveExpense;
  $('inventory-form').onsubmit = saveInventory;
  $('contact-form').onsubmit = saveContactLog;
  $('gift-card-form').onsubmit = saveGiftCard;
  $('package-form').onsubmit = savePackage;
  $('task-snooze-form').onsubmit = saveTaskSnooze;
  $('task-snooze-preset').onchange = event => { $('task-snooze-custom-field').hidden = event.target.value !== 'custom'; if (event.target.value === 'custom') $('task-snooze-custom').value = localInput(addDays(new Date(), 7)); };
  $('task-dismiss-form').onsubmit = saveTaskDismiss;
  $('task-dismiss-template').onchange = event => { if (event.target.value && event.target.value !== 'custom') $('task-dismiss-reason').value = event.target.value; else $('task-dismiss-reason').value = ''; };
  $('payment-appointment').onchange = fillPaymentAmount;
  $('payment-method').onchange = fillPaymentBenefits;
  $('customer-rebook-message').onclick = queueCustomerRebooking;
  $('customer-log-contact').onclick = openContactLog;
  $('customer-chat-send').onclick = sendCustomerChat;
  $('customer-chat-photo').onchange = function () { $('customer-chat-filename').textContent = this.files[0]?.name || ''; };
  $('customer-search').oninput = event => { state.customerFilter = event.target.value; renderCustomers(); };
  $('customer-segment').onchange = event => { state.customerSegment = event.target.value; renderCustomers(); };
  document.querySelectorAll('[data-period-mode]').forEach(button => button.onclick = () => {
    const mode = button.dataset.periodMode;
    if (mode === state.period.mode) return;
    // Beim Wechsel Monat -> Jahr bleibt das Jahr, Jahr -> Monat springt auf
    // den aktuellen Monat, wenn es das laufende Jahr ist, sonst auf Januar.
    const year = state.period.start.getFullYear();
    const now = new Date();
    state.period = { mode, start: mode === 'year' ? new Date(year, 0, 1) : (year === now.getFullYear() ? monthStart(now) : new Date(year, 0, 1)) };
    renderOverview();
  });
  $('period-prev').onclick = () => { state.period = { ...state.period, start: addMonths(periodRange().start, state.period.mode === 'year' ? -12 : -1) }; renderOverview(); };
  $('period-next').onclick = () => { state.period = { ...state.period, start: addMonths(periodRange().start, state.period.mode === 'year' ? 12 : 1) }; renderOverview(); };
  $('period-today').onclick = () => { state.period = { mode: state.period.mode, start: state.period.mode === 'year' ? new Date(new Date().getFullYear(), 0, 1) : monthStart(new Date()) }; renderOverview(); };
  $('customer-import').onclick = () => $('customer-import-file').click();
  $('customer-import-file').onchange = event => { const file = event.target.files?.[0]; if (file) importCustomers(file); event.target.value = ''; };
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop.id); }));

  init().catch(error => { console.error(error); $('login-message').textContent = 'Dashboard konnte nicht geladen werden.'; });
})();
