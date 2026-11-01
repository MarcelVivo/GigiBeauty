// PWA: Service Worker registrieren (nur über HTTPS bzw. localhost). Neue
// Versionen übernehmen sofort (skipWaiting im Worker); Seiten laden ihre
// HTML-Inhalte ohnehin immer zuerst aus dem Netz.
(function () {
  // Alte Kopie auf GitHub Pages: auf die Produktionsdomain weiterleiten
  // (gleicher Pfad, ohne /GigiBeauty-Präfix), damit Google und alte Links
  // nur www.gigibeauty.ch kennen.
  if (/\.github\.io$/.test(location.hostname)) {
    var path = location.pathname.replace(/^\/GigiBeauty(?=\/|$)/, '') || '/';
    location.replace('https://www.gigibeauty.ch' + path + location.search + location.hash);
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
  });
})();
