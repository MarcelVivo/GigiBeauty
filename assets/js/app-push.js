// Push-Benachrichtigungen in der GiGi-Beauty-App (Capacitor). Läuft nur in
// der App, und nur wenn deren User-Agent «push» meldet (Android erst mit
// eingebautem Firebase, sonst stürzt die Registrierung ab). Die Sitzung wird
// direkt aus dem Supabase-Speicher gelesen statt über einen zweiten
// Supabase-Client: zwei Clients würden dasselbe Refresh-Token verbrauchen
// und die Kundin abmelden.
(function () {
  var cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform() || window !== window.top) return;
  if (!/GiGiBeautyApp\S* push\b/.test(navigator.userAgent)) return;
  var config = window.GIGI_SUPABASE || { url: 'https://itathbojgaofnjntbowu.supabase.co' };
  var Push = (cap.Plugins && cap.Plugins.PushNotifications) || cap.registerPlugin('PushNotifications');
  var platform = cap.getPlatform();
  var sessionKey = 'sb-' + new URL(config.url).hostname.split('.')[0] + '-auth-token';
  var doneKey = 'gigi-push-device';
  var pendingToken = null;

  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function write(key, value) { try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch (e) {} }

  function session() {
    var s = read(sessionKey);
    if (!s || !s.access_token || !s.user) return null;
    return s.expires_at && s.expires_at * 1000 < Date.now() + 30000 ? 'expired' : s;
  }

  // Tippen auf die Mitteilung: passende Seite öffnen (nur eigene Domain).
  Push.addListener('pushNotificationActionPerformed', function (event) {
    var url = event && event.notification && event.notification.data && event.notification.data.url;
    if (url && /^https:\/\/(www\.)?gigibeauty\.ch\//.test(url) && url !== location.href) location.href = url;
  });

  Push.addListener('registration', function (result) {
    pendingToken = result.value;
    save();
  });

  function save() {
    var s = session();
    if (!pendingToken || !s || s === 'expired') return;
    var done = read(doneKey);
    var fresh = done && done.token === pendingToken && done.user === s.user.id && Date.now() - done.at < 86400000;
    if (fresh) return;
    fetch(config.url + '/rest/v1/rpc/register_push_device', {
      method: 'POST',
      headers: { apikey: config.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_token: pendingToken, device_platform: platform })
    }).then(function (response) {
      if (response.ok) write(doneKey, { token: pendingToken, user: s.user.id, at: Date.now() });
    }).catch(function () {});
  }

  var asked = false;
  function check() {
    var s = session();
    if (!s) {
      // Abgemeldet: Gerät abmelden, damit keine Mitteilungen fürs alte Konto mehr kommen.
      if (read(doneKey)) { write(doneKey, null); pendingToken = null; asked = false; Push.unregister().catch(function () {}); }
      return;
    }
    if (s === 'expired') return;
    if (pendingToken) return save();
    if (asked) return;
    asked = true;
    Push.requestPermissions().then(function (status) {
      if (status.receive === 'granted') return Push.register();
    }).catch(function () {});
  }

  check();
  window.addEventListener('storage', check);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  setInterval(check, 20000);
})();
