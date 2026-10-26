// Room styles: the host dresses the room up as a dive bar, a tavern, a club… and every phone in
// the room (and the TV) takes on its colours, background, heading font and table.
//
// Shared by the server (which styles are allowed) and the browser, where it sets window.ROOM_STYLES
// and ROOM_STYLES.apply(id) restyles the page (null or 'classic' for the normal look). This is each
// look's name, colours and font; its art (the background and the table) is in lib/roomArt.js, which
// the server turns into one stylesheet a look (see server.js): a phone only downloads the look it's
// showing, not the half a megabyte of drawings behind every look.

(function (root) {
  // The Highlands pub: an old tavern up in the hills, in whatever the weather is doing outside.
  // (It began as St Patrick's, a seasonal style; the id stays 'stpatricks' so saved rooms keep it.)
  const highland = (weather) => ({
      label: 'Highlands pub',
      emoji: '🏔️',
      welcome: { clear: 'Sláinte! Pull up a stool by the peat fire.', rain: 'Rain’s on. Nobody’s leaving now.', fog: 'Fog’s down in the glen. Another round, then.' }[weather],
      font: 'Uncial Antiqua',
      vars: { bg: '#1a1510', card: '#2a2119', 'card-2': '#3a2e22', text: '#f6f0e2', muted: '#c3b59a', accent: '#e6b84a', 'accent-text': '#241a00', danger: '#e5533d', ok: '#8fcf6a' },
  });

  // vars: the app's colour variables (see style.css). font: a Google Font for headings. light: a
  // light look (the browser's own controls go light too). The background and the TV's table are
  // in lib/roomArt.js.
  const STYLES = {
    classic: { label: 'Classic', emoji: '🎲', welcome: '' },
    dive: {
      label: 'Dive bar',
      emoji: '🍺',
      welcome: 'Welcome to the dive bar. Cash only, bathroom’s out back.',
      font: 'Special Elite',
      vars: { bg: '#1a1612', card: '#2a231c', 'card-2': '#3a3026', text: '#f3e9dc', muted: '#b3a28c', accent: '#ff5a36', 'accent-text': '#1a0600', danger: '#ff3355', ok: '#7bd88f' },
      // The bar after midnight (see diveBar): brick, neon, the jukebox, the regular asleep at
      // the bar. On a phone it's the bar end that shows (`focus`: where across the art it's
      // centred when the screen's too narrow for all of it; the TV's scenery lines up with it).
      focus: 0.88,
    },
    tavern: {
      label: 'Tavern',
      emoji: '🍻',
      welcome: 'Pull up a stool by the fire, traveller.',
      font: 'IM Fell English SC',
      vars: { bg: '#2b1d12', card: '#3d2a1a', 'card-2': '#4e3622', text: '#f7ead2', muted: '#c9ad85', accent: '#e8a83c', 'accent-text': '#2a1700', danger: '#d9483b', ok: '#9ccc65' },
      // Wood-panelled walls under the beams, lit by the candles and the fire (see tavernInn); on
      // a phone, the hearth.
      focus: 0.08,
    },
    club: {
      label: 'Club',
      emoji: '🪩',
      welcome: 'Bottle service is a state of mind.',
      font: 'Bungee',
      vars: { bg: '#07060d', card: '#141022', 'card-2': '#201a36', text: '#f5f0ff', muted: '#9d93c4', accent: '#ff2bd6', 'accent-text': '#22001c', danger: '#ff3d6e', ok: '#29f0ff' },
      // Light beams from the truss, mirror-ball sparkles, the DJ booth and a glowing dance floor
      // (see clubFloor); on a phone, the back bar and the booth.
      focus: 0.8,
    },
    castle: {
      label: 'Castle',
      emoji: '🏰',
      welcome: 'The court is assembled. Long live the drinking king.',
      font: 'Cinzel',
      vars: { bg: '#1c1b22', card: '#2a2833', 'card-2': '#383544', text: '#efe9dc', muted: '#a9a3b5', accent: '#d4af37', 'accent-text': '#1d1600', danger: '#c8303f', ok: '#6fbf73' },
      // A stone hall with torches on the walls and banners hanging down, the throne on its dais
      // (see greatHall); on a phone, the window and the throne.
      focus: 0.88,
    },
    jazz: {
      label: 'Jazz club',
      emoji: '🎷',
      welcome: 'Low lights, smooth horns, strong drinks.',
      font: 'Limelight',
      vars: { bg: '#1a0d12', card: '#2a141c', 'card-2': '#3a1c27', text: '#f6e7d8', muted: '#c39ea0', accent: '#e3b04b', 'accent-text': '#241500', danger: '#ff5d73', ok: '#8fd19e' },
      // Velvet stage curtains under a spotlight, the band's corner of the stage and gold art deco
      // fans along its front (see jazzStage); on a phone, the singer's mic in the spotlight.
      focus: 0.1,
    },
    diner: {
      label: 'Diner',
      emoji: '🍔',
      welcome: 'Bottomless coffee. Bottomless everything else too.',
      font: 'Pacifico',
      light: true,
      vars: { bg: '#f6efe2', card: '#ffffff', 'card-2': '#f1e4cf', text: '#2b1d1d', muted: '#7b6563', accent: '#e63946', 'accent-text': '#ffffff', 'accent-ink': '#c1121f', danger: '#d62839', ok: '#2a9d8f' },
    },
    tiki: {
      label: 'Tiki bar',
      emoji: '🏝️',
      welcome: 'Grab a coconut. The tide waits for no one.',
      font: 'Rum Raisin',
      vars: { bg: '#0f2421', card: '#1b3631', 'card-2': '#25463f', text: '#fbf1dc', muted: '#a8c3b6', accent: '#ff8a3d', 'accent-text': '#2a1000', danger: '#ff4f5e', ok: '#6fdc8c' },
    },
    speakeasy: {
      label: 'Speakeasy',
      emoji: '🥃',
      welcome: 'Knock twice. Password’s “the bee’s knees”.',
      font: 'Poiret One',
      vars: { bg: '#2a1014', card: '#22110f', 'card-2': '#331a16', text: '#f3e8d4', muted: '#b9a68c', accent: '#c9a24a', 'accent-text': '#1a1300', danger: '#e0503c', ok: '#7fbf7a' },
    },
    casino: {
      label: 'Casino',
      emoji: '🎰',
      welcome: 'The house always wins. Tonight, the house drinks.',
      font: 'Abril Fatface',
      vars: { bg: '#1a0608', card: '#2a0d10', 'card-2': '#3a1418', text: '#fff2e0', muted: '#d5a6a0', accent: '#f5c542', 'accent-text': '#2a1d00', danger: '#ff4d5e', ok: '#4fd18b' },
    },
    saloon: {
      label: 'Saloon',
      emoji: '🤠',
      welcome: 'Belly up to the bar, partner.',
      font: 'Rye',
      vars: { bg: '#2a1a0e', card: '#3c2614', 'card-2': '#4d331c', text: '#fbecd2', muted: '#d0b28a', accent: '#e0a43a', 'accent-text': '#2a1600', danger: '#c8452f', ok: '#9bc76a' },
    },
    pirate: {
      label: 'Pirate tavern',
      emoji: '🏴‍☠️',
      welcome: 'Yo ho ho. Dead men tell no tales, and neither do we.',
      font: 'Pirata One',
      vars: { bg: '#10161d', card: '#1b2530', 'card-2': '#26323f', text: '#f2e6cc', muted: '#a9b1b9', accent: '#e3b23c', 'accent-text': '#231800', danger: '#e0503c', ok: '#6fc28b' },
    },
    beerhall: {
      label: 'Beer hall',
      emoji: '🥨',
      welcome: 'Prost! Steins up, everybody.',
      font: 'UnifrakturMaguntia',
      light: true,
      vars: { bg: '#eef3fa', card: '#ffffff', 'card-2': '#e3ebf6', text: '#1d2a3a', muted: '#5f6f84', accent: '#2a6fdb', 'accent-text': '#ffffff', 'accent-ink': '#1f56ad', danger: '#d63c3c', ok: '#2b9a5a' },
    },
    space: {
      label: 'Space lounge',
      emoji: '🪐',
      welcome: 'Zero gravity, full glasses.',
      font: 'Orbitron',
      vars: { bg: '#05060f', card: '#10132a', 'card-2': '#1a1f3d', text: '#eef1ff', muted: '#8e96c8', accent: '#7cf0ff', 'accent-text': '#00222a', danger: '#ff5c8a', ok: '#7dff9e' },
    },
    lighthouse: {
      label: 'Lighthouse',
      emoji: '🌊',
      welcome: 'Keepers of the light. Pour one out for the sailors.',
      // The weather changes on its own during games (see moods below): this is the night.
      font: 'Cormorant SC',
      vars: { bg: '#0b1626', card: '#13233a', 'card-2': '#1b3050', text: '#eef3f8', muted: '#9fb3c8', accent: '#f4c95d', 'accent-text': '#241a00', danger: '#ff6b5e', ok: '#6fd3a8' },
    },
    // Outdoors in Tuscany: a long lunch under the pergola, looking out over the vineyards.
    vineyard: {
      label: 'Italian vineyard',
      emoji: '🍇',
      welcome: 'Salute! Pull up a chair under the vines.',
      font: 'Italiana',
      vars: { bg: '#3a2e1c', card: '#2e2416', 'card-2': '#3d3020', text: '#f8f0dc', muted: '#c9b894', accent: '#c0392b', 'accent-text': '#fff4ea', danger: '#e0503c', ok: '#8fcf6a' },
    },
    // The frat house basement. Beer pong's set up; nobody's going to class tomorrow.
    frat: {
      label: 'Frat house',
      emoji: '🥤',
      welcome: 'Welcome to Beta Omega Omega Lambda. Shoes optional, cups mandatory.',
      font: 'Bungee',
      vars: { bg: '#2a1a10', card: '#2e1e14', 'card-2': '#3e2a1c', text: '#fff4e8', muted: '#d8bc9c', accent: '#d62828', 'accent-text': '#ffffff', danger: '#ff4d4d', ok: '#7bd88f' },
    },
    // Slevens in the Speakeasy: noir. A dice game in a private eye's office after midnight.
    speakeasyNoir: {
      mood: true,
      egg: true,
      room: 'speakeasy',
      label: 'Noir',
      emoji: '🕵️',
      welcome: 'It was a dark and stormy night. The dice were loaded. So was I.',
      font: 'Special Elite',
      vars: { bg: '#111114', card: '#1a1a1e', 'card-2': '#26262c', text: '#ecebe6', muted: '#9a9890', accent: '#ff2a3a', 'accent-text': '#ffffff', danger: '#ff2a3a', ok: '#d8d4c4' },
      drink: '🥃',
    },
    // A paddle steamer on the Mississippi, for a dice game on the river (a candidate easter egg:
    // not in EGGS yet; see it with /preview?look=saloonRiverboat&game=slevens).
    saloonRiverboat: {
      mood: true,
      egg: true,
      room: 'saloon',
      label: 'Riverboat',
      emoji: '🛶',
      welcome: 'All aboard the Delta Belle. Place your bets, gentlemen.',
      font: 'Rye',
      vars: { bg: '#2a1018', card: '#3a1820', 'card-2': '#4a2230', text: '#fbf0dc', muted: '#e0c0a0', accent: '#e8b84a', 'accent-text': '#2a1700', danger: '#ff5a4a', ok: '#8fcf6a' },
      drink: '🥃',
    },
    // A Viking mead hall, for a dice game (saved for an easter egg: not in EGGS just now).
    tavernMeadhall: {
      mood: true,
      egg: true,
      room: 'tavern',
      label: 'Mead hall',
      emoji: '🪓',
      welcome: 'Horns up! The mead hall welcomes you.',
      font: 'IM Fell English SC',
      vars: { bg: '#1e130b', card: '#2e1e10', 'card-2': '#3e2a18', text: '#f7ead2', muted: '#cfb08a', accent: '#e8a83c', 'accent-text': '#2a1700', danger: '#d9483b', ok: '#9ccc65' },
      drink: '🍯',
    },
    // Quarters in the diner: the roller rink next door, all neon and disco ball.
    dinerRink: {
      mood: true,
      egg: true,
      room: 'diner',
      label: 'Roller rink',
      emoji: '🛼',
      welcome: 'Couples skate! Quarters at the snack bar.',
      font: 'Monoton',
      vars: { bg: '#1a0a30', card: '#24113e', 'card-2': '#321a54', text: '#fbeeff', muted: '#d0b0e8', accent: '#29f0ff', 'accent-text': '#00202a', danger: '#ff4d6d', ok: '#7dff9e' },
      drink: '🥤',
    },
    // Beer Pong at the frat house: the championship. The whole house is in.
    fratChampionship: {
      mood: true,
      egg: true,
      room: 'frat',
      label: 'Beer pong championship',
      emoji: '🏓',
      welcome: 'The Beta Omega Omega Lambda beer pong championship. Winner stays on.',
      font: 'Bungee',
      vars: { bg: '#2a1a10', card: '#2e1e14', 'card-2': '#3e2a1c', text: '#fff4e8', muted: '#d8bc9c', accent: '#d62828', 'accent-text': '#ffffff', danger: '#ff4d4d', ok: '#7bd88f' },
      drink: '🥤',
    },
    // The mechanic's garage: the car's up on the lift, the radio's on.
    garage: {
      label: 'Mechanic’s garage',
      emoji: '🔧',
      welcome: 'Grab a stool. The car can wait.',
      font: 'Black Ops One',
      vars: { bg: '#2a3038', card: '#262c34', 'card-2': '#343c46', text: '#f4f6f8', muted: '#b0bac4', accent: '#ffd23f', 'accent-text': '#1a1400', danger: '#ff4d4d', ok: '#6fd38f' },
    },
    // Outdoors in the Loire: drinks on the terrace of the château, over the formal garden.
    chateau: {
      label: 'French château',
      emoji: '🏰',
      welcome: 'Santé! Champagne on the terrace.',
      font: 'Parisienne',
      vars: { bg: '#2a3326', card: '#253024', 'card-2': '#323f30', text: '#fbf8ee', muted: '#e2e8d8', accent: '#e6c06a', 'accent-text': '#221800', danger: '#e0503c', ok: '#8fcf6a' },
    },
    // The Lighthouse's other moods. They aren't on the list of styles: the room moves between them.
    // The vineyard at sunset, and the château at night.
    vineyardSunset: {
      mood: true,
      label: 'Italian vineyard',
      emoji: '🍇',
      welcome: 'The sun’s going down over the hills. Another glass?',
      font: 'Italiana',
      vars: { bg: '#3a2418', card: '#2e1e14', 'card-2': '#3d281c', text: '#fbeedd', muted: '#d0b090', accent: '#e07a3a', 'accent-text': '#2a1000', danger: '#e0503c', ok: '#8fcf6a' },
    },
    chateauNight: {
      mood: true,
      label: 'French château',
      emoji: '🏰',
      welcome: 'Every window’s lit. The party’s inside, the champagne’s out here.',
      font: 'Parisienne',
      vars: { bg: '#141a30', card: '#1a2038', 'card-2': '#242c4a', text: '#f4f0e4', muted: '#a9aec8', accent: '#e6c06a', 'accent-text': '#221800', danger: '#e0503c', ok: '#8fcf6a' },
    },
    // ---------- Easter eggs: a room that changes when a certain game's played in it ----------
    // (See EGGS below.) Kings Cup at the château: the revolution's come, and the château's burning.
    chateauRevolution: {
      mood: true,
      egg: true,
      room: 'chateau',
      label: 'French château',
      emoji: '🔥',
      welcome: 'Vive la Révolution ! Let them drink champagne.',
      font: 'Parisienne',
      vars: { bg: '#1a0c0c', card: '#241414', 'card-2': '#331c1a', text: '#fbeee4', muted: '#d4aea0', accent: '#ff7a2a', 'accent-text': '#2a0e00', danger: '#ff4a3a', ok: '#8fcf6a' },
      drink: '🍷',
    },
    // Shot Poker at the casino: you've been let into the gilded salon at Monte Carlo.
    casinoMonteCarlo: {
      mood: true,
      egg: true,
      room: 'casino',
      label: 'Monte Carlo',
      emoji: '👑',
      welcome: 'Bienvenue à Monte-Carlo. Black tie, high stakes.',
      font: 'Abril Fatface',
      vars: { bg: '#2a1a0a', card: '#2e1a0c', 'card-2': '#3e2614', text: '#fff6e4', muted: '#e0c89a', accent: '#f0c75a', 'accent-text': '#2a1d00', danger: '#ff4d5e', ok: '#4fd18b' },
      drink: '🍾',
    },
    // Big Tom in the jazz club: open mic night. A bare brick wall under one spotlight.
    jazzOpenMic: {
      mood: true,
      egg: true,
      room: 'jazz',
      label: 'Open mic night',
      emoji: '🎤',
      welcome: 'Open mic night. Be funny or be quiet.',
      font: 'Limelight',
      vars: { bg: '#150e0c', card: '#241814', 'card-2': '#33221c', text: '#f6e7d8', muted: '#c3a898', accent: '#ff4d6d', 'accent-text': '#2a0008', danger: '#ff5d73', ok: '#8fd19e' },
      drink: '🍸',
    },
    // Ace Race in the beer hall: Oktoberfest, in the big tent.
    beerhallOktoberfest: {
      mood: true,
      egg: true,
      room: 'beerhall',
      label: 'Oktoberfest',
      emoji: '🥨',
      welcome: 'O’zapft is! The keg is tapped. Prost!',
      font: 'UnifrakturMaguntia',
      vars: { bg: '#2a1e10', card: '#2e2214', 'card-2': '#3e2e1c', text: '#fff6e4', muted: '#e0c89a', accent: '#2a6fdb', 'accent-text': '#ffffff', danger: '#d63c3c', ok: '#2b9a5a' },
      drink: '🍺',
    },
    // Mad Max in the garage: the garage after the end of the world, building war rigs.
    garageWasteland: {
      mood: true,
      egg: true,
      room: 'garage',
      label: 'The Wasteland',
      emoji: '💀',
      welcome: 'Welcome to the Wasteland. Fuel’s low. Drinks are lower.',
      font: 'Rye',
      vars: { bg: '#2a1408', card: '#2e1a0e', 'card-2': '#40261a', text: '#fbe8d0', muted: '#d8a880', accent: '#ff7a1a', 'accent-text': '#2a0e00', danger: '#ff4a3a', ok: '#8fcf6a' },
      drink: '🛢️',
    },
    // Ride the Bus in the space lounge: the bus is a starship, and riding it is a jump to lightspeed.
    spaceStarship: {
      mood: true,
      egg: true,
      room: 'space',
      label: 'The starship',
      emoji: '🚀',
      welcome: 'All crew aboard. Next stop: anywhere.',
      font: 'Orbitron',
      vars: { bg: '#0c1018', card: '#141c2a', 'card-2': '#1e2a3e', text: '#eef6ff', muted: '#9ab0c8', accent: '#7cf0ff', 'accent-text': '#00222a', danger: '#ff5c8a', ok: '#7dff9e' },
      drink: '🧃',
    },
    // Darts in the dive bar: the board's moved to the Darts Palace, the world championship stage.
    diveChampionship: {
      mood: true,
      egg: true,
      room: 'dive',
      label: 'Darts Palace',
      emoji: '🎯',
      welcome: 'Welcome to the Darts Palace. Game on!',
      font: 'Special Elite',
      vars: { bg: '#0e0b1c', card: '#1c1630', 'card-2': '#2a2244', text: '#f4f0ff', muted: '#b0a6d0', accent: '#ffd23f', 'accent-text': '#1a1400', danger: '#ff4d6d', ok: '#7bd88f' },
      drink: '🍺',
    },
    // Horse Race at the castle: out of the great hall and down to the tournament field. The
    // jockeys ride in armour with lances (see public/games/horseRace.js).
    castleTournament: {
      mood: true,
      egg: true,
      room: 'castle',
      label: 'Castle',
      emoji: '🐴',
      welcome: 'To the lists! The tournament begins.',
      font: 'Cinzel',
      vars: { bg: '#2a3a24', card: '#2a2833', 'card-2': '#383544', text: '#f4eedd', muted: '#c9c2d2', accent: '#d4af37', 'accent-text': '#1d1600', danger: '#c8303f', ok: '#6fbf73' },
      drink: '🍷',
    },
    // Liar's Dice on the pirate ship: you're aboard the Flying Dutchman, playing for years of your
    // life. A ghost ship in a green storm (see dutchman()).
    pirateDutchman: {
      mood: true,
      egg: true,
      room: 'pirate',
      label: 'The Flying Dutchman',
      emoji: '👻',
      welcome: 'Welcome aboard the Flying Dutchman. Wager your years, sailor.',
      font: 'Pirata One',
      vars: { bg: '#06120e', card: '#0e1f19', 'card-2': '#162c24', text: '#e4f4ea', muted: '#9ab8a8', accent: '#7cf0b0', 'accent-text': '#002414', danger: '#ff6a5a', ok: '#7cf0b0' },
      drink: '🥃',
    },
    lighthouseDay: {
      mood: true,
      label: 'Lighthouse',
      emoji: '🌊',
      welcome: 'Fair winds and following seas. Pour one out for the sailors.',
      font: 'Cormorant SC',
      vars: { bg: '#2f6f9e', card: '#13304d', 'card-2': '#1c4266', text: '#f2f7fb', muted: '#b4c8da', accent: '#f4c95d', 'accent-text': '#241a00', danger: '#ff6b5e', ok: '#6fd3a8' },
    },
    lighthouseFog: {
      mood: true,
      label: 'Lighthouse',
      emoji: '🌫️',
      welcome: 'Fog’s rolled in. Listen for the horn.',
      font: 'Cormorant SC',
      vars: { bg: '#1c2631', card: '#25313e', 'card-2': '#303e4d', text: '#eef2f6', muted: '#a8b4c0', accent: '#f4c95d', 'accent-text': '#241a00', danger: '#ff6b5e', ok: '#6fd3a8' },
    },
    storm: {
      mood: true,
      label: 'Lighthouse',
      emoji: '⛈️',
      welcome: 'Batten down the hatches. All hands to the bar.',
      font: 'Cormorant SC',
      vars: { bg: '#0a1016', card: '#141c25', 'card-2': '#1d2833', text: '#e9eef3', muted: '#97a6b4', accent: '#f4c95d', 'accent-text': '#241a00', danger: '#ff6b5e', ok: '#6fd3a8' },
    },
    christmas: {
      seasonal: true,
      label: 'Christmas',
      emoji: '🎄',
      welcome: 'Eggnog’s spiked. Ho ho ho.',
      font: 'Mountains of Christmas',
      vars: { bg: '#0e2418', card: '#173523', 'card-2': '#214630', text: '#fff8ee', muted: '#b8cfb9', accent: '#e8b84a', 'accent-text': '#261a00', danger: '#e2403b', ok: '#7fdc8f' },
    },
    halloween: {
      seasonal: true,
      label: 'Halloween',
      emoji: '🎃',
      welcome: 'Something wicked this way comes. Drink up.',
      font: 'Creepster',
      vars: { bg: '#0d0812', card: '#1c1224', 'card-2': '#2a1a35', text: '#fbeedd', muted: '#b79fc4', accent: '#ff7a1a', 'accent-text': '#1f0d00', danger: '#ff3b5c', ok: '#8fe36b' },
    },
    stpatricks: highland('clear'),
    // The Highlands pub's other moods: the same tavern with the rain coming down outside, or the fog in.
    stpatricksRain: { ...highland('rain'), mood: true },
    stpatricksFog: { ...highland('fog'), mood: true },
  };

  // Rooms whose look changes on its own: [look, how often it comes up]. The first is where it starts
  // when nothing's been picked yet.
  // What's in front of each player on the TV's table, by room.
  const DRINKS = { classic: '🍺', dive: '🍺', tavern: '🍺', club: '🍸', castle: '🍷', jazz: '🍸', diner: '🥤', tiki: '🍹', speakeasy: '🥃',
    casino: '🍸', saloon: '🥃', pirate: '🥃', beerhall: '🍺', space: '🍸', lighthouse: '🍺', christmas: '☕', halloween: '🧪', stpatricks: '🥃',
    vineyard: '🍷', chateau: '🥂', garage: '🍺', frat: '🥤' };
  for (const [id, drink] of Object.entries(DRINKS)) STYLES[id].drink = drink;

  STYLES.lighthouse.moods = [['lighthouse', 4], ['lighthouseDay', 3], ['lighthouseFog', 2], ['storm', 1.5]];
  STYLES.stpatricks.moods = [['stpatricks', 4], ['stpatricksRain', 3], ['stpatricksFog', 2]];
  STYLES.vineyard.moods = [['vineyard', 3], ['vineyardSunset', 2]];
  STYLES.chateau.moods = [['chateau', 3], ['chateauNight', 2]];

  // Boat Race at the lighthouse: regatta day. Always the clear day, signal flags strung overhead.
  STYLES.lighthouseRegatta = {
    ...STYLES.lighthouseDay,
    egg: true,
    room: 'lighthouse',
    emoji: '⛵',
    welcome: 'Regatta day! Every boat in the harbour is out.',
  };

  // The easter eggs: playing this game in this room turns it into that look, for the whole game.
  const EGGS = { 'chateau:kingsCup': 'chateauRevolution', 'pirate:liarsDice': 'pirateDutchman', 'casino:shotPoker': 'casinoMonteCarlo', 'lighthouse:boatRace': 'lighthouseRegatta', 'castle:horseRace': 'castleTournament', 'dive:darts': 'diveChampionship', 'jazz:bigTom': 'jazzOpenMic', 'beerhall:aceRace': 'beerhallOktoberfest', 'garage:madMax': 'garageWasteland', 'space:rideTheBus': 'spaceStarship', 'frat:beerPong': 'fratChampionship', 'diner:quarters': 'dinerRink', 'speakeasy:slevens': 'speakeasyNoir' };
  const eggOf = (style, game) => EGGS[`${style}:${game}`] || null;

  const IDS = Object.keys(STYLES);
  // Moods drink what their room drinks.
  for (const id of IDS) if (STYLES[id].mood && !STYLES[id].drink) STYLES[id].drink = STYLES[STYLES[id].room || IDS.find((r) => STYLES[r].moods?.some(([look]) => look === id))].drink;
  // The styles the host picks from (a mood is part of its room, not a choice of its own).
  const PICKABLE = IDS.filter((id) => !STYLES[id].mood);
  // 'Random': a different venue each game, from the year-round ones (not the plain classic look),
  // never the one you've just been in.
  const RANDOM_FROM = PICKABLE.filter((id) => id !== 'classic' && !STYLES[id].seasonal);
  const pickRandom = (not = null) => {
    const from = RANDOM_FROM.filter((id) => id !== not);
    return from[Math.floor(Math.random() * from.length)];
  };
  // The room a mood belongs to (a saved room may still be on an old 'storm' style).
  const roomOf = (id) => (STYLES[id]?.room || (STYLES[id]?.mood ? IDS.find((r) => STYLES[r].moods?.some(([look]) => look === id)) : id));

  // A new mood for a room that has them, never the one it's in now.
  function pickMood(style, now) {
    const list = (STYLES[style]?.moods || []).filter(([look]) => look !== now);
    let r = Math.random() * list.reduce((n, [, w]) => n + w, 0);
    for (const [look, w] of list) if ((r -= w) < 0) return look;
    return list[0]?.[0] || null;
  }

  // ---------- In the browser ----------

  // The background sits on a layer fixed to the screen behind the page, not on the body with
  // background-attachment: fixed: phones repaint a fixed background (layered gradients and all)
  // on every frame of a scroll, while a fixed layer is painted once and just stays put. It's as
  // tall as the screen with the browser's bars hidden (lvh), so it doesn't resize as they come
  // and go. (lib/roomArt.js puts each look's background on it.)
  const LAYER = 'position:fixed;top:0;left:0;right:0;height:100vh;height:100lvh;pointer-events:none;';

  // One look's stylesheet (its colours, background, table and heading font); css() alone is every
  // look's. Built from the art, so only where the art is: in Node, and in a demo page (which has no
  // server to ask, so carries it: see tools/build-demos.js).
  function css(id) {
    const art = typeof module !== 'undefined' && module.exports ? require('./roomArt') : root.ROOM_ART;
    if (!art) throw new Error('No room art on this page: a look\'s stylesheet comes from /room-style/<id>.css');
    return art.css(id);
  }

  // Each look's stylesheet, once it's in. The server builds them one at a time (/room-style/<id>.css,
  // a few KB each), and `version` (which the server sets) is in the address so the browser can keep
  // one for good: a deploy that changes the art changes the address.
  const sheets = new Map();
  const loading = new Map();
  function load(id) {
    if (sheets.has(id)) return Promise.resolve(sheets.get(id));
    if (root.ROOM_ART) {
      sheets.set(id, root.ROOM_ART.css(id));
      return Promise.resolve(sheets.get(id));
    }
    if (!loading.has(id)) {
      loading.set(id, fetch(`/room-style/${encodeURIComponent(id)}.css?v=${encodeURIComponent(ROOM_STYLES.version)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`room style ${id}: ${res.status}`);
          return res.text();
        })
        .then((text) => {
          sheets.set(id, text);
          return text;
        })
        // (Asked for again by the next apply, if this one didn't come.)
        .finally(() => loading.delete(id)));
    }
    return loading.get(id);
  }

  // What the room on screen may turn into next, fetched once the page is quiet, so that change is
  // as instant as it was when every look came with the page: its other moods (the Lighthouse's
  // weather changes on its own) and its easter eggs (Kings Cup at the château, when the game starts).
  function prefetch(style) {
    if (root.ROOM_ART) return; // (a demo has every look already)
    const room = roomOf(style);
    const next = [...(STYLES[room]?.moods || []).map(([look]) => look), ...Object.entries(EGGS).filter(([key]) => key.startsWith(`${room}:`)).map(([, look]) => look)];
    const quiet = root.requestIdleCallback || ((fn) => setTimeout(fn, 1000));
    quiet(() => next.filter((look) => !sheets.has(look)).forEach((look) => load(look).catch(() => {})));
  }

  // When the look changes, the old background fades out over the new one instead of snapping.
  function crossfade() {
    if (!document.body) return;
    const cs = getComputedStyle(document.body, '::before');
    const fade = document.createElement('div');
    fade.setAttribute('aria-hidden', 'true');
    fade.style.cssText = `${LAYER}z-index:0;transition:opacity 4s ease;`;
    for (const p of ['backgroundImage', 'backgroundColor', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat']) fade.style[p] = cs[p];
    document.body.prepend(fade);
    requestAnimationFrame(() => requestAnimationFrame(() => (fade.style.opacity = '0')));
    setTimeout(() => fade.remove(), 4300);
  }

  // The heading font, fetched the first time a room uses it (asked for as the look is, so it's on
  // its way while the look's stylesheet is).
  function font(style) {
    const fontId = `room-font-${style}`;
    if (document.getElementById(fontId)) return;
    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(STYLES[style].font)}&display=swap`;
    document.head.appendChild(link);
  }

  // The look on screen, and the one asked for last (on screen as soon as its stylesheet's in: until
  // then the old look stays, whole). `shown` is called once the look asked for is the one on screen
  // (the TV's moving scenery changes with the background, not before it).
  let current = null;
  let wanted = null;
  function apply(id, shown) {
    if (typeof document === 'undefined') return;
    const style = STYLES[id] && id !== 'classic' ? id : null;
    wanted = { style, shown };
    if (style === current) return shown?.();
    if (!style) return show(null);
    font(style);
    load(style).then(() => wanted.style === style && current !== style && show(style), () => {});
    // (A look that's in already goes on now, in this same frame.)
    if (sheets.has(style)) show(style);
  }

  function show(style) {
    if (current && style && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) crossfade();
    current = style;
    const html = document.documentElement;
    // Only the look on screen is in the page: every look's background art together is over a
    // megabyte of stylesheet for a phone to parse and keep, and it only ever shows one. The
    // crossfade has already copied the old background, so its rules can go.
    let el = document.getElementById('room-styles');
    if (!el) {
      el = document.createElement('style');
      el.id = 'room-styles';
      document.head.appendChild(el);
    }
    el.textContent = style ? sheets.get(style) : '';
    // The phone's status bar matches the room (and goes back to the phone's own theme after).
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && !style && html.dataset.metaBefore) meta.setAttribute('content', html.dataset.metaBefore);
    if (style) {
      if (meta && !html.dataset.room) html.dataset.metaBefore = meta.getAttribute('content');
      meta?.setAttribute('content', STYLES[style].vars.bg);
      html.dataset.room = style;
      prefetch(style);
    } else {
      delete html.dataset.room;
    }
    wanted.shown?.();
  }

  // (version: set by the server, in the copy it sends the browser.)
  const ROOM_STYLES = { STYLES, IDS, PICKABLE, RANDOM_FROM, EGGS, eggOf, roomOf, pickMood, pickRandom, apply, css, LAYER, version: '' };
  if (typeof module !== 'undefined' && module.exports) module.exports = ROOM_STYLES;
  else root.ROOM_STYLES = ROOM_STYLES;
})(this);
