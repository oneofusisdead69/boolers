// Player looks: an emoji avatar and a colour, shown to everyone next to the player's name, and the
// drink in front of them on the TV's table (none picked: whatever the room's drinking).
// Shared by the server (validating what phones send) and the phones (the picker), so it runs
// as a plain browser script too: there it sets window.LOOKS.

(function (root) {
  const AVATARS = [
    '🦊', '🐸', '🐼', '🐙', '🦄', '🐯', '🐵', '🐧', '🦖', '🐝', '🦉', '🐨',
    '🐷', '🐶', '🐱', '🦁', '🐮', '🐻', '👽', '🤖', '👻', '🎃', '🌵', '🍕',
    '🌮', '🍩', '🍉', '🍄', '⚡', '🔥', '🌈', '💎',
  ];
  const DRINKS = ['🍺', '🍻', '🍷', '🥂', '🍾', '🍸', '🍹', '🥃', '🍶', '🧉', '🧋', '☕', '🍵', '🥤', '🧃', '🥛', '💧', '🧪'];
  const COLORS = ['#ff4d6d', '#ff9142', '#ffcc33', '#3ddc97', '#22c3e6', '#4d7cff', '#9b5cff', '#ff5cc8', '#a1887f', '#9aa0a6'];

  // The look someone asked for, with anything missing or unknown filled in: a colour nobody in
  // `taken` has yet (the first free one, or a random one with randomColor), and a random avatar
  // nobody has yet (where possible).
  function choose(wanted = {}, taken = [], randomColor = false) {
    const pickFree = (list, key) => {
      const free = list.filter((x) => !taken.some((t) => t[key] === x));
      const from = free.length ? free : list;
      return key === 'color' && !randomColor ? from[0] : from[Math.floor(Math.random() * from.length)];
    };
    return {
      avatar: AVATARS.includes(wanted.avatar) ? wanted.avatar : pickFree(AVATARS, 'avatar'),
      color: COLORS.includes(wanted.color) ? wanted.color : pickFree(COLORS, 'color'),
      ...(DRINKS.includes(wanted.drink) ? { drink: wanted.drink } : {}),
    };
  }

  // A fixed look for seat i, for pass and play where nobody picks one.
  const forSeat = (i) => ({ avatar: AVATARS[(i * 7) % AVATARS.length], color: COLORS[i % COLORS.length] });

  const LOOKS = { AVATARS, COLORS, DRINKS, choose, forSeat };
  if (typeof module !== 'undefined' && module.exports) module.exports = LOOKS;
  else root.LOOKS = LOOKS;
})(this);
