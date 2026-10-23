// Turn order helpers. A turn order is an array of player ids. Players who are disconnected
// or have left the room are skipped, so a game never stalls waiting on an empty seat.

function isActive(room, id) {
  return room.players.some((p) => p.id === id && p.connected);
}

// Returns the id after `currentId` in `order` (wrapping), skipping inactive players.
// If `currentId` isn't in the order, starts from the beginning.
function next(room, order, currentId) {
  const start = order.indexOf(currentId);
  for (let step = 1; step <= order.length; step++) {
    const id = order[(start + step + order.length) % order.length];
    if (isActive(room, id)) return id;
  }
  return null;
}

// First active player in `order`, or null.
function first(room, order) {
  return order.find((id) => isActive(room, id)) ?? null;
}

module.exports = { isActive, next, first };
