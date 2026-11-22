// Room codes. A new room gets a random 4-letter code, or the room name the host picked: 3 to 12
// letters and digits, case-insensitive (stored uppercase). Spaces in a picked name are dropped
// ("Noahs Place" is NOAHSPLACE); anything else that isn't a letter or digit is refused.

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion with 1/0
const MIN = 3;
const MAX = 12;
// A few words a room shouldn't be called (or randomly get). Not a full filter.
const RUDE = ['FUCK', 'SHIT', 'CUNT', 'NIGGER', 'NIGGA', 'FAGGOT', 'RETARD'];
const rude = (code) => RUDE.some((w) => code.includes(w));

// What someone typed, a link's ?room= or a saved code, as the code to look up: old 4-letter
// codes come out as they always did.
function normalizeCode(x) {
  return String(x ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX);
}

function randomCode(inUse = () => false) {
  let code;
  do {
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  } while (inUse(code) || rude(code));
  return code;
}

// A picked room name: { code } (null when it's blank, for a random one) or { error }.
function checkRoomName(name) {
  if (name == null) return { code: null };
  if (typeof name !== 'string') return { error: 'Room names can only use letters and numbers' };
  const s = name.replace(/\s+/g, '');
  if (!s) return { code: null };
  if (!/^[A-Za-z0-9]+$/.test(s)) return { error: 'Room names can only use letters and numbers' };
  if (s.length < MIN || s.length > MAX) return { error: `Room names are ${MIN} to ${MAX} letters or numbers` };
  const code = s.toUpperCase();
  if (rude(code)) return { error: 'Pick a different room name' };
  return { code };
}

// The code for a new room: { code } or { error }. A blank name gets a random code that `inUse`
// says is free. A picked one must not be a live room's: `isLive` may also look in the room store,
// so it can be async (and `inUse` is asked again after it, in case the room was made meanwhile).
async function pickCode(name, { inUse = () => false, isLive = inUse } = {}) {
  const checked = checkRoomName(name);
  if (checked.error) return checked;
  if (!checked.code) return { code: randomCode(inUse) };
  if ((await isLive(checked.code)) || inUse(checked.code)) return { error: 'That room name is taken, try another' };
  return { code: checked.code };
}

module.exports = { MIN, MAX, normalizeCode, randomCode, checkRoomName, pickCode };
