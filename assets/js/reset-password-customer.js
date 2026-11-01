(() => {
  'use strict';
  const config = window.GIGI_SUPABASE || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.url || '') && !String(config.anonKey || '').startsWith('YOUR-');
  const db = configured && window.supabase ? window.supabase.createClient(config.url, config.anonKey) : null;
  const $ = id => document.getElementById(id);
  const form = $('reset-form');
  const message = $('reset-message');

  if (!db) { message.textContent = 'Supabase ist noch nicht konfiguriert.'; return; }

  let recoveryReady = false;
  db.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') recoveryReady = true; });

  db.auth.getSession().then(({ data }) => {
    if (data.session) recoveryReady = true;
    else message.textContent = 'Dieser Link ist ungültig oder abgelaufen. Bitte auf der Buchungsseite erneut „Passwort vergessen?" anfordern.';
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('reset-password').value;
    const confirm = $('reset-password-confirm').value;
    if (password.length < 8) { message.textContent = 'Das Passwort muss mindestens 8 Zeichen haben.'; return; }
    if (password !== confirm) { message.textContent = 'Die Passwörter stimmen nicht überein.'; return; }
    if (!recoveryReady) { message.textContent = 'Dieser Link ist ungültig oder abgelaufen. Bitte auf der Buchungsseite erneut „Passwort vergessen?" anfordern.'; return; }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    message.className = 'form-message';
    message.textContent = 'Passwort wird gespeichert.';
    const { error } = await db.auth.updateUser({ password });
    submit.disabled = false;
    if (error) {
      const text = String(error.message || '').toLowerCase();
      message.textContent = error.code === 'same_password' || text.includes('should be different') ? 'Das neue Passwort muss sich vom bisherigen unterscheiden.'
        : error.code === 'weak_password' || text.includes('password should be') ? 'Das Passwort ist zu schwach. Bitte mindestens 8 Zeichen mit Buchstaben und Zahlen verwenden.'
        : text.includes('expired') || text.includes('invalid') ? 'Dieser Link ist ungültig oder abgelaufen. Bitte erneut «Passwort vergessen?» anfordern.'
        : error.message;
      return;
    }
    message.className = 'form-message success';
    message.textContent = 'Passwort gespeichert. Du kannst dich jetzt anmelden.';
    await db.auth.signOut();
    setTimeout(() => { location.href = './booking.html'; }, 2000);
  });
})();
