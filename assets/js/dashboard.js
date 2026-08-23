(() => {
  'use strict';
  const config = window.GIGI_SUPABASE || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.url || '') && !String(config.anonKey || '').startsWith('YOUR-');
  const db = configured && window.supabase ? window.supabase.createClient(config.url, config.anonKey) : null;
  const state = { user: null, profile: null, settings: null, services: [], profiles: [], customers: [], appointments: [], blocks: [], invoices: [], campaigns: [], payments: [], expenses: [], inventory: [], serviceInventory: [], waitlist: [], tasks: [], communications: [], automations: [], marketingEvents: [], packages: [], giftCards: [], auditLog: [], servicePriceItems: [], siteContentBlocks: [], week: startOfWeek(new Date()), customerFilter: '', customerSegment: 'all', analyticsMonths: 12 };
  const $ = id => document.getElementById(id);
  const panelMeta = {
    overview: ['Guten Tag, Liliane', 'Das Wichtigste auf einen Blick.'],
    calendar: ['Terminkalender', 'Termine eintragen, verschieben und Zeiten sperren.'],
    tasks: ['Smart CRM', 'Die wichtigsten nächsten Schritte, automatisch priorisiert.'],
    customers: ['Kunden', 'Kontaktdaten, Historie und Marketing-Einwilligungen.'],
    waitlist: ['Warteliste', 'Freie Zeitfenster schneller mit passenden Kundinnen besetzen.'],
    invoices: ['Finanzen', 'Einnahmen, Ausgaben, Rechnungen und Profitabilität.'],
    inventory: ['Lager', 'Bestände, Materialkosten und Nachbestellungen.'],
    marketing: ['Marketing', 'Kampagnen für Kundinnen mit Einwilligung erstellen.'],
    content: ['Website-Inhalte', 'Behandlungstexte und Preislisten direkt auf der Website pflegen.']
  };

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
      await db.auth.signOut();
      $('login-message').textContent = adminResult.error ? `Admin-Prüfung fehlgeschlagen: ${adminResult.error.message}` : 'Dieses Konto hat keine Admin-Berechtigung.';
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
  }

  async function loadAll() {
    let results;
    try {
      results = await Promise.race([
        Promise.all([
          db.from('services').select('*').order('sort_order'),
          db.from('business_settings').select('*').maybeSingle(),
          db.from('profiles').select('*').order('full_name'),
          db.from('customers').select('*').order('full_name'),
          db.from('appointments').select('*, services(name, price_chf)').order('starts_at'),
          db.from('blocked_times').select('*').order('starts_at'),
          db.from('invoices').select('*').order('created_at', { ascending: false }),
          db.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
          db.from('payments').select('*, appointments(customer_name, customer_email, starts_at), customers(full_name)').order('paid_at', { ascending: false }),
          db.from('expenses').select('*').order('expense_date', { ascending: false }),
          db.from('inventory_items').select('*').order('name'),
          db.from('service_inventory').select('*'),
          db.from('waitlist_entries').select('*, services(name)').order('priority', { ascending: false }).order('created_at'),
          db.from('crm_tasks').select('*, customers(full_name, email, phone)').order('due_at'),
          db.from('customer_communications').select('*').order('occurred_at', { ascending: false }),
          db.from('automation_rules').select('*').order('name'),
          db.from('marketing_events').select('*').order('occurred_at', { ascending: false }),
          db.from('customer_packages').select('*, customers(full_name), services(name)').order('purchased_at', { ascending: false }),
          db.from('gift_cards').select('*').order('created_at', { ascending: false }),
          db.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(50),
          db.from('service_price_items').select('*').order('sort_order'),
          db.from('site_content_blocks').select('*').order('sort_order')
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Dashboard data timeout')), 20000))
      ]);
    } catch (error) {
      toast('Dashboard-Daten konnten nicht rechtzeitig geladen werden. Bitte Seite neu laden.');
      return;
    }
    const failed = results.find(result => result.error);
    if (failed) return toast(`Daten konnten nicht geladen werden: ${failed.error.message}`);
    state.services = results[0].data || [];
    state.settings = results[1].data || null;
    [state.profiles, state.customers, state.appointments, state.blocks, state.invoices, state.campaigns, state.payments, state.expenses, state.inventory, state.serviceInventory, state.waitlist, state.tasks, state.communications, state.automations, state.marketingEvents, state.packages, state.giftCards, state.auditLog, state.servicePriceItems, state.siteContentBlocks] = results.slice(2).map(result => result.data || []);
    fillServiceSelect();
    renderAll();
  }

  function renderAll() { renderOverview(); renderCalendar(); renderTasks(); renderCustomers(); renderWaitlist(); renderInvoices(); renderInventory(); renderCampaigns(); renderContent(); }

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

  function metricCard(label, value, detail, change = null) {
    return `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><div class="metric-foot"><small>${esc(detail)}</small>${change ? `<em class="trend ${change.className}">${esc(change.text)}</em>` : ''}</div></article>`;
  }

  function monthlyRevenueSeries(months) {
    const first = addMonths(monthStart(new Date()), -(months - 1));
    return Array.from({ length: months }, (_, index) => {
      const start = addMonths(first, index);
      const end = addMonths(start, 1);
      const appointments = state.appointments.filter(a => new Date(a.starts_at) >= start && new Date(a.starts_at) < end);
      return {
        start,
        label: fmt(start, { month: 'short', year: months > 12 ? '2-digit' : undefined }),
        revenue: appointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0),
        completed: appointments.filter(a => a.status === 'completed' && !a.is_private).length
      };
    });
  }

  function revenueChart(series) {
    const width = 760, height = 235, left = 48, right = 12, top = 12, bottom = 32;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const maximum = Math.max(100, ...series.map(item => item.revenue));
    const x = index => left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth);
    const y = value => top + plotHeight - (value / maximum) * plotHeight;
    const points = series.map((item, index) => `${x(index)},${y(item.revenue)}`).join(' ');
    const area = series.length ? `M ${left} ${top + plotHeight} L ${series.map((item, index) => `${x(index)} ${y(item.revenue)}`).join(' L ')} L ${x(series.length - 1)} ${top + plotHeight} Z` : '';
    const labelStep = Math.max(1, Math.ceil(series.length / 7));
    const grid = Array.from({ length: 5 }, (_, index) => {
      const lineY = top + (index / 4) * plotHeight;
      const value = maximum * (1 - index / 4);
      return `<line class="chart-grid-line" x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}"/><text class="chart-axis-label" x="${left - 7}" y="${lineY + 3}" text-anchor="end">${esc(compactMoney(value))}</text>`;
    }).join('');
    const labels = series.map((item, index) => index % labelStep === 0 || index === series.length - 1 ? `<text class="chart-axis-label" x="${x(index)}" y="${height - 8}" text-anchor="middle">${esc(item.label)}</text>` : '').join('');
    const dots = series.map((item, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(item.revenue)}" r="3.5"><title>${esc(item.label)}: ${esc(money(item.revenue))} · ${item.completed} Behandlungen</title></circle>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Umsatzentwicklung">${grid}<defs><linearGradient id="revenue-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6e384c" stop-opacity=".24"/><stop offset="1" stop-color="#6e384c" stop-opacity=".02"/></linearGradient></defs><path d="${area}" fill="url(#revenue-area)"/><polyline points="${points}" fill="none" stroke="#6e384c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  }

  function renderDonut(chartId, legendId, segments, centerValue, centerLabel) {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    let cursor = 0;
    const slices = total ? segments.map(segment => {
      const start = cursor;
      cursor += (segment.value / total) * 100;
      return `${segment.color} ${start}% ${cursor}%`;
    }).join(', ') : '#eee9e3 0 100%';
    const chart = $(chartId);
    chart.style.background = `conic-gradient(${slices})`;
    chart.innerHTML = `<div class="donut-center"><strong>${esc(centerValue)}</strong><span>${esc(centerLabel)}</span></div>`;
    $(legendId).innerHTML = segments.map(segment => `<div class="legend-row"><i class="legend-dot" style="background:${segment.color}"></i><span>${esc(segment.label)}</span><strong>${segment.value}</strong></div>`).join('');
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

  function upcomingBirthday(customer, days = 30) {
    if (!customer.birth_date) return false;
    const now = startOfDay(new Date());
    const birth = new Date(`${customer.birth_date}T12:00:00`);
    let next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
    if (next < now) next.setFullYear(next.getFullYear() + 1);
    return next <= addDays(now, days);
  }

  function renderOverview() {
    const now = new Date();
    const today = dayKey(now);
    const currentMonth = monthStart(now);
    const previousMonth = addMonths(currentMonth, -1);
    const nextMonth = addMonths(currentMonth, 1);
    const periodStart = addMonths(currentMonth, -(state.analyticsMonths - 1));
    const booked = state.appointments.filter(a => a.status === 'booked');
    const todayAppointments = booked.filter(a => dayKey(a.starts_at) === today).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const currentMonthAppointments = state.appointments.filter(a => !a.is_private && a.status !== 'cancelled' && new Date(a.starts_at) >= currentMonth && new Date(a.starts_at) < nextMonth);
    const previousMonthAppointments = state.appointments.filter(a => !a.is_private && a.status !== 'cancelled' && new Date(a.starts_at) >= previousMonth && new Date(a.starts_at) < currentMonth);
    const currentRevenue = currentMonthAppointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
    const previousRevenue = previousMonthAppointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
    const customerAnalytics = state.customers.map(customer => ({ customer, stats: customerStats(customer) }));
    const customersWithHistory = customerAnalytics.filter(item => item.stats.totalBookings > 0);
    const repeatCustomers = customerAnalytics.filter(item => item.stats.totalBookings >= 2).length;
    const reachableCustomers = state.customers.filter(customer => customer.email && customer.marketing_consent).length;
    const customersWithEmail = state.customers.filter(customer => customer.email).length;
    const capacityEnd = addDays(startOfDay(now), 30);
    const capacity = availableSlots(startOfDay(now), capacityEnd);
    const occupied = booked.filter(a => new Date(a.starts_at) >= startOfDay(now) && new Date(a.starts_at) < capacityEnd).length;
    const openInvoices = state.invoices.filter(invoice => ['draft', 'sent'].includes(invoice.status));
    const openInvoiceTotal = openInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_chf || 0), 0);

    $('analytics-period-label').textContent = `Auswertung der letzten ${state.analyticsMonths} Monate`;
    $('metrics').innerHTML = [
      metricCard('Umsatz im Monat', money(currentRevenue), 'abgeschlossene Behandlungen', trend(currentRevenue, previousRevenue)),
      metricCard('Termine im Monat', currentMonthAppointments.length, `${currentMonthAppointments.filter(a => a.status === 'completed').length} abgeschlossen`, trend(currentMonthAppointments.length, previousMonthAppointments.length)),
      metricCard('Auslastung 30 Tage', `${percent(occupied, capacity)}%`, `${occupied} von ${capacity} Zeitfenstern`),
      metricCard('Kundenbindung', `${percent(repeatCustomers, customersWithHistory.length)}%`, `${repeatCustomers} Wiederkehrende`),
      metricCard('Marketing-Reichweite', `${percent(reachableCustomers, customersWithEmail)}%`, `${reachableCustomers} von ${customersWithEmail} per E-Mail`),
      metricCard('Offene Forderungen', money(openInvoiceTotal), `${openInvoices.length} Rechnungen`)
    ].join('');

    const series = monthlyRevenueSeries(state.analyticsMonths);
    const periodRevenue = series.reduce((sum, item) => sum + item.revenue, 0);
    const periodCompleted = series.reduce((sum, item) => sum + item.completed, 0);
    $('revenue-chart').innerHTML = revenueChart(series);
    $('revenue-chart-summary').innerHTML = `<strong>${esc(money(periodRevenue))}</strong><span>${periodCompleted} Behandlungen im Zeitraum</span>`;

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearRevenue = state.appointments.filter(a => new Date(a.starts_at) >= yearStart).reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
    const futurePotential = currentMonthAppointments.filter(a => a.status === 'booked').reduce((sum, a) => sum + Number(a.services?.price_chf || 0), 0);
    const averageTicket = periodCompleted ? periodRevenue / periodCompleted : 0;
    const paidInvoices = state.invoices.filter(invoice => invoice.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.amount_chf || 0), 0);
    $('finance-summary').innerHTML = [
      ['Umsatz laufendes Jahr', money(yearRevenue), ''],
      ['Ø Behandlung', money(averageTicket), ''],
      ['Gebuchtes Potenzial Monat', money(futurePotential), ''],
      ['Bezahlte No-Show-Rechnungen', money(paidInvoices), ''],
      ['Noch ausstehend', money(openInvoiceTotal), openInvoiceTotal ? 'is-warning' : '']
    ].map(([label, value, className]) => `<div class="finance-row ${className}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

    const periodAppointments = state.appointments.filter(a => new Date(a.starts_at) >= periodStart && new Date(a.starts_at) <= now && !a.is_private);
    const serviceRows = state.services.map(service => {
      const appointments = periodAppointments.filter(a => a.service_id === service.id && a.status === 'completed');
      const revenue = appointments.reduce((sum, appointment) => sum + appointmentRevenue(appointment), 0);
      return { name: service.name, count: appointments.length, revenue, margin: revenue - appointments.length * Number(service.material_cost_chf || 0) };
    }).sort((a, b) => b.revenue - a.revenue || b.count - a.count).slice(0, 6);
    const serviceMaximum = Math.max(1, ...serviceRows.map(row => row.revenue || row.count));
    $('service-performance').innerHTML = serviceRows.length ? serviceRows.map(row => `<div class="bar-row"><div class="bar-row-head"><span>${esc(row.name)}</span><strong>${esc(money(row.revenue))} · DB ${esc(money(row.margin))} · ${row.count}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, ((row.revenue || row.count) / serviceMaximum) * 100)}%"></div></div></div>`).join('') : '<div class="empty">Noch keine Behandlungsdaten.</div>';

    const retentionSegments = [
      { label: 'VIP (10+)', value: customerAnalytics.filter(item => item.stats.segment.key === 'vip').length, color: '#c7973f' },
      { label: 'Stammkundinnen', value: customerAnalytics.filter(item => item.stats.segment.key === 'loyal').length, color: '#6e384c' },
      { label: 'Wiederkehrend', value: customerAnalytics.filter(item => item.stats.segment.key === 'repeat').length, color: '#4f8273' },
      { label: 'Neu / Kontakt', value: customerAnalytics.filter(item => ['new', 'lead'].includes(item.stats.segment.key)).length, color: '#9aa7b8' }
    ];
    renderDonut('retention-chart', 'retention-legend', retentionSegments, state.customers.length, 'Kundinnen');

    const statusSegments = [
      { label: 'Abgeschlossen', value: periodAppointments.filter(a => a.status === 'completed').length, color: '#4f8273' },
      { label: 'Gebucht', value: periodAppointments.filter(a => a.status === 'booked').length, color: '#6d83a1' },
      { label: 'Storniert', value: periodAppointments.filter(a => a.status === 'cancelled').length, color: '#afa59e' },
      { label: 'No-Show', value: periodAppointments.filter(a => a.status === 'no_show').length, color: '#a65353' }
    ];
    const completedOrLost = statusSegments.reduce((sum, item) => sum + item.value, 0);
    renderDonut('appointment-status-chart', 'appointment-status-legend', statusSegments, `${percent(statusSegments[0].value, completedOrLost)}%`, 'Abschlussquote');

    const ranking = [...customerAnalytics].sort((a, b) => b.stats.totalBookings - a.stats.totalBookings || b.stats.revenue - a.stats.revenue).slice(0, 7);
    $('customer-ranking').innerHTML = ranking.length ? ranking.map((item, index) => `<button class="ranking-row" type="button" data-open-customer="${item.customer.id}"><span class="rank-number">${index + 1}</span><span class="ranking-customer"><strong>${esc(item.customer.full_name)}</strong><span>${esc(item.customer.email || item.customer.phone || 'Kontakt ergänzen')}</span></span><span class="ranking-stat"><small>Status</small><span class="segment segment-${item.stats.segment.key}">${esc(item.stats.segment.label)}</span></span><span class="ranking-stat"><small>Termine</small><strong>${item.stats.totalBookings}</strong></span><span class="ranking-stat"><small>Umsatz erfasst</small><strong>${esc(money(item.stats.revenue))}</strong></span></button>`).join('') : '<div class="empty">Noch keine Kundendaten.</div>';

    const missingEmail = state.customers.filter(customer => !customer.email).length;
    const missingPhone = state.customers.filter(customer => !customer.phone).length;
    const birthdays = state.customers.filter(customer => upcomingBirthday(customer)).length;
    const inactive = customerAnalytics.filter(item => item.stats.last && new Date(item.stats.last) < addDays(now, -180) && !item.stats.next).length;
    $('customer-opportunities').innerHTML = [
      ['@', 'E-Mail ergänzen', 'Für Login, Bestätigung und Erinnerung', missingEmail],
      ['☎', 'Telefon ergänzen', 'Für Rückfragen und Profilabgleich', missingPhone],
      ['✦', 'Geburtstage in 30 Tagen', 'Persönliche Nachricht vorbereiten', birthdays],
      ['↻', 'Reaktivierung', 'Seit über 180 Tagen ohne Besuch', inactive]
    ].map(([icon, title, detail, value]) => `<div class="opportunity"><span class="opportunity-icon">${icon}</span><span><strong>${esc(title)}</strong><span>${esc(detail)}</span></span><b>${value}</b></div>`).join('');

    const newCustomers = state.customers.filter(customer => new Date(customer.created_at) >= periodStart).length;
    const funnelRows = [
      ['Alle Kontakte', state.customers.length],
      ['Mit E-Mail erreichbar', customersWithEmail],
      ['Marketing-Einwilligung', reachableCustomers],
      [`Neu in ${state.analyticsMonths} Monaten`, newCustomers]
    ];
    $('marketing-funnel').innerHTML = funnelRows.map(([label, value]) => `<div class="funnel-row"><div class="funnel-fill" style="width:${percent(value, state.customers.length)}%"></div><div class="funnel-copy"><span>${esc(label)}</span><strong>${value}</strong></div></div>`).join('');

    const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].map((label, day) => ({ label, day, value: periodAppointments.filter(a => a.status !== 'cancelled' && new Date(a.starts_at).getDay() === day).length }));
    const orderedWeekdays = [...weekdays.slice(1), weekdays[0]];
    const weekdayMaximum = Math.max(1, ...orderedWeekdays.map(item => item.value));
    $('weekday-chart').innerHTML = orderedWeekdays.map(item => `<div class="weekday-column"><div class="weekday-bar-wrap"><div class="weekday-bar" style="height:${Math.max(3, (item.value / weekdayMaximum) * 100)}%"></div></div><strong>${esc(item.label)}</strong><span>${item.value}</span></div>`).join('');

    const upcoming = booked.filter(a => new Date(a.starts_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 7);
    $('upcoming').innerHTML = upcoming.length ? upcoming.map(a => `<button class="upcoming-item" type="button" data-edit-appointment="${a.id}" style="width:100%;background:transparent;text-align:left;cursor:pointer"><span class="upcoming-time">${fmt(a.starts_at, { hour: '2-digit', minute: '2-digit' })}</span><span><strong>${esc(a.customer_name)}</strong><small>${esc(a.services?.name || 'Privat')} · ${fmt(a.starts_at, { weekday: 'short', day: '2-digit', month: '2-digit' })}</small></span>${statusPill(a.status)}</button>`).join('') : '<div class="empty">Keine kommenden Termine.</div>';
    const todaySlots = availableSlots(startOfDay(now), addDays(startOfDay(now), 1));
    $('today-capacity').textContent = `${todayAppointments.length} von ${todaySlots} verfügbaren Zeitfenstern belegt`;
    $('today-summary').innerHTML = todayAppointments.length ? todayAppointments.map(a => `<button class="today-item" type="button" data-edit-appointment="${a.id}"><time>${fmt(a.starts_at, { hour: '2-digit', minute: '2-digit' })}–${fmt(a.ends_at, { hour: '2-digit', minute: '2-digit' })}</time><strong>${esc(a.customer_name)}</strong><span>${esc(a.services?.name || 'Privat')}</span></button>`).join('') : '<div class="empty">Heute sind keine Termine eingetragen.</div>';

    const openTasks = actionableTasks(now);
    const urgentTasks = openTasks.filter(task => ['urgent', 'high'].includes(task.priority)).length;
    const expectedToday = todayAppointments.reduce((sum, appointment) => sum + Number(appointment.amount_chf ?? appointment.services?.price_chf ?? 0), 0);
    const freeToday = Math.max(0, todaySlots - todayAppointments.length);
    $('daily-brief-title').textContent = `${todayAppointments.length} Termine · ${money(expectedToday)} Potenzial · ${freeToday} freie Zeitfenster`;
    $('daily-brief-copy').textContent = urgentTasks ? `${urgentTasks} wichtige CRM-Aufgaben warten auf Bearbeitung. Die Warteliste enthält ${state.waitlist.filter(item => item.status === 'open').length} offene Wünsche.` : `Keine dringenden CRM-Aufgaben. Die Warteliste enthält ${state.waitlist.filter(item => item.status === 'open').length} offene Wünsche.`;
    $('daily-brief-actions').innerHTML = `<button class="brief-button" type="button" data-go="tasks"><strong>${openTasks.length}</strong><span>CRM-Aufgaben</span></button><button class="brief-button" type="button" data-go="waitlist"><strong>${state.waitlist.filter(item => item.status === 'open').length}</strong><span>Warteliste</span></button><button class="brief-button" type="button" data-go="invoices"><strong>${openInvoices.length}</strong><span>Forderungen</span></button>`;

    document.querySelectorAll('[data-edit-appointment]').forEach(button => button.onclick = () => openAppointment(button.dataset.editAppointment));
    document.querySelectorAll('[data-open-customer]').forEach(button => button.onclick = () => openCustomer(button.dataset.openCustomer));
    document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => showPanel(button.dataset.go));
  }

  function renderCalendar() {
    const end = addDays(state.week, 6);
    $('week-title').textContent = `${fmt(state.week, { day: '2-digit', month: 'short' })} bis ${fmt(end, { day: '2-digit', month: 'short', year: 'numeric' })}`;
    $('admin-calendar').innerHTML = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(state.week, index);
      const key = dayKey(date);
      const events = state.appointments.filter(a => dayKey(a.starts_at) === key && a.status !== 'cancelled').map(a => ({ ...a, type: 'appointment' }));
      const blocks = state.blocks.filter(b => dayKey(b.starts_at) === key).map(b => ({ ...b, type: 'block' }));
      return `<section class="admin-day"><div class="admin-day-head"><strong>${fmt(date, { weekday: 'short' })}</strong><span>${fmt(date, { day: '2-digit', month: '2-digit' })}</span></div>
        ${[...events, ...blocks].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).map(event => event.type === 'block' ? `
          <button class="calendar-event is-block" type="button" data-delete-block="${event.id}"><time>${fmt(event.starts_at, { hour: '2-digit', minute: '2-digit' })}–${fmt(event.ends_at, { hour: '2-digit', minute: '2-digit' })}</time><strong>Gesperrt</strong><small>${esc(event.reason)}</small></button>` : `
          <button class="calendar-event${event.is_private ? ' is-private' : ''}" type="button" data-edit-appointment="${event.id}"><time>${fmt(event.starts_at, { hour: '2-digit', minute: '2-digit' })}–${fmt(event.ends_at, { hour: '2-digit', minute: '2-digit' })}</time><strong>${esc(event.customer_name)}</strong><small>${esc(event.services?.name || 'Privat')}</small></button>`).join('')}
      </section>`;
    }).join('');
    document.querySelectorAll('[data-edit-appointment]').forEach(button => button.onclick = () => openAppointment(button.dataset.editAppointment));
    document.querySelectorAll('[data-delete-block]').forEach(button => button.onclick = () => removeBlock(button.dataset.deleteBlock));
  }

  function taskTypeLabel(type) {
    return ({ registration_invite: 'Kundenlogin', missing_email: 'Datenpflege', rebooking: 'Wiederbuchung', winback: 'Reaktivierung', birthday: 'Geburtstag', low_stock: 'Lager', waitlist: 'Warteliste' })[type] || 'CRM';
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
    $('audit-table').innerHTML = state.auditLog.length ? state.auditLog.slice(0, 25).map(entry => `<tr><td>${esc(fmt(entry.changed_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td><td>${esc(({ customers: 'Kundenprofil', appointments: 'Termin', payments: 'Zahlung', expenses: 'Ausgabe', inventory_items: 'Lagerprodukt', waitlist_entries: 'Warteliste', services: 'Website-Inhalt', service_price_items: 'Preisposition', site_content_blocks: 'Website-Text' })[entry.table_name] || entry.table_name)}</td><td>${esc(({ insert: 'Erstellt', update: 'Geändert', delete: 'Gelöscht' })[entry.action] || entry.action)}</td><td><span class="muted">${esc(entry.record_id || '–')}</span></td></tr>`).join('') : '<tr><td colspan="4" class="empty">Noch keine Änderungen protokolliert.</td></tr>';
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
    return { items, validItems, legacyBookings, totalBookings, revenue, last: past[0]?.starts_at || null, next: upcoming[0]?.starts_at || null, completed: items.filter(a => a.status === 'completed').length, noShows: items.filter(a => a.status === 'no_show').length, segment };
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
      const last = stats.last ? fmt(stats.last, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
      const next = stats.next ? fmt(stats.next, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
      const contactPermission = p.do_not_contact ? '<span class="contact-state is-blocked">Nicht kontaktieren</span>' : p.marketing_consent && p.email ? '<span class="contact-state is-active">✓ E-Mail erlaubt</span>' : p.marketing_consent ? '<span class="contact-state">Einwilligung · E-Mail fehlt</span>' : '<span class="contact-state">Nur Servicekontakt</span>';
      return `<tr data-edit-customer="${p.id}" class="customer-row"><td><strong class="customer-name">${esc(p.full_name)}</strong><span class="customer-contact">${esc(p.email || 'Keine E-Mail')}</span><span class="customer-contact">${esc(p.phone || 'Keine Telefonnummer')}</span></td><td><div class="customer-states"><span class="segment segment-${stats.segment.key}">${esc(stats.segment.label)}</span>${p.profile_id ? '<span class="login-state is-active">✓ Login aktiv</span>' : '<span class="login-state">Login einladen</span>'}</div>${p.registration_invited_at ? `<span class="customer-meta">Eingeladen ${esc(fmt(p.registration_invited_at, { day: '2-digit', month: '2-digit' }))} · ${esc((p.registration_invite_channel || '').toUpperCase())}</span>` : ''}</td><td><strong>${stats.totalBookings}</strong><span class="customer-meta">${stats.completed} abgeschlossen</span></td><td><strong>${esc(money(stats.revenue))}</strong></td><td><span class="appointment-pair"><small>Letzter</small><strong>${esc(last)}</strong></span><span class="appointment-pair"><small>Nächster</small><strong>${esc(next)}</strong></span></td><td>${contactPermission}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">Keine Kunden gefunden.</td></tr>';
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
    openModal('waitlist-modal');
  }

  async function saveWaitlist(event) {
    event.preventDefault();
    const email = $('waitlist-email').value.trim().toLowerCase() || null;
    const phone = $('waitlist-phone').value.trim() || null;
    const customer = state.customers.find(item => (email && item.email?.toLowerCase() === email) || (phone && item.phone === phone));
    const payload = { customer_id: customer?.id || null, service_id: $('waitlist-service').value || null, customer_name: $('waitlist-name').value.trim(), email, phone, preferred_from: $('waitlist-from').value ? new Date($('waitlist-from').value).toISOString() : null, preferred_until: $('waitlist-until').value ? new Date($('waitlist-until').value).toISOString() : null, flexible: $('waitlist-flexible').checked, priority: Number($('waitlist-priority').value), notes: $('waitlist-notes').value.trim() || null, created_by: state.user.id };
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
      <td><select data-invoice-status="${invoice.id}"><option value="draft" ${invoice.status === 'draft' ? 'selected' : ''}>Entwurf</option><option value="sent" ${invoice.status === 'sent' ? 'selected' : ''}>Gesendet</option><option value="paid" ${invoice.status === 'paid' ? 'selected' : ''}>Bezahlt</option><option value="void" ${invoice.status === 'void' ? 'selected' : ''}>Storniert</option></select></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Noch keine Rechnungen.</td></tr>';
    document.querySelectorAll('[data-invoice-status]').forEach(select => select.onchange = () => updateInvoice(select.dataset.invoiceStatus, select.value));
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
    const consent = state.customers.filter(p => p.marketing_consent && p.email).length;
    $('marketing-audience').textContent = `${consent} Kundinnen haben dem Marketingversand zugestimmt.`;
    const sent = state.communications.filter(item => item.status === 'sent' && item.channel === 'email').length;
    const clicks = state.marketingEvents.filter(event => event.event_type === 'clicked').length;
    const attributedBookings = state.marketingEvents.filter(event => event.event_type === 'booked').length;
    const attributedRevenue = state.marketingEvents.filter(event => event.event_type === 'revenue').reduce((sum, event) => sum + Number(event.revenue_chf || 0), 0);
    $('marketing-live-metrics').innerHTML = [metricCard('Zielgruppe', consent, 'mit Einwilligung + E-Mail'), metricCard('E-Mails gesendet', sent, 'Journeys und Kampagnen'), metricCard('Klicks', clicks, 'gemessene Reaktionen'), metricCard('Buchungen', attributedBookings, 'Marketing zugeordnet'), metricCard('Kampagnenumsatz', money(attributedRevenue), 'direkt zugeordnet')].join('');
    $('automation-rules').innerHTML = state.automations.length ? state.automations.map(rule => `<article class="automation-card ${rule.active ? 'is-active' : ''}"><div class="automation-icon">${rule.active ? '●' : '○'}</div><div><h3>${esc(rule.name)}</h3><p>${esc(rule.description || '')}</p><span>${rule.requires_marketing_consent ? 'Nur mit Einwilligung' : 'Transaktional'}${rule.delay_hours ? ` · nach ${rule.delay_hours} Std.` : ''}</span></div><label class="switch"><input type="checkbox" data-toggle-automation="${rule.id}" ${rule.active ? 'checked' : ''}><i></i></label></article>`).join('') : '<div class="empty">Automationen werden nach der Datenbank-Erweiterung angezeigt.</div>';
    $('campaign-table').innerHTML = state.campaigns.length ? state.campaigns.map(c => { const events = state.marketingEvents.filter(event => event.campaign_id === c.id); const revenue = events.filter(event => event.event_type === 'revenue').reduce((sum, event) => sum + Number(event.revenue_chf || 0), 0); return `<tr><td><strong>${esc(c.title)}</strong><br><span class="muted">${events.filter(event => event.event_type === 'clicked').length} Klicks · ${events.filter(event => event.event_type === 'booked').length} Buchungen · ${esc(money(revenue))}</span></td><td>${esc(c.subject)}</td><td>${c.scheduled_at ? fmt(c.scheduled_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'}</td><td>${statusPill(c.status)}</td><td>${!c.queued_at && (c.status === 'draft' || c.status === 'scheduled') ? `<button class="link-button" data-send-campaign="${c.id}">Versand einplanen</button>` : ''}</td></tr>`; }).join('') : '<tr><td colspan="5" class="empty">Noch keine Kampagnen.</td></tr>';
    document.querySelectorAll('[data-send-campaign]').forEach(button => button.onclick = () => queueCampaign(button.dataset.sendCampaign));
    document.querySelectorAll('[data-toggle-automation]').forEach(input => input.onchange = () => toggleAutomation(input.dataset.toggleAutomation, input.checked));
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
        <div class="table-wrap embedded">
          <table>
            <thead><tr><th>Position</th><th>Preis (CHF)</th><th>Oder Text (z. B. „demnächst“)</th><th></th></tr></thead>
            <tbody>
              ${activeItems.map(item => `<tr data-price-item="${item.id}">
                <td><input class="table-input table-input-wide" type="text" value="${esc(item.name)}" data-field="name"></td>
                <td><input class="table-input" type="number" min="0" step="0.05" value="${item.price_chf ?? ''}" data-field="price_chf"></td>
                <td><input class="table-input table-input-wide" type="text" value="${esc(item.price_label || '')}" data-field="price_label"></td>
                <td><button class="link-button" type="button" data-save-price-item="${item.id}">Speichern</button> <button class="link-button" type="button" data-delete-price-item="${item.id}">Entfernen</button></td>
              </tr>`).join('') || '<tr><td colspan="4" class="empty">Noch keine Positionen.</td></tr>'}
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
    container.querySelectorAll('[data-save-price-item]').forEach(button => button.onclick = () => savePriceItem(button.dataset.savePriceItem));
    container.querySelectorAll('[data-delete-price-item]').forEach(button => button.onclick = () => deletePriceItem(button.dataset.deletePriceItem));
    container.querySelectorAll('[data-restore-price-item]').forEach(button => button.onclick = () => restorePriceItem(button.dataset.restorePriceItem));
    container.querySelectorAll('[data-add-price-item]').forEach(button => button.onclick = () => addPriceItem(button.dataset.addPriceItem));

    renderContentBlocks();
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

  async function savePriceItem(itemId) {
    const row = document.querySelector(`tr[data-price-item="${itemId}"]`);
    const name = row.querySelector('[data-field="name"]').value.trim();
    const priceRaw = row.querySelector('[data-field="price_chf"]').value.trim();
    const label = row.querySelector('[data-field="price_label"]').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben.');
    const price_chf = priceRaw === '' ? null : Number(priceRaw);
    if (price_chf !== null && Number.isNaN(price_chf)) return toast('Ungültiger Preis.');
    if (price_chf === null && !label) return toast('Bitte einen Preis oder einen Text angeben.');
    const { error } = await db.from('service_price_items').update({ name, price_chf, price_label: price_chf === null ? label : null }).eq('id', itemId);
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

  function fillServiceSelect() {
    const options = state.services.filter(service => service.active).map(service => `<option value="${service.id}">${esc(service.name)}</option>`).join('');
    $('appointment-service').innerHTML = options;
    $('waitlist-service').innerHTML = `<option value="">Alle Behandlungen</option>${options}`;
    $('customer-preferred-service').innerHTML = `<option value="">Nicht festgelegt</option>${options}`;
  }

  function openAppointment(id = null) {
    const item = id ? state.appointments.find(a => a.id === id) : null;
    $('appointment-modal-title').textContent = item ? 'Termin bearbeiten' : 'Termin eintragen';
    $('appointment-id').value = item?.id || '';
    $('appointment-kind').value = item?.is_private ? 'private' : 'customer';
    $('appointment-service').value = item?.service_id || state.services[0]?.id || '';
    $('appointment-start').value = localInput(item?.starts_at || nextRoundedSlot());
    $('appointment-status').value = item?.status || 'booked';
    $('appointment-name').value = item?.customer_name || '';
    $('appointment-email').value = item?.customer_email || '';
    $('appointment-phone').value = item?.customer_phone || '';
    $('appointment-notes').value = item?.notes || '';
    $('delete-appointment').hidden = !item || item.status === 'cancelled';
    $('appointment-message').textContent = '';
    togglePrivateFields();
    openModal('appointment-modal');
  }

  function nextRoundedSlot() { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() < 30 ? 30 : 0); if (d.getMinutes() === 0) d.setHours(d.getHours() + 1); return d; }
  function togglePrivateFields() {
    const privateEntry = $('appointment-kind').value === 'private';
    $('appointment-service').disabled = privateEntry;
    $('appointment-email').disabled = privateEntry;
    $('appointment-phone').disabled = privateEntry;
    if (privateEntry && !$('appointment-name').value) $('appointment-name').value = 'Privat, Liliane';
  }

  async function saveAppointment(event) {
    event.preventDefault();
    const id = $('appointment-id').value;
    const start = new Date($('appointment-start').value);
    const privateEntry = $('appointment-kind').value === 'private';
    const payload = {
      service_id: privateEntry ? null : $('appointment-service').value,
      customer_name: $('appointment-name').value.trim(),
      customer_email: privateEntry ? null : $('appointment-email').value.trim() || null,
      customer_phone: privateEntry ? null : $('appointment-phone').value.trim() || null,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 90 * 60000).toISOString(),
      status: $('appointment-status').value,
      is_private: privateEntry,
      notes: $('appointment-notes').value.trim() || null,
      created_by: state.user.id
    };
    const result = id ? await db.from('appointments').update(payload).eq('id', id) : await db.from('appointments').insert(payload);
    if (result.error) { $('appointment-message').textContent = result.error.message; return; }
    closeModal('appointment-modal'); toast(id ? 'Termin aktualisiert.' : 'Termin eingetragen.'); await loadAll();
  }

  async function cancelAppointment() {
    const id = $('appointment-id').value;
    if (!id || !confirm('Diesen Termin wirklich stornieren? Der Verlauf bleibt erhalten.')) return;
    const { error } = await db.from('appointments').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id);
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
    const { error } = await db.from('marketing_campaigns').insert({ title: $('campaign-title').value.trim(), subject: $('campaign-subject').value.trim(), content: $('campaign-content').value.trim(), scheduled_at: scheduled, status: scheduled ? 'scheduled' : 'draft', created_by: state.user.id });
    if (error) return $('campaign-message').textContent = error.message;
    closeModal('campaign-modal'); $('campaign-form').reset(); toast('Kampagne gespeichert.'); await loadAll();
  }

  async function queueCampaign(id) {
    if (!confirm('Kampagne an alle Kundinnen mit Marketing-Einwilligung einplanen?')) return;
    const { data, error } = await db.rpc('queue_marketing_campaign', { requested_campaign_id: id });
    if (error) return toast(error.message);
    toast(`${data} E-Mails wurden für den Versand eingeplant.`); await loadAll();
  }

  function openCustomer(id) {
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
      ['Nächster Termin', stats.next ? esc(fmt(stats.next, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : 'Keiner']
    ].map(([label, value]) => `<div class="customer-insight"><span>${esc(label)}</span><strong>${value}</strong></div>`).join('');
    $('customer-registration').hidden = Boolean(customer.profile_id);
    $('customer-registration-title').textContent = customer.registration_invited_at ? 'Registrierung noch ausstehend' : 'Noch kein Kundenlogin';
    $('customer-registration-copy').textContent = customer.registration_invited_at
      ? `Letzte Einladung: ${fmt(customer.registration_invited_at, { day: '2-digit', month: '2-digit', year: 'numeric' })} per ${(customer.registration_invite_channel || 'Kontaktkanal').toUpperCase()}. Beim Signup wird dieses CRM-Profil automatisch verknüpft.`
      : 'Einladung über einen vorhandenen Kontaktkanal senden. Die Kundin registriert sich mit E-Mail und ihrer hinterlegten Telefonnummer.';
    $('customer-registration-actions').innerHTML = registrationActionButtons(customer);
    bindRegistrationActions($('customer-registration-actions'));
    const history = [...stats.items].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 8);
    $('customer-history').innerHTML = `<h3>Terminverlauf</h3>${stats.legacyBookings ? `<p class="muted">${stats.legacyBookings} historische Buchungen aus dem Kundenimport. Dafür liegen keine einzelnen Termin- oder Preisdaten vor.</p>` : ''}${history.length ? `<div class="history-list">${history.map(appointment => `<div class="history-item"><span>${esc(fmt(appointment.starts_at, { day: '2-digit', month: '2-digit', year: 'numeric' }))} · ${esc(appointment.services?.name || 'Behandlung')}</span><strong>${esc(labelStatus(appointment.status))}${appointment.status === 'completed' ? ` · ${esc(money(appointment.amount_chf ?? appointment.services?.price_chf ?? 0))}` : ''}</strong></div>`).join('')}</div>` : '<p class="muted">Noch keine einzelnen Termine im neuen Kalender erfasst.</p>'}`;
    const communications = state.communications.filter(item => item.customer_id === customer.id).slice(0, 8);
    $('customer-communications').innerHTML = `<h3>Kommunikation</h3>${communications.length ? `<div class="communication-list">${communications.map(item => `<div class="communication-item"><span class="communication-channel">${esc(({ email: 'E-Mail', phone: 'Telefon', sms: 'SMS', whatsapp: 'WhatsApp', in_person: 'Persönlich', system: 'System' })[item.channel] || item.channel)}</span><span><strong>${esc(item.subject || item.communication_type)}</strong><small>${esc(fmt(item.occurred_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} · ${esc(item.status)}</small></span></div>`).join('')}</div>` : '<p class="muted">Noch keine Kommunikation protokolliert.</p>'}`;
    $('customer-rebook-message').disabled = !customer.email || !customer.marketing_consent || customer.do_not_contact;
    const matches = customer.phone ? state.customers.filter(item => item.id !== customer.id && phoneKey(item.phone) && phoneKey(item.phone) === phoneKey(customer.phone)) : [];
    $('customer-merge-suggestions').hidden = !matches.length;
    $('customer-merge-suggestions').innerHTML = matches.length ? `<strong>Mögliche Doppelprofile gefunden</strong><p>Die Telefonnummer ist identisch. Bitte nur zusammenführen, wenn es wirklich dieselbe Person ist.</p>${matches.map(item => `<div><span>${esc(item.full_name)} · ${esc(item.email || 'ohne E-Mail')}</span><button class="secondary small" type="button" data-merge-customer="${item.id}">Zusammenführen</button></div>`).join('')}` : '';
    document.querySelectorAll('[data-merge-customer]').forEach(button => button.onclick = () => mergeCustomerProfiles(customer.id, button.dataset.mergeCustomer));
    $('customer-message').textContent = '';
    openModal('customer-modal');
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
    closeModal('customer-modal'); toast('Kundenprofile wurden zusammengeführt.'); await loadAll(); openCustomer(data || primary.id);
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

    const records = [...recordsByKey.values()];
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
  $('week-prev').onclick = () => { state.week = addDays(state.week, -7); renderCalendar(); };
  $('week-next').onclick = () => { state.week = addDays(state.week, 7); renderCalendar(); };
  $('week-today').onclick = () => { state.week = startOfWeek(new Date()); renderCalendar(); };
  $('appointment-kind').onchange = togglePrivateFields;
  $('appointment-form').onsubmit = saveAppointment;
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
  $('customer-search').oninput = event => { state.customerFilter = event.target.value; renderCustomers(); };
  $('customer-segment').onchange = event => { state.customerSegment = event.target.value; renderCustomers(); };
  $('analytics-period').onchange = event => { state.analyticsMonths = Number(event.target.value) || 12; renderOverview(); };
  $('customer-import').onclick = () => $('customer-import-file').click();
  $('customer-import-file').onchange = event => { const file = event.target.files?.[0]; if (file) importCustomers(file); event.target.value = ''; };
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop.id); }));

  init().catch(error => { console.error(error); $('login-message').textContent = 'Dashboard konnte nicht geladen werden.'; });
})();
