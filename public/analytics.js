// Usage analytics, loaded by every page.
//
// Visitors: Cloudflare Web Analytics (no cookies, nothing personal). Paste the site token from
// Cloudflare → Analytics & Logs → Web Analytics into TOKEN; left empty, nothing is loaded.
//
// Games: multiplayer games are counted by the server. Pass-and-play games run only on the phone,
// so these pages report them with Analytics.event(), which the server logs the same way.
// Nothing is sent from a local copy (localhost or your Wi-Fi), so testing doesn't count.
(() => {
  const TOKEN = '';

  const host = location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host) || host.endsWith('.local');

  if (TOKEN && !local) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.dataset.cfBeacon = JSON.stringify({ token: TOKEN });
    document.head.appendChild(s);
  }

  window.Analytics = {
    // e.g. Analytics.event('local_game_started', { game: 'kingsCup', players: 4 })
    event(event, data = {}) {
      if (local) return;
      try {
        const body = new Blob([JSON.stringify({ event, ...data })], { type: 'application/json' });
        navigator.sendBeacon('/api/event', body);
      } catch {}
    },
  };
})();
