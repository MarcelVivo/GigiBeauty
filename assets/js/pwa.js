// PWA: Service Worker registrieren (nur über HTTPS bzw. localhost). Neue
// Versionen übernehmen sofort (skipWaiting im Worker); Seiten laden ihre
// HTML-Inhalte ohnehin immer zuerst aus dem Netz.
(function () {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
  });
})();
