// Usage counts and feedback, written as one JSON line each to the server log. On Cloud Run every
// line lands in Google Cloud Logging, where it can be searched and counted (see README). Nothing
// personal is logged: no names, room codes or addresses, and feedback has only what people type.
//
//   track('game_started', { game: 'kingsCup', players: 4, mode: 'online' })

const text = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// Feedback passes its own `message`, so the log viewer shows the feedback itself as the headline.
function track(event, data = {}, log = console.log) {
  log(JSON.stringify({ severity: event === 'feedback' ? 'NOTICE' : 'INFO', message: `analytics: ${event}`, event, ...data }));
}

// An event a pass-and-play page reported, or null if it isn't one we count.
function cleanEvent(body, gameIds) {
  if (!body || body.event !== 'local_game_started') return null;
  const players = Number(body.players);
  if (!gameIds.includes(body.game) || !Number.isInteger(players) || players < 1 || players > 16) return null;
  return { event: body.event, game: body.game, players, mode: 'pass_and_play' };
}

// Feedback someone typed, or null if it's empty.
function cleanFeedback(body, gameIds) {
  const message = text(body?.message, 1000);
  if (!message) return null;
  const out = { message };
  const contact = text(body.contact, 100);
  if (contact) out.contact = contact;
  if (gameIds.includes(body.game)) out.game = body.game;
  return out;
}

// At most `max` requests per key (an IP) per minute, so a stuck phone or a script can't flood the
// log.
function rateLimiter(max) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < 60 * 1000);
    if (recent.length >= max) return false;
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

module.exports = { track, cleanEvent, cleanFeedback, rateLimiter };
