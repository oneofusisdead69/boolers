// Background sound for the TV, to match the room style. Each room has at most three layers, so
// they never pile up into a hiss: one background recording (the sea, rain, a fire, crickets; real
// CC0 recordings from /sounds), a few sounds now and then (gulls, a creaking timber, chips, glasses)
// and a tune, played on the fly with the Web Audio API: the blues on the dive bar's jukebox, a
// lute in the tavern, Drunken Sailor on the pirate ship, Shenandoah at the lighthouse, a fiddle and
// the pipes in the Highlands pub, Bach on the organ at Halloween... Classic is quiet.
//
//   Ambience.set(style, level, { party })   start, switch or stop (level 0 = off, up to 1)
//
// Party mode: they're drinking games, after all. Every room's own music, but upbeat: the tunes
// at a dancing tempo over a beat (kick, hats, a clap, a bouncing bass on the chords), and the
// rooms' other rhythms quicker too.
(() => {
  let ac = null;
  let master = null;
  let current = null; // { style, stop() }
  let level = 0;
  let party = false;

  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0;
      master.connect(ac.destination);
    }
    // (Not while the page is hidden: a TV's re-render would wake the sound we put to sleep.)
    if (ac.state === 'suspended' && !document.hidden) ac.resume()?.catch?.(() => {});
    return ac;
  }

  // In a tab no one's looking at (the phone locked, the TV's browser switched to something else),
  // the sound sleeps: the audio stops and the tunes' 50 ms clocks stop ticking, instead of
  // keeping the phone awake all night. It all carries on where it was when the page is back.
  // (Browsers only let sound start after a tap: until then there's no AudioContext to wake.)
  const clocks = new Set(); // the running sequencers: { tick, timer }
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) {
      clocks.forEach((c) => { clearInterval(c.timer); c.timer = null; });
      if (ac.state === 'running') ac.suspend()?.catch?.(() => {});
      return;
    }
    clocks.forEach((c) => { if (!c.timer) c.timer = setInterval(c.tick, 50); });
    if (!current || ac.state === 'running') return;
    // Some phones won't wake the sound without a tap: then it's the next one.
    ac.resume()?.catch?.(() => document.addEventListener('pointerdown', audio, { once: true, capture: true }));
  });

  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  // ---------- Building blocks ----------

  // A short burst of filtered noise: a pop, a hi-hat, a brush.
  function hit(out, t, { type = 'highpass', freq, q = 1, gain, len, attack = 0.004 }) {
    const src = noise();
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + len + 0.05);
  }

  // A plucked or struck note.
  function note(out, t, { freq, len = 0.4, gain = 0.2, type = 'triangle', attack = 0.005, to = null }) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  // A trumpet: two saws through a filter that opens as the note speaks.
  function brass(out, t, freq, len, gain) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(2600, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(1400, t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.04);
    g.gain.setValueAtTime(gain * 0.8, t + Math.max(0.05, len - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
    f.connect(g).connect(out);
    for (const d of [1, 1.006]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq * d;
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.1);
    }
  }
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // Calls step(time, beat) for every beat (or tick) just ahead of time, so rhythms stay steady.
  // (In party mode a room's rhythms run quicker, up to a point; a tune sets its own tempo.)
  const partyPace = (bpm) => Math.max(bpm, Math.min(bpm * 1.25, 180));
  function sequencer(bpm, step, { div = 1, own = false } = {}) {
    const dur = 60 / (party && !own ? partyPace(bpm) : bpm) / div;
    let next = ac.currentTime + 0.1;
    let n = 0;
    // (The audio's clock stands still while it's asleep, so on waking nothing's been missed.)
    const clock = {
      tick: () => {
        while (next < ac.currentTime + 0.25) {
          step(next, n, dur);
          next += dur;
          n += 1;
        }
      },
      timer: null,
    };
    if (!document.hidden) clock.timer = setInterval(clock.tick, 50);
    clocks.add(clock);
    return () => {
      clearInterval(clock.timer);
      clocks.delete(clock);
    };
  }

  // Calls fn at random moments, on average every `every` seconds.
  function now(every, fn) {
    let stopped = false;
    const go = () => {
      if (stopped) return;
      // (Skipped while the sound's asleep, or they'd all go off at once when it wakes.)
      if (ac.state === 'running') fn(ac.currentTime + 0.05);
      setTimeout(go, (every * (0.4 + Math.random() * 1.2)) * 1000);
    };
    const t = setTimeout(go, every * 500);
    return () => { stopped = true; clearTimeout(t); };
  }

  // A pub session up in the hills: the crowd and the peat fire, and in the corner a fiddle playing
  // a slow air over a guitar's open chords, with a soft bodhrán. A real tune, at an easy walking
  // pace (a random run of quick notes on a bright tone sounded like a fairground organ).
  // `level` turns the band down.
  // The air, in D mixolydian: [midi note or null for a rest, length in eighths], one bar = 6.
  const AIR = [
    [69, 2], [71, 1], [74, 3], [76, 1], [74, 1], [71, 2], [69, 2], [67, 1], [69, 1], [71, 2], [69, 1], [67, 1], [64, 2], [62, 4],
    [62, 1], [64, 1], [67, 2], [69, 1], [71, 1], [72, 2], [71, 1], [69, 1], [67, 4], [64, 1], [62, 1], [64, 2], [67, 6],
    [74, 2], [76, 1], [78, 3], [76, 1], [74, 1], [72, 2], [71, 2], [69, 1], [67, 1], [69, 2], [71, 1], [69, 1], [67, 2], [64, 4],
    [62, 1], [64, 1], [67, 2], [69, 1], [67, 1], [64, 2], [62, 1], [60, 1], [62, 6], [null, 8],
  ];
  // A chord a bar under it: D, C (mixolydian's flat seventh) and G.
  const CHORDS = [[50, 57, 62], [50, 57, 62], [48, 55, 64], [50, 57, 62], [55, 59, 62], [48, 55, 64], [55, 62, 67], [50, 57, 62]];

  // The fiddle: a soft bowed tone that swells in, with vibrato once the note settles.
  function fiddle(out, t, freq, len, gain) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const vib = ac.createOscillator();
    vib.frequency.value = 5.2;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(0.5, len * 0.6));
    vib.connect(depth).connect(o.frequency);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.12);
    g.gain.setValueAtTime(gain * 0.85, t + Math.max(0.13, len - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.15);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    vib.start(t);
    o.stop(t + len + 0.2);
    vib.stop(t + len + 0.2);
  }

  // The pipes: a chanter with the reedy buzz of a bagpipe, each note led in by a quick grace note
  // from above, the way pipers play.
  function chanter(out, t, freq, len, gain) {
    const grace = Math.min(0.06, len * 0.2);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.setValueAtTime(gain, t + Math.max(0.03, len - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
    f.connect(g).connect(out);
    for (const [type, mult] of [['sawtooth', 1], ['square', 1.003]]) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(hz(79) * (mult === 1 ? 1 : 1.003), t); // the grace note, high G
      o.frequency.setValueAtTime(freq * mult, t + grace);
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.08);
    }
  }
  // The pipes' drones: a low D and the A above, held under the whole tune.
  function drones(out, t, len, gain) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 1.2);
    g.gain.setValueAtTime(gain, t + len - 1.5);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    f.connect(g).connect(out);
    for (const [m, d] of [[38, 0], [50, 3], [57, -2]]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = d;
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.1);
    }
  }

  // A session up in the hills: the peat fire (or the rain outside), and the air played round and
  // round, by the fiddle over a guitar's chords and a soft bodhrán, then by the pipes over their
  // drones, and back. `level` turns the band down; `outside` is the room's background recording.
  function session(out, level = 1, outside = 'bed-fire-1') {
    const band = ac.createGain();
    band.gain.value = level;
    band.connect(out);
    const eighth = 60 / 76 / 2; // a slow air: about 76 beats a minute
    const tuneLen = AIR.reduce((n, [, len]) => n + len, 0) * eighth;
    let step = 0; // which note of the air
    let at = 0; // eighths left on the note playing
    let bar = 0;
    let pass = 0; // even: the fiddle; odd: the pipes
    return [
      background(out, outside, { gain: outside === 'bed-rain-1' ? 0.3 : 0.32, lowpass: outside === 'bed-rain-1' ? 2500 : 0 }),
      sequencer(76 * 2, (t, n) => {
        const pipes = pass % 2 === 1;
        if (step === 0 && at === 0 && pipes) drones(band, t, tuneLen, 0.012);
        // Each bar (six eighths), with the fiddle: a strummed chord and a soft beat on the drum.
        if (n % 6 === 0 && !pipes) {
          CHORDS[bar % CHORDS.length].forEach((m, k) => note(band, t + k * 0.03, { freq: hz(m), len: 2.2, gain: 0.03, type: 'triangle', attack: 0.01 }));
          hit(band, t, { type: 'lowpass', freq: 120, gain: 0.12, len: 0.35 });
        }
        if (n % 6 === 0) bar += 1;
        if (n % 6 === 3 && !pipes) hit(band, t, { type: 'lowpass', freq: 160, gain: 0.05, len: 0.2 });
        // The next note of the air when the last one's run its length.
        if (at === 0) {
          const [m, len] = AIR[step];
          if (m) (pipes ? chanter(band, t, hz(m), len * eighth, 0.022) : fiddle(band, t, hz(m), len * eighth, 0.035));
          at = len;
          step = (step + 1) % AIR.length;
          if (step === 0) pass += 1;
        }
        at -= 1;
      }),
      () => band.disconnect(),
    ];
  }

  // ---------- Recordings ----------
  // Real recordings for what a synth can't fake (the sea, rain, a fire, thunder, gulls): all CC0,
  // listed in /sounds/CREDITS.md. Each is fetched the first time a room needs it.
  const clips = {};
  function clip(name) {
    clips[name] ||= fetch(`/sounds/${name}.mp3`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).catch(() => null);
    return clips[name];
  }
  function playAt(out, buf, t, { gain = 1, rate = 1, lowpass = 0 } = {}) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = gain;
    if (lowpass) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      src.connect(f).connect(g);
    } else src.connect(g);
    g.connect(out);
    src.start(Math.max(t, ac.currentTime));
    return src;
  }
  // A recording, once (a gull, a wave, a creak), picked from a few if there are several.
  function play(out, names, t, opts) {
    const name = Array.isArray(names) ? pick(names) : names;
    clip(name).then((buf) => buf && playAt(out, buf, t, opts));
  }
  // The room's one background: a recording that plays on underneath, each pass overlapping the
  // last by the second-long fades it starts and ends with, so there's no gap.
  function background(out, name, opts) {
    let stopped = false;
    let timer = null;
    const playing = [];
    clip(name).then((buf) => {
      if (!buf || stopped) return;
      let at = ac.currentTime + 0.1;
      const go = () => {
        if (stopped) return;
        while (at < ac.currentTime + 3) {
          playing.push(playAt(out, buf, at, opts));
          at += buf.duration - 1;
        }
        playing.splice(0, Math.max(0, playing.length - 3));
        timer = setTimeout(go, 1000);
      };
      go();
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      playing.forEach((src) => { try { src.stop(); } catch {} });
    };
  }

  // ---------- Tunes ----------
  // A tune: [midi note or null for a rest, length in eighths], played round and round by a voice.
  // In party mode it's quicker (a dancing tempo, whatever the room) and has a beat under it.
  function tune(out, { bpm, notes, voice, gain, chords = null, every = 8, comp = null }) {
    if (party) bpm = Math.min(138, Math.max(bpm * 1.5, every === 6 ? 132 : 120));
    const eighth = 60 / bpm / 2;
    let step = 0;
    let left = 0;
    let bar = 0;
    let chord = null;
    return sequencer(bpm * 2, (t, n) => {
      if (chords && n % every === 0) {
        chord = chords[bar++ % chords.length];
        comp(out, t, chord, eighth * every);
      }
      if (left === 0) {
        const [m, len] = notes[step];
        if (m) voice(out, t, hz(m), len * eighth, gain);
        // (No chords: the bass follows the tune.)
        if (m && !chords) chord = [m];
        left = len;
        step = (step + 1) % notes.length;
      }
      if (party) beat(out, t, n, every, eighth, chord, gain);
      left -= 1;
    }, { own: true });
  }
  // The party beat, an eighth at a time: a kick on the beat, hats between, a clap on the two and
  // four (the two, in waltz time), and the bass bouncing root-octave on the chord, if there is one.
  function beat(out, t, n, every, eighth, chord, gain) {
    const k = n % every;
    if (k % 2 === 0) note(out, t, { freq: 120, to: 42, len: 0.22, gain: 0.16, type: 'sine', attack: 0.002 });
    else hit(out, t, { freq: 8000, gain: 0.03, len: 0.05 });
    if (every === 6 ? k === 2 : k === 2 || k === 6) hit(out, t, { type: 'bandpass', freq: 1500, q: 0.8, gain: 0.08, len: 0.14 });
    if (chord) {
      let root = chord[0];
      while (root > 45) root -= 12;
      note(out, t, { freq: hz(k % 2 ? root + 12 : root), len: eighth * 0.9, gain: Math.max(0.05, gain * 1.2), type: 'triangle', attack: 0.005 });
    }
  }

  // Voices for the tunes.
  const VOICES = {
    // A soft piano: a struck note that fades.
    piano(out, t, f, len, gain) {
      note(out, t, { freq: f, len: Math.max(0.6, len * 1.4), gain, type: 'triangle', attack: 0.006 });
      note(out, t, { freq: f * 2, len: Math.max(0.3, len * 0.7), gain: gain * 0.25, type: 'sine', attack: 0.006 });
    },
    // An electric piano with a slow wobble (jukebox, lounge).
    keys(out, t, f, len, gain) {
      const o = ac.createOscillator();
      o.frequency.value = f;
      const trem = ac.createOscillator();
      trem.frequency.value = 4.5;
      const td = ac.createGain();
      td.gain.value = gain * 0.3;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.5, len * 1.5));
      trem.connect(td).connect(g.gain);
      o.connect(g).connect(out);
      o.start(t); trem.start(t);
      o.stop(t + Math.max(0.5, len * 1.5) + 0.05); trem.stop(t + Math.max(0.5, len * 1.5) + 0.05);
    },
    // A reedy squeezebox (the shanty), filtered soft.
    squeeze(out, t, f, len, gain) {
      const f1 = ac.createBiquadFilter();
      f1.type = 'lowpass';
      f1.frequency.value = 1300;
      f1.connect(out);
      for (const [type, mult, g] of [['square', 1, 0.5], ['sawtooth', 1.004, 0.5]]) {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        const env = ac.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(gain * g, t + 0.04);
        env.gain.setValueAtTime(gain * g * 0.9, t + Math.max(0.05, len - 0.05));
        env.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
        o.connect(env).connect(f1);
        o.start(t);
        o.stop(t + len + 0.1);
      }
    },
    // A pipe organ: two stops held for the note's length.
    organ(out, t, f, len, gain) {
      for (const [mult, g, type] of [[1, 1, 'triangle'], [2, 0.35, 'sine'], [0.5, 0.4, 'sine']]) {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        const env = ac.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(gain * g, t + 0.06);
        env.gain.setValueAtTime(gain * g, t + Math.max(0.07, len - 0.05));
        env.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
        o.connect(env).connect(out);
        o.start(t);
        o.stop(t + len + 0.3);
      }
    },
    // A tin whistle: a breathy sine with vibrato.
    whistle(out, t, f, len, gain) {
      const o = ac.createOscillator();
      o.frequency.value = f;
      const vib = ac.createOscillator();
      vib.frequency.value = 5.5;
      const vd = ac.createGain();
      vd.gain.setValueAtTime(0, t);
      vd.gain.linearRampToValueAtTime(f * 0.008, t + Math.min(0.4, len * 0.6));
      vib.connect(vd).connect(o.frequency);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.05);
      g.gain.setValueAtTime(gain * 0.85, t + Math.max(0.06, len - 0.06));
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.1);
      o.connect(g).connect(out);
      o.start(t); vib.start(t);
      o.stop(t + len + 0.15); vib.stop(t + len + 0.15);
    },
    // A steel pan: a bright, bell-like note that rings and fades, with the pan's slight sag in pitch.
    steelpan(out, t, f, len, gain) {
      const ring = Math.max(0.5, len * 1.6);
      for (const [mult, g] of [[1, 1], [2, 0.35], [3.01, 0.12]]) note(out, t, { freq: f * mult, to: f * mult * 0.995, len: ring * (mult === 1 ? 1 : 0.6), gain: gain * g, type: 'sine', attack: 0.004 });
    },
    // A mandolin: the note picked fast and over, the way a mandolin holds a long note.
    mandolin(out, t, f, len, gain) {
      for (let at = 0; at < len; at += 0.075) note(out, t + at, { freq: f, len: 0.12, gain: gain * (1 - (at / len) * 0.3), type: 'triangle', attack: 0.002 });
    },
    // A plucked harp or lute.
    pluck(out, t, f, len, gain) {
      note(out, t, { freq: f, len: Math.max(0.8, len * 2), gain, type: 'triangle', attack: 0.003 });
    },
  };
  // Chords under a tune: strummed (plucked, low and soft) once a bar.
  const strum = (gain, voice = 'pluck') => (out, t, chord) => chord.forEach((m, k) => VOICES[voice](out, t + k * 0.03, hz(m), 0.9, gain));

  // The tunes. Drunken Sailor and Shenandoah are traditional (public domain); the rest are made up.
  const SONGS = {
    // Drunken Sailor, in D dorian, at a stomp.
    sailor: [
      [69, 1], [69, 1], [69, 1], [69, 1], [69, 1], [69, 1], [69, 2], [62, 2], [65, 2], [69, 2], [null, 2],
      [67, 1], [67, 1], [67, 1], [67, 1], [67, 1], [67, 1], [67, 2], [60, 2], [64, 2], [67, 2], [null, 2],
      [69, 1], [69, 1], [69, 1], [69, 1], [69, 1], [69, 1], [69, 2], [71, 2], [72, 2], [74, 2], [null, 2],
      [72, 2], [69, 2], [67, 2], [64, 2], [62, 4], [62, 4],
    ],
    // Shenandoah, slow, in D.
    shenandoah: [
      [57, 2], [62, 2], [62, 2], [62, 6], [64, 2], [66, 2], [67, 2], [71, 4], [69, 8],
      [74, 2], [73, 2], [71, 6], [69, 2], [71, 2], [69, 2], [66, 2], [69, 8],
      [69, 2], [71, 2], [71, 6], [71, 2], [66, 2], [69, 2], [66, 2], [64, 2], [62, 4], [64, 4],
      [66, 2], [62, 2], [64, 2], [66, 4], [62, 4], [62, 8], [null, 8],
    ],
    // A slow twelve-bar blues lick on the jukebox, in E.
    blues: [
      [64, 2], [67, 1], [69, 3], [71, 2], [69, 2], [67, 2], [64, 4], [null, 8],
      [69, 2], [72, 1], [74, 3], [76, 2], [74, 2], [72, 2], [69, 4], [null, 8],
      [71, 2], [74, 2], [69, 2], [72, 2], [67, 2], [69, 2], [64, 4], [null, 8],
    ],
    // A doo-wop line over I-vi-IV-V, in C.
    doowop: [
      [72, 3], [76, 1], [79, 4], [76, 3], [74, 1], [72, 4], [69, 3], [72, 1], [77, 4], [74, 6], [null, 2],
      [72, 3], [76, 1], [79, 4], [81, 3], [79, 1], [76, 4], [77, 2], [76, 2], [74, 2], [71, 2], [72, 8],
    ],
    // Lounge vibes for the casino, in C.
    lounge: [
      [76, 3], [74, 1], [72, 2], [71, 2], [69, 6], [null, 2], [74, 3], [72, 1], [71, 2], [69, 2], [67, 6], [null, 2],
      [69, 2], [72, 2], [76, 2], [79, 2], [77, 4], [76, 4], [74, 6], [72, 2], [72, 8],
    ],
    // A harp in the great hall, in D dorian.
    hall: [
      [62, 2], [65, 2], [69, 2], [74, 4], [72, 2], [69, 4], [67, 2], [65, 2], [64, 4], [62, 8],
      [69, 2], [72, 2], [74, 2], [77, 4], [76, 2], [74, 4], [72, 2], [69, 2], [67, 2], [65, 2], [62, 8],
    ],
    // A calypso for the tiki bar, in C, on the steel pan.
    calypso: [
      [72, 1], [74, 1], [76, 2], [72, 1], [74, 2], [76, 1], [77, 2], [76, 1], [74, 1], [72, 4],
      [71, 1], [72, 1], [74, 2], [71, 1], [72, 2], [74, 1], [76, 2], [74, 1], [72, 1], [67, 4],
      [72, 1], [74, 1], [76, 2], [79, 1], [77, 2], [76, 1], [74, 2], [76, 1], [77, 1], [79, 4],
      [81, 1], [79, 1], [77, 1], [76, 1], [74, 2], [71, 2], [72, 6], [null, 2],
    ],
    // A serenade under the vines, in D, in waltz time.
    serenade: [
      [66, 4], [69, 2], [74, 4], [73, 2], [71, 3], [69, 1], [67, 2], [66, 6],
      [64, 4], [66, 2], [67, 4], [71, 2], [69, 3], [67, 1], [64, 2], [62, 6],
      [66, 4], [69, 2], [74, 4], [76, 2], [78, 3], [76, 1], [74, 2], [71, 6],
      [69, 2], [71, 2], [69, 2], [67, 2], [66, 2], [64, 2], [62, 6], [null, 6],
    ],
    // A bal-musette waltz for the château, in G.
    musette: [
      [71, 2], [74, 2], [71, 2], [69, 4], [67, 2], [66, 2], [67, 2], [69, 2], [71, 6],
      [72, 2], [71, 2], [69, 2], [67, 4], [64, 2], [66, 2], [64, 2], [62, 2], [67, 6],
      [74, 2], [76, 2], [74, 2], [72, 4], [71, 2], [69, 2], [71, 2], [72, 2], [74, 6],
      [76, 2], [74, 2], [72, 2], [71, 3], [69, 1], [67, 2], [66, 2], [69, 2], [66, 2], [67, 6],
    ],
    // The opening of Bach's Toccata in D minor on the organ, then a long hush.
    toccata: [
      [81, 1], [79, 1], [81, 6], [79, 1], [77, 1], [76, 1], [74, 1], [73, 4], [74, 8], [null, 8],
      [69, 1], [67, 1], [69, 6], [64, 2], [65, 2], [61, 4], [62, 8], [null, 16],
    ],
  };

  // ---------- The rooms ----------

  // Birds singing in the vines or the garden: a few quick rising chirps.
  function birdsong(out, t) {
    const base = 2600 + Math.random() * 900;
    for (let k = 0; k < pick([2, 3, 4]); k++) note(out, t + k * 0.16, { freq: base * (0.9 + Math.random() * 0.2), to: base * 1.3, len: 0.09, gain: 0.012, type: 'sine', attack: 0.004 });
  }
  // A bar each: D, G, A, D... under the serenade; G, C, D... under the musette.
  const VINE_CHORDS = [[50, 57, 62], [50, 57, 62], [43, 50, 59], [50, 57, 62], [45, 52, 61], [43, 50, 59], [45, 52, 61], [50, 57, 62],
    [50, 57, 62], [47, 54, 62], [43, 50, 59], [50, 57, 62], [45, 52, 61], [45, 52, 61], [50, 57, 62], [50, 57, 62]];
  const MUSETTE_CHORDS = [[43, 50, 59], [43, 50, 59], [50, 57, 62], [43, 50, 59], [48, 52, 60], [43, 50, 59], [50, 57, 62], [43, 50, 59],
    [43, 50, 59], [48, 52, 60], [50, 57, 62], [43, 50, 59], [48, 52, 60], [43, 50, 59], [50, 57, 62], [43, 50, 59]];

  // Every room is three layers at most: one background (a recording, where there's a good one),
  // a few sounds now and then, and a tune. Never a wash of noise under everything.
  // The Blue Danube (Strauss, 1866): the waltz in the salon at Monte Carlo, one bar of 3/4 per
  // six eighths. The tune rises D F# A to the A above, twice, then over A7 back down.
  const DANUBE = (a, b, c, high, end) => [[a, 2], [a, 2], [b, 2], [c, 4], [c, 2], [null, 2], [high, 2], [high, 2], [null, 2], [end, 2], [end, 2]];
  SONGS.danube = [...DANUBE(62, 66, 69, 81, 78), ...DANUBE(62, 66, 69, 81, 79), ...DANUBE(61, 64, 71, 83, 79), ...DANUBE(61, 64, 71, 83, 78)];
  const DANUBE_CHORDS = [[50, 62, 66, 69], [50, 62, 66, 69], [50, 62, 66, 69], [50, 62, 66, 69], [50, 62, 66, 69], [50, 62, 66, 69], [45, 61, 67, 69], [45, 61, 67, 69],
    [45, 61, 67, 69], [45, 61, 67, 69], [45, 61, 67, 69], [45, 61, 67, 69], [45, 61, 67, 69], [45, 61, 67, 69], [50, 62, 66, 69], [50, 62, 66, 69]];
  // Oom-pah-pah: the bass on one, the chord on two and three.
  const waltz = (gain) => (out, t, [bass, ...chord], len) => {
    VOICES.piano(out, t, hz(bass), len / 3, gain * 1.4);
    for (const k of [1, 2]) chord.forEach((m) => VOICES.piano(out, t + (k * len) / 3, hz(m), len / 4, gain * 0.5));
  };
  // Noir: a slow line in A minor, like a sax in an empty bar.
  SONGS.noir = [[69, 6], [72, 2], [71, 4], [69, 4], [67, 6], [64, 2], [65, 8], [null, 4], [64, 2], [65, 2], [67, 4], [69, 2], [71, 2], [72, 6], [71, 2], [69, 8], [null, 8]];
  // A slow dirge in D minor on the Dutchman's organ, with the chords held under it.
  SONGS.dirge = [[62, 4], [65, 2], [69, 2], [70, 4], [69, 4], [67, 2], [65, 2], [64, 2], [65, 2], [62, 8],
    [69, 4], [72, 2], [70, 2], [69, 4], [65, 4], [67, 2], [69, 2], [64, 4], [61, 4], [62, 8]];
  const held = (gain) => (out, t, chord, len) => chord.forEach((m) => VOICES.organ(out, t, hz(m), len, gain));

  const ROOMS = {
    dive(out) {
      // The jukebox playing the blues, and glasses clinking now and then.
      return [
        tune(out, { bpm: 72, notes: SONGS.blues, voice: VOICES.keys, gain: 0.05, chords: [[40, 56, 62], [45, 61, 67], [40, 56, 62], [47, 63, 69]], every: 8, comp: strum(0.03, 'keys') }),
        now(9, (t) => { const f = 2600 + Math.random() * 1200; note(out, t, { freq: f, len: 0.5, gain: 0.03, type: 'sine' }); note(out, t + 0.09, { freq: f * 1.06, len: 0.4, gain: 0.02, type: 'sine' }); }),
      ];
    },
    tavern(out) {
      // The fire, and a lute somewhere in the corner.
      return [
        background(out, 'bed-fire-1', { gain: 0.35 }),
        tune(out, { bpm: 84, notes: SONGS.hall, voice: VOICES.pluck, gain: 0.05, chords: [[50, 57, 62], [48, 55, 60], [53, 57, 60], [50, 57, 62]], every: 8, comp: strum(0.025) }),
      ];
    },
    club(out) {
      const bass = [45, 45, 48, 43];
      return [
        sequencer(122, (t, n) => {
          const beat = n % 4;
          note(out, t, { freq: 150, to: 50, len: 0.28, gain: 0.4, type: 'sine' }); // kick
          hit(out, t + 30 / 122, { freq: 8000, gain: 0.04, len: 0.05 }); // offbeat hat
          if (beat === 1 || beat === 3) hit(out, t, { type: 'bandpass', freq: 1500, q: 0.8, gain: 0.06, len: 0.12 }); // clap
          note(out, t + 30 / 122, { freq: hz(bass[Math.floor(n / 4) % 4] + 12), len: 0.22, gain: 0.1, type: 'sawtooth' });
        }),
      ];
    },
    castle(out) {
      // Wind and drips in the stone halls, and a harp.
      return [
        background(out, 'bed-castle-1', { gain: 0.5 }),
        tune(out, { bpm: 60, notes: SONGS.hall, voice: VOICES.pluck, gain: 0.05, chords: [[50, 57], [48, 55], [53, 60], [50, 57]], every: 8, comp: strum(0.025) }),
      ];
    },
    jazz(out) {
      // Bb blues, walking, with brushes on the ride.
      const walk = [46, 48, 49, 50, 51, 53, 55, 56, 58];
      let i = 0;
      const chords = [[58, 62, 65, 68], [63, 67, 70, 73]];
      return [
        sequencer(112, (t, n, dur) => {
          i = Math.max(0, Math.min(walk.length - 1, i + pick([-2, -1, 1, 1, 2])));
          note(out, t, { freq: hz(walk[i]), len: dur * 0.9, gain: 0.14, type: 'triangle', attack: 0.01 });
          if (n % 2 === 1) hit(out, t + dur * 0.66, { type: 'bandpass', freq: 7000, q: 2, gain: 0.02, len: 0.15 }); // swung ride
          if (n % 8 === 0 || (n % 8 === 5 && Math.random() < 0.5)) {
            for (const m of chords[Math.floor(n / 8) % 2]) note(out, t + Math.random() * 0.03, { freq: hz(m), len: 1.4, gain: 0.03, type: 'sine', attack: 0.01 });
          }
        }),
      ];
    },
    diner(out) {
      // Doo-wop on the jukebox, and "order up!" now and then.
      return [
        tune(out, { bpm: 66, notes: SONGS.doowop, voice: VOICES.keys, gain: 0.05, chords: [[48, 64, 67], [45, 64, 69], [41, 65, 69], [43, 62, 67]], every: 8, comp: strum(0.03, 'keys') }),
        now(30, (t) => { note(out, t, { freq: 2093, len: 1.2, gain: 0.04, type: 'sine' }); note(out, t, { freq: 4186, len: 0.6, gain: 0.01, type: 'sine' }); }),
      ];
    },
    tiki(out) {
      // Waves lapping on the beach, and the band: a calypso on the steel pan, a ukulele strumming
      // the calypso rhythm, bongos, a conga and a shaker.
      const bpm = 104;
      const chords = [[67, 72, 76, 79], [65, 69, 72, 77], [67, 71, 74, 79], [67, 72, 76, 79], [67, 72, 76, 79], [67, 71, 74, 79], [67, 71, 74, 79], [67, 72, 76, 79]];
      return [
        background(out, 'bed-waves-3', { gain: 0.3 }),
        tune(out, { bpm, notes: SONGS.calypso, voice: VOICES.steelpan, gain: 0.05 }),
        sequencer(bpm * 2, (t, n) => {
          const beat = n % 8;
          // Ukulele: down, down-up, up-down-up (the calypso strum).
          if ([0, 2, 3, 5, 6].includes(beat)) chords[Math.floor(n / 8) % chords.length].forEach((m, i) => note(out, t + i * 0.012, { freq: hz(m), len: 0.25, gain: beat === 0 ? 0.022 : 0.014, type: 'triangle', attack: 0.002 }));
          // Conga on the one, bongos on the off-beats, a shaker underneath.
          if (beat === 0 || beat === 4) note(out, t, { freq: 180, to: 120, len: 0.25, gain: 0.08, type: 'sine', attack: 0.003 });
          if (beat === 3 || beat === 7) note(out, t, { freq: 420, to: 340, len: 0.12, gain: 0.05, type: 'sine', attack: 0.002 });
          hit(out, t, { type: 'bandpass', freq: 6500, q: 1.5, gain: beat % 2 ? 0.006 : 0.01, len: 0.05, attack: 0.003 });
        }),
      ];
    },
    speakeasy(out) {
      // Clinking glasses and a piano in the corner.
      const chords = [[57, 60, 64, 67], [55, 59, 62, 65], [53, 57, 60, 64], [52, 56, 59, 62]];
      return [
        now(8, (t) => note(out, t, { freq: 2800 + Math.random() * 900, len: 0.4, gain: 0.025, type: 'sine' })),
        sequencer(84, (t, n) => {
          if (n % 2) return;
          const c = chords[Math.floor(n / 8) % 4];
          note(out, t, { freq: hz(c[0] - 12), len: 0.9, gain: 0.07 });
          c.slice(1).forEach((m) => note(out, t + 0.36, { freq: hz(m), len: 0.6, gain: 0.025, type: 'sine' }));
        }),
      ];
    },
    casino(out) {
      // A lounge band, chips stacking and the odd slot machine paying out.
      return [
        tune(out, { bpm: 80, notes: SONGS.lounge, voice: VOICES.keys, gain: 0.05, chords: [[48, 64, 71], [45, 60, 67], [50, 65, 72], [43, 65, 71]], every: 8, comp: strum(0.025, 'keys') }),
        now(4, (t) => play(out, ['cue-chips-1', 'cue-chips-2', 'cue-chips-3'], t, { gain: 0.5 })),
        now(20, (t) => { for (let k = 0; k < 8; k++) note(out, t + k * 0.07, { freq: hz(pick([84, 88, 91, 96])), len: 0.2, gain: 0.02, type: 'sine' }); }),
      ];
    },
    saloon(out) {
      // A honky-tonk piano, a little out of tune.
      const prog = [[48, [64, 67, 72]], [53, [65, 69, 72]], [55, [62, 67, 71]], [48, [64, 67, 72]]];
      return [
        sequencer(150, (t, n) => {
          const [bass, chord] = prog[Math.floor(n / 4) % 4];
          if (n % 2 === 0) note(out, t, { freq: hz(bass - (n % 4 === 2 ? 5 : 0)), len: 0.3, gain: 0.1 });
          else chord.forEach((m) => { note(out, t, { freq: hz(m) * 1.004, len: 0.22, gain: 0.025, type: 'triangle' }); note(out, t, { freq: hz(m) * 0.996, len: 0.22, gain: 0.02, type: 'triangle' }); });
        }),
      ];
    },
    pirate(out) {
      // The sea against the hull, timbers creaking, gulls, and the crew's squeezebox: Drunken Sailor.
      return [
        background(out, 'bed-waves-1', { gain: 0.35 }),
        tune(out, { bpm: 104, notes: SONGS.sailor, voice: VOICES.squeeze, gain: 0.04 }),
        now(14, (t) => play(out, 'cue-creak-2', t, { gain: 0.6 })),
        now(20, (t) => play(out, ['cue-gull-1', 'cue-gull-2'], t, { gain: 0.35 })),
      ];
    },
    beerhall(out) {
      // Oompah: tuba on the beat, the band on the off-beat.
      const prog = [[43, [67, 71, 74]], [38, [66, 69, 72]], [38, [66, 69, 72]], [43, [67, 71, 74]]];
      return [
        sequencer(116, (t, n) => {
          const [bass, chord] = prog[Math.floor(n / 4) % 4];
          if (n % 2 === 0) note(out, t, { freq: hz(bass + 12 + (n % 4 === 2 ? 7 : 0)), len: 0.35, gain: 0.12, type: 'triangle', attack: 0.02 });
          else chord.forEach((m) => note(out, t, { freq: hz(m), len: 0.18, gain: 0.025, type: 'triangle' }));
        }),
      ];
    },
    space(out) {
      // Space winds, and the odd bleep from the ship's computer.
      return [
        background(out, 'bed-space-1', { gain: 0.45 }),
        tune(out, { bpm: 50, notes: SONGS.hall, voice: VOICES.keys, gain: 0.03 }),
        now(14, (t) => { for (let k = 0; k < 3; k++) note(out, t + k * 0.12, { freq: hz(pick([84, 88, 91, 95])), len: 0.1, gain: 0.02, type: 'sine' }); }),
      ];
    },
    // The Lighthouse, in all its weathers: the sea below and Shenandoah, on whatever suits.
    storm(out) {
      // Rain lashing down, and Shenandoah on the organ, low. Thunder and the big waves come with
      // what's on screen.
      return [
        background(out, 'bed-rain-1', { gain: 0.4, lowpass: 3500 }),
        tune(out, { bpm: 48, notes: SONGS.shenandoah, voice: VOICES.organ, gain: 0.025 }),
      ];
    },
    lighthouse(out) {
      // Waves on the rocks below, and a buoy bell out at sea.
      return [
        background(out, 'bed-waves-1', { gain: 0.35 }),
        tune(out, { bpm: 54, notes: SONGS.shenandoah, voice: VOICES.whistle, gain: 0.03 }),
        now(24, (t) => { note(out, t, { freq: 740, len: 2.4, gain: 0.03, type: 'sine' }); note(out, t, { freq: 1850, len: 1.2, gain: 0.01, type: 'sine' }); }),
      ];
    },
    lighthouseDay(out) {
      // A calm sea in the sun, gulls, and the buoy bell far out.
      return [
        background(out, 'bed-waves-3', { gain: 0.4 }),
        tune(out, { bpm: 66, notes: SONGS.shenandoah, voice: VOICES.pluck, gain: 0.04 }),
        now(12, (t) => play(out, ['cue-gull-1', 'cue-gull-2'], t, { gain: 0.35 })),
      ];
    },
    // Regatta day: the calm sea, gulls, the shanty on the squeezebox and horns now and then.
    lighthouseRegatta(out) {
      return [
        background(out, 'bed-waves-3', { gain: 0.35 }),
        tune(out, { bpm: 112, notes: SONGS.sailor, voice: VOICES.squeeze, gain: 0.035 }),
        now(10, (t) => play(out, ['cue-gull-1', 'cue-gull-2'], t, { gain: 0.35 })),
        now(30, (t) => CUES.horn(out, t)),
      ];
    },
    lighthouseFog(out) {
      // Fog muffles everything: the sea, faintly. The foghorn comes with the scenery.
      return [
        background(out, 'bed-waves-3', { gain: 0.3, lowpass: 1200 }),
        tune(out, { bpm: 48, notes: SONGS.shenandoah, voice: VOICES.organ, gain: 0.02 }),
      ];
    },
    christmas(out) {
      // The fire, a music box, and sleigh bells now and then.
      const scale = [72, 74, 76, 79, 81, 84];
      return [
        background(out, 'bed-fire-1', { gain: 0.3 }),
        sequencer(100, (t, n) => {
          if (n % 32 < 4) for (let k = 0; k < 2; k++) note(out, t + k * 0.15, { freq: 2637 + Math.random() * 300, len: 0.15, gain: 0.012, type: 'sine' });
          if (n % 2 === 0 && Math.random() < 0.7) note(out, t, { freq: hz(pick(scale)), len: 1.2, gain: 0.04, type: 'sine' });
        }),
      ];
    },
    halloween(out) {
      // Crickets in the dark, the organ, an owl, a door creaking. Thunder, the wolf and the
      // horseman's hooves come with what's on screen (cue(), from public/scenery.js).
      return [
        background(out, 'bed-crickets-1', { gain: 0.14, lowpass: 6000 }),
        tune(out, { bpm: 60, notes: SONGS.toccata, voice: VOICES.organ, gain: 0.03 }),
        now(18, (t) => { note(out, t, { freq: 440, to: 400, len: 0.35, gain: 0.035, type: 'sine', attack: 0.05 }); note(out, t + 0.5, { freq: 430, to: 380, len: 0.6, gain: 0.035, type: 'sine', attack: 0.05 }); }),
        now(30, (t) => play(out, 'cue-creak-1', t, { gain: 0.5 })),
      ];
    },
    // Under the pergola in Tuscany: a mandolin serenade over a guitar, birds in the vines (crickets
    // and an owl once the sun's going down).
    vineyard: (out) => [
      tune(out, { bpm: 92, notes: SONGS.serenade, voice: VOICES.mandolin, gain: 0.03, chords: VINE_CHORDS, every: 6, comp: strum(0.03) }),
      now(9, (t) => birdsong(out, t)),
    ],
    vineyardSunset: (out) => [
      background(out, 'bed-crickets-1', { gain: 0.12, lowpass: 5000 }),
      tune(out, { bpm: 80, notes: SONGS.serenade, voice: VOICES.mandolin, gain: 0.028, chords: VINE_CHORDS, every: 6, comp: strum(0.028) }),
      now(26, (t) => { note(out, t, { freq: 440, to: 400, len: 0.35, gain: 0.03, type: 'sine', attack: 0.05 }); note(out, t + 0.5, { freq: 430, to: 380, len: 0.6, gain: 0.03, type: 'sine', attack: 0.05 }); }),
    ],
    // The château's terrace: an accordion playing a musette waltz, birds in the garden, the church
    // bell in the village now and then (at night, the waltz on a piano inside, and crickets).
    chateau: (out) => [
      tune(out, { bpm: 96, notes: SONGS.musette, voice: VOICES.squeeze, gain: 0.03, chords: MUSETTE_CHORDS, every: 6, comp: strum(0.025) }),
      now(10, (t) => birdsong(out, t)),
      now(45, (t) => { for (let k = 0; k < 3; k++) note(out, t + k * 1.6, { freq: 523, len: 3, gain: 0.02, type: 'sine' }); }),
    ],
    chateauNight: (out) => [
      background(out, 'bed-crickets-1', { gain: 0.12, lowpass: 5000 }),
      tune(out, { bpm: 84, notes: SONGS.musette, voice: VOICES.piano, gain: 0.045, chords: MUSETTE_CHORDS, every: 6, comp: strum(0.025) }),
    ],
    // The easter eggs. The château burning: the fire, the drums of the revolution, the mob.
    chateauRevolution: (out) => [
      background(out, 'bed-fire-1', { gain: 0.45 }),
      sequencer(112, (t, n) => {
        const s = n % 16;
        if (s === 0 || s === 8) hit(out, t, { type: 'lowpass', freq: 140, gain: 0.12, len: 0.3, attack: 0.002 });
        if (s % 4 === 0 || s >= 13) hit(out, t, { type: 'bandpass', freq: 1900, q: 0.7, gain: s % 4 === 0 ? 0.05 : 0.025, len: 0.1, attack: 0.001 });
      }, { div: 4 }),
      now(35, (t) => CUES.mob(out, t)),
    ],
    // Aboard the Dutchman: the sea, the organ, the timbers groaning and the bell.
    pirateDutchman: (out) => [
      background(out, 'bed-waves-1', { gain: 0.3, lowpass: 1600 }),
      tune(out, { bpm: 52, notes: SONGS.dirge, voice: VOICES.organ, gain: 0.03, chords: [[38, 50, 57], [41, 53, 57], [43, 55, 58], [38, 50, 57], [41, 53, 57], [46, 53, 58], [45, 52, 57], [38, 50, 57]], every: 8, comp: held(0.012) }),
      now(16, (t) => play(out, ['cue-creak-1', 'cue-creak-2'], t, { gain: 0.6 })),
      now(50, (t) => CUES.toll(out, t)),
    ],
    // The frat house: a party beat through someone's speaker, and the room chanting now and then.
    frat: (out) => [
      sequencer(96, (t, n) => {
        const s = n % 8;
        if (s === 0 || s === 3 || s === 5) note(out, t, { freq: 120, to: 42, len: 0.32, gain: 0.3, type: 'sine' });
        if (s === 2 || s === 6) hit(out, t, { type: 'bandpass', freq: 1700, q: 0.8, gain: 0.07, len: 0.14, attack: 0.001 });
        hit(out, t, { freq: 9000, gain: 0.015, len: 0.04 });
        if (s === 0) note(out, t, { freq: hz([45, 43, 41, 40][Math.floor(n / 8) % 4]), len: 0.9, gain: 0.08, type: 'sawtooth' });
      }, { div: 2 }),
      now(30, (t) => CUES.chant(out, t)),
      now(18, (t) => CUES.pop(out, t)),
    ],
    // Noir: rain against the glass, a slow, smoky tune in a minor key, thunder now and then.
    speakeasyNoir: (out) => [
      background(out, 'bed-rain-1', { gain: 0.25, lowpass: 2500 }),
      tune(out, { bpm: 56, notes: SONGS.noir, voice: VOICES.squeeze, gain: 0.03, chords: [[45, 52, 60], [45, 52, 60], [50, 57, 65], [52, 59, 64]], every: 8, comp: held(0.008) }),
      now(50, (t) => play(out, ['cue-thunder-1', 'cue-thunder-2'], t, { gain: 0.3 })),
    ],
    // The riverboat: the river lapping, a ragtime piano, the paddles churning and the whistle.
    saloonRiverboat: (out) => [
      background(out, 'bed-waves-3', { gain: 0.2, lowpass: 1400 }),
      ...ROOMS.saloon(out),
      now(14, (t) => { for (let k = 0; k < 6; k++) hit(out, t + k * 0.5, { type: 'bandpass', freq: 300, q: 0.6, gain: 0.04, len: 0.3, attack: 0.05 }); }),
      now(45, (t) => CUES.whistle(out, t)),
    ],
    // The mead hall: the fire, a slow drum and a bowed drone; the lur (a long horn) now and then.
    tavernMeadhall: (out) => [
      background(out, 'bed-fire-1', { gain: 0.45 }),
      sequencer(72, (t, n) => {
        if (n % 4 === 0 || n % 4 === 3) note(out, t, { freq: 70, to: 42, len: 0.6, gain: 0.18, type: 'sine' });
        if (n % 16 === 0) for (const m of [38, 45]) note(out, t, { freq: hz(m), len: 3.2, gain: 0.03, type: 'sawtooth', attack: 0.8 });
      }),
      now(40, (t) => CUES.lur(out, t)),
    ],
    // The roller rink: synth-pop, four on the floor, with an arpeggio over it.
    dinerRink: (out) => [
      sequencer(118, (t, n) => {
        const s = n % 8;
        if (s % 2 === 0) note(out, t, { freq: 130, to: 48, len: 0.25, gain: 0.25, type: 'sine' });
        if (s === 2 || s === 6) hit(out, t, { type: 'bandpass', freq: 1600, q: 0.8, gain: 0.05, len: 0.12, attack: 0.001 });
        const chord = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]][Math.floor(n / 16) % 4];
        note(out, t, { freq: hz(chord[s % 3] + 12), len: 0.18, gain: 0.02, type: 'square', attack: 0.005 });
        if (s === 0) note(out, t, { freq: hz(chord[0] - 12), len: 0.9, gain: 0.07, type: 'sawtooth' });
      }, { div: 2 }),
    ],
    // The championship: the party, louder, the crowd chanting more often.
    fratChampionship: (out) => [...ROOMS.frat(out), now(20, (t) => CUES.chant(out, t))],
    // The garage: the radio playing rock, low; the impact wrench now and then.
    garage: (out) => [
      sequencer(112, (t, n) => {
        const s = n % 8;
        if (s === 0 || s === 4 || s === 5) note(out, t, { freq: 110, to: 45, len: 0.25, gain: 0.18, type: 'sine' });
        if (s === 2 || s === 6) hit(out, t, { type: 'bandpass', freq: 1800, q: 0.7, gain: 0.05, len: 0.14, attack: 0.001 });
        if (s % 2 === 0) CUES.chord(out, t, [40, 47, 52][Math.floor(n / 16) % 3], 0.22);
      }, { div: 2 }),
      now(26, (t) => CUES.wrench(out, t)),
    ],
    // The starship: the space lounge's music, the engines humming, and the bridge's computer.
    spaceStarship: (out) => [
      ...ROOMS.space(out),
      now(20, (t) => note(out, t, { freq: 55, to: 50, len: 6, gain: 0.05, type: 'sawtooth', attack: 2 })),
      now(11, (t) => { for (let k = 0; k < 4; k++) note(out, t + k * 0.1, { freq: hz(pick([84, 88, 91, 96])), len: 0.08, gain: 0.015, type: 'square' }); }),
    ],
    // Open mic night: the jazz trio, low, between the acts.
    jazzOpenMic: (out) => ROOMS.jazz(out),
    // Oktoberfest: the oompah band, and someone yodelling.
    beerhallOktoberfest: (out) => [...ROOMS.beerhall(out), now(40, (t) => CUES.yodel(out, t))],
    // The wasteland: the wind, war drums, and the guitar now and then.
    garageWasteland: (out) => [
      background(out, 'bed-castle-1', { gain: 0.35, lowpass: 1200 }),
      sequencer(96, (t, n) => {
        const s = n % 8;
        if (s === 0 || s === 3 || s === 4 || s === 6) note(out, t, { freq: s === 0 ? 70 : 95, to: 45, len: 0.4, gain: 0.16, type: 'sine' });
      }, { div: 2 }),
      now(32, (t) => CUES.riff(out, t)),
    ],
    // The Darts Palace: a big crowd humming under it all, and singing now and then.
    diveChampionship: (out) => [
      now(9, (t) => hit(out, t, { type: 'bandpass', freq: 600, q: 0.5, gain: 0.025, len: 4, attack: 1.5 })),
      now(28, (t) => CUES.chant(out, t)),
    ],
    // The tournament: a crowd out of doors, a lute playing the hall tune, and the herald now and then.
    castleTournament: (out) => [
      tune(out, { bpm: 84, notes: SONGS.hall, voice: VOICES.pluck, gain: 0.05, chords: [[50, 57], [48, 55], [53, 60], [50, 57]], every: 8, comp: strum(0.025) }),
      now(12, (t) => birdsong(out, t)),
      now(40, (t) => CUES.fanfare?.(out, t)),
    ],
    // Monte Carlo: the Blue Danube on the piano, and the chips.
    casinoMonteCarlo: (out) => [
      tune(out, { bpm: 132, notes: SONGS.danube, voice: VOICES.piano, gain: 0.04, chords: DANUBE_CHORDS, every: 6, comp: waltz(0.03) }),
      now(6, (t) => play(out, ['cue-chips-1', 'cue-chips-2', 'cue-chips-3'], t, { gain: 0.4 })),
    ],
    stpatricks: (out) => session(out),
    // The rain outside the windows, with thunder far off (the windows flicker first, on screen).
    stpatricksRain: (out) => [...session(out, 0.8, 'bed-rain-1')],
    stpatricksFog: (out) => session(out, 0.8),
  };

  // ---------- One-off sounds, in time with the scenery ----------

  const CUES = {
    // Rolling thunder after the lightning.
    thunder(out, t) {
      play(out, 'cue-thunder-1', t, { gain: 0.9 });
    },
    // Thunder a long way off: a low rumble that rolls on.
    thunderFar(out, t) {
      play(out, 'cue-thunder-2', t, { gain: 0.45, lowpass: 700 });
    },
    // A big wave breaking on the rocks below.
    crash(out, t) {
      play(out, ['cue-wave-1', 'cue-wave-2', 'cue-wave-3'], t, { gain: 0.9 });
    },
    // Santa's sleigh bells going over.
    sleighbells(out, t) {
      for (let k = 0; k < 30; k++) note(out, t + k * 0.07 + Math.random() * 0.03, { freq: 2637 + Math.random() * 600, len: 0.12, gain: 0.012 + 0.012 * Math.sin((k / 30) * Math.PI), type: 'sine' });
    },
    // A flying saucer: a wobbling whine that rises and falls away.
    ufo(out, t) {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(500, t);
      o.frequency.linearRampToValueAtTime(900, t + 1);
      o.frequency.linearRampToValueAtTime(600, t + 2.2);
      const vib = ac.createOscillator();
      vib.frequency.value = 9;
      const vd = ac.createGain();
      vd.gain.value = 40;
      vib.connect(vd).connect(o.frequency);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.02, t + 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g).connect(out);
      o.start(t); vib.start(t);
      o.stop(t + 2.3); vib.stop(t + 2.3);
    },
    // The tavern cat.
    meow(out, t) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(480, t);
      o.frequency.linearRampToValueAtTime(760, t + 0.2);
      o.frequency.linearRampToValueAtTime(420, t + 0.7);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 2;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.8);
    },
    // A dart into the board.
    thud(out, t) {
      hit(out, t, { type: 'lowpass', freq: 400, gain: 0.25, len: 0.12, attack: 0.002 });
    },
    // A dragon going over: a low growl that swells.
    roar(out, t) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(90, t);
      o.frequency.linearRampToValueAtTime(140, t + 0.6);
      o.frequency.linearRampToValueAtTime(70, t + 1.8);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 2);
    },
    // A knight's armour clinking along.
    clank(out, t) {
      for (let k = 0; k < 10; k++) note(out, t + k * 0.42 + Math.random() * 0.05, { freq: 1500 + Math.random() * 500, len: 0.12, gain: 0.015, type: 'triangle' });
    },
    // The cops going past outside: a siren far off, rising and falling.
    siren(out, t) {
      const o = ac.createOscillator();
      o.type = 'triangle';
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.7;
      const d = ac.createGain();
      d.gain.value = 140;
      o.frequency.value = 760;
      lfo.connect(d).connect(o.frequency);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.02, t + 1.5);
      g.gain.linearRampToValueAtTime(0.0001, t + 5);
      o.connect(g).connect(out);
      o.start(t); lfo.start(t);
      o.stop(t + 5.1); lfo.stop(t + 5.1);
    },
    // The room cheering a winning roll: a rising "whoo!" from a few voices, and claps.
    cheer(out, t) {
      for (const [f0, d] of [[260, 0], [330, 0.05], [400, 0.1], [220, 0.12]]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t + d);
        o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + d + 0.5);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + d + 1.1);
        const f = ac.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1100;
        f.Q.value = 1.2;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.linearRampToValueAtTime(0.018, t + d + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.2);
        o.connect(f).connect(g).connect(out);
        o.start(t + d);
        o.stop(t + d + 1.25);
      }
      for (let k = 0; k < 16; k++) hit(out, t + 0.3 + k * 0.09 + Math.random() * 0.05, { type: 'bandpass', freq: 1800 + Math.random() * 800, q: 1.5, gain: 0.03, len: 0.04, attack: 0.001 });
    },
    // The room going "awww" at a losing roll: a few voices falling away.
    aww(out, t) {
      for (const [f0, d] of [[300, 0], [250, 0.06], [350, 0.1]]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t + d);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + d + 1.1);
        const f = ac.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 800;
        f.Q.value = 1.5;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.linearRampToValueAtTime(0.02, t + d + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.2);
        o.connect(f).connect(g).connect(out);
        o.start(t + d);
        o.stop(t + d + 1.25);
      }
    },
    // The Marseillaise on two trumpets: "Allons enfants de la Patrie, le jour de gloire est arrivé!"
    marseillaise(out, t) {
      const q = 0.32;
      const tune_ = [[62, 0.75], [62, 0.25], [62, 1], [67, 1], [67, 1], [69, 1], [69, 1], [74, 1.5], [71, 0.5],
        [67, 0.75], [67, 0.25], [71, 0.75], [67, 0.25], [64, 1], [72, 2], [69, 0.75], [66, 0.25], [67, 2.5]];
      let at = t;
      for (const [m, beats] of tune_) {
        brass(out, at, hz(m + 12), beats * q * 0.92, 0.05);
        brass(out, at, hz(m), beats * q * 0.92, 0.025);
        at += beats * q;
      }
      // A drum roll under the last note.
      for (let k = 0; k < 14; k++) hit(out, at - 2.5 * q + k * 0.05, { type: 'bandpass', freq: 1900, q: 0.7, gain: 0.03, len: 0.08, attack: 0.001 });
      hit(out, at - 2.5 * q, { type: 'lowpass', freq: 120, gain: 0.25, len: 1, attack: 0.002 });
    },
    // A power chord (root, fifth, octave) through a crunchy, filtered saw: the garage radio, the wasteland.
    chord(out, t, root, len = 0.3, gain = 0.02) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      f.connect(out);
      for (const m of [0, 7, 12]) note(f, t, { freq: hz(root + m), len, gain, type: 'sawtooth', attack: 0.005 });
    },
    // A guitar riff: four power chords.
    riff(out, t) {
      [[40, 0.4], [43, 0.2], [45, 0.4], [40, 0.8]].reduce((at, [m, len]) => { CUES.chord(out, at, m, len, 0.035); return at + len; }, t);
    },
    rumble(out, t) { note(out, t, { freq: 60, to: 40, len: 2.5, gain: 0.12, type: 'sawtooth', attack: 0.6 }); },
    wind(out, t) { hit(out, t, { type: 'bandpass', freq: 500, q: 0.4, gain: 0.08, len: 5, attack: 2 }); },
    // An impact wrench: zzt-zzt.
    wrench(out, t) {
      for (const d of [0, 0.35]) for (let k = 0; k < 10; k++) hit(out, t + d + k * 0.018, { type: 'bandpass', freq: 2400, q: 2, gain: 0.04, len: 0.02, attack: 0.001 });
    },
    weld(out, t) { for (let k = 0; k < 12; k++) hit(out, t + k * 0.06 + Math.random() * 0.04, { freq: 5000, gain: 0.03, len: 0.04, attack: 0.001 }); },
    // Air brakes: a hiss.
    brakes(out, t) { hit(out, t + 0.2, { freq: 3000, gain: 0.08, len: 1, attack: 0.02 }); note(out, t, { freq: 300, to: 180, len: 0.4, gain: 0.03, type: 'square' }); },
    // A rimshot: ba-dum... tss.
    rimshot(out, t) {
      note(out, t, { freq: 180, to: 120, len: 0.2, gain: 0.15, type: 'sine' });
      note(out, t + 0.18, { freq: 140, to: 90, len: 0.25, gain: 0.15, type: 'sine' });
      hit(out, t + 0.42, { freq: 6000, gain: 0.09, len: 0.9, attack: 0.002 });
    },
    // Crickets: chirp chirp, in the silence.
    crickets(out, t) {
      for (let c = 0; c < 4; c++) for (let k = 0; k < 3; k++) note(out, t + c * 0.7 + k * 0.05, { freq: 4400, len: 0.03, gain: 0.02, type: 'sine', attack: 0.002 });
    },
    snaps(out, t) { for (let k = 0; k < 6; k++) hit(out, t + k * 0.4 + Math.random() * 0.05, { type: 'bandpass', freq: 2600, q: 3, gain: 0.08, len: 0.05, attack: 0.001 }); },
    // A yodel: leaping up and down between the chest voice and the falsetto.
    yodel(out, t) {
      [[67, 0.2], [79, 0.2], [72, 0.2], [84, 0.3], [76, 0.2], [79, 0.5]].reduce((at, [m, len]) => {
        note(out, at, { freq: hz(m), len: len * 1.1, gain: 0.03, type: 'triangle', attack: 0.02 });
        return at + len;
      }, t);
    },
    // The crowd singing: 'Oi! Oi! Oi!', three shouts on a beat.
    chant(out, t) {
      for (let k = 0; k < 3; k++) {
        hit(out, t + k * 0.55, { type: 'bandpass', freq: 700, q: 1.4, gain: 0.07, len: 0.35, attack: 0.03 });
        for (const f of [196, 247, 294]) note(out, t + k * 0.55, { freq: f, to: f * 0.8, len: 0.35, gain: 0.012, type: 'sawtooth', attack: 0.03 });
      }
    },
    // The mob: a roar that swells and fades, and a cheer in it.
    mob(out, t) {
      hit(out, t, { type: 'bandpass', freq: 520, q: 0.6, gain: 0.07, len: 3, attack: 0.9 });
      hit(out, t + 0.3, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.04, len: 2.5, attack: 0.8 });
      CUES.cheer(out, t + 0.6);
    },
    // A window going in.
    shatter(out, t) {
      hit(out, t, { type: 'highpass', freq: 3500, gain: 0.12, len: 0.35, attack: 0.001 });
      for (let k = 0; k < 12; k++) note(out, t + 0.05 + k * 0.035 + Math.random() * 0.03, { freq: 3000 + Math.random() * 4000, len: 0.18, gain: 0.012, type: 'sine', attack: 0.001 });
    },
    // A great ship's bell, tolling once.
    toll(out, t) {
      for (const [mult, g, len] of [[1, 0.05, 4.5], [2, 0.025, 3], [2.4, 0.02, 2.5], [3, 0.015, 2], [4.2, 0.01, 1.4]]) note(out, t, { freq: 174 * mult, len, gain: g, type: 'sine', attack: 0.004 });
    },
    // A ghost's moan, low and wavering.
    moan(out, t) {
      note(out, t, { freq: 230, to: 150, len: 2.6, gain: 0.03, type: 'sine', attack: 0.9 });
      note(out, t + 0.1, { freq: 236, to: 156, len: 2.4, gain: 0.02, type: 'sine', attack: 0.9 });
    },
    // A harp, rippling up.
    harp(out, t) {
      [62, 66, 69, 74, 78, 81, 86, 90].forEach((m, k) => note(out, t + k * 0.07, { freq: hz(m), len: 1.4, gain: 0.03, type: 'triangle', attack: 0.003 }));
    },
    // The roulette ball rattling round and slowing, then dropping in.
    spin(out, t) {
      let at = t;
      for (let k = 0; k < 34; k++) {
        hit(out, at, { type: 'highpass', freq: 3200, gain: 0.03, len: 0.03, attack: 0.001 });
        at += 0.06 * (1 + k * 0.09);
      }
      hit(out, at + 0.1, { type: 'bandpass', freq: 1800, gain: 0.08, len: 0.12, attack: 0.001 });
    },
    // A flash bulb going off: a pop and a fizz.
    flashbulb(out, t) { hit(out, t, { type: 'highpass', freq: 2000, gain: 0.12, len: 0.12, attack: 0.001 }); hit(out, t + 0.05, { freq: 6000, gain: 0.03, len: 0.6, attack: 0.01 }); },
    // A stab of brass.
    sting(out, t) { for (const m of [57, 60, 64, 68]) brass(out, t, hz(m), 0.9, 0.018); },
    // A car going by in the rain.
    car(out, t) { hit(out, t, { type: 'bandpass', freq: 700, q: 0.5, gain: 0.06, len: 2.5, attack: 1 }); },
    // A police siren, far off, wailing past.
    siren(out, t) { for (let k = 0; k < 3; k++) note(out, t + k * 1.2, { freq: 600, to: 900, len: 1.1, gain: 0.012, type: 'sine', attack: 0.3 }); },
    // A steamboat's whistle: a chord, breathy, long then short.
    whistle(out, t) {
      for (const [d, len] of [[0, 1.4], [1.6, 0.6]]) {
        for (const f of [392, 494, 587]) note(out, t + d, { freq: f, len, gain: 0.02, type: 'sawtooth', attack: 0.08 });
        hit(out, t + d, { type: 'bandpass', freq: 2500, q: 0.8, gain: 0.03, len, attack: 0.08 });
      }
    },
    // A lur: a long, low bronze horn call, rising and falling.
    lur(out, t) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      f.connect(out);
      [[45, 1.2], [52, 0.8], [50, 1.8]].reduce((at, [m, len]) => { note(f, at, { freq: hz(m), len, gain: 0.06, type: 'sawtooth', attack: 0.15 }); return at + len * 0.9; }, t);
    },
    // An air horn: three blasts.
    airhorn(out, t) {
      for (const [d, len] of [[0, 0.25], [0.32, 0.25], [0.64, 0.7]]) for (const f of [440, 554]) note(out, t + d, { freq: f, len, gain: 0.03, type: 'sawtooth', attack: 0.01 });
    },
    // The ship's computer: a couple of blips.
    beep(out, t) { [88, 93].forEach((m, k) => note(out, t + k * 0.12, { freq: hz(m), len: 0.1, gain: 0.025, type: 'square' })); },
    // Red alert: a two-tone klaxon, three times.
    alarm(out, t) { for (let k = 0; k < 3; k++) note(out, t + k * 0.8, { freq: 440, to: 660, len: 0.6, gain: 0.03, type: 'square', attack: 0.02 }); },
    // The jump to lightspeed: a rising whine and a boom.
    warp(out, t) {
      note(out, t, { freq: 80, to: 1200, len: 1.4, gain: 0.04, type: 'sawtooth', attack: 0.6 });
      hit(out, t + 1.3, { type: 'lowpass', freq: 200, gain: 0.3, len: 1.2, attack: 0.005 });
    },
    // A Grand Prix car going by: up as it comes, down as it goes.
    vroom(out, t) {
      note(out, t, { freq: 240, to: 320, len: 0.6, gain: 0.03, type: 'sawtooth', attack: 0.3 });
      note(out, t + 0.6, { freq: 260, to: 110, len: 1.1, gain: 0.03, type: 'sawtooth', attack: 0.01 });
    },
    // A gunshot in the saloon, and the ricochet.
    bang(out, t) {
      hit(out, t, { type: 'lowpass', freq: 900, gain: 0.5, len: 0.35, attack: 0.001 });
      hit(out, t, { type: 'bandpass', freq: 2500, q: 0.8, gain: 0.25, len: 0.08, attack: 0.001 });
      note(out, t + 0.12, { freq: 3200, to: 900, len: 0.5, gain: 0.02, type: 'sine', attack: 0.01 });
    },
    // A glass sliding down the bar, then stopping.
    slide(out, t) {
      for (let k = 0; k < 12; k++) hit(out, t + k * 0.12, { type: 'bandpass', freq: 900 + k * 30, q: 3, gain: 0.012 * (1 - k / 12), len: 0.08 });
      note(out, t + 1.5, { freq: 1320, len: 0.4, gain: 0.02, type: 'triangle' });
    },
    // Dice rattling across the table.
    dice(out, t) {
      for (let k = 0; k < 7; k++) hit(out, t + k * 0.09 + Math.random() * 0.04, { type: 'bandpass', freq: 2200 + Math.random() * 800, q: 4, gain: 0.05, len: 0.03, attack: 0.001 });
    },
    // A cork popping.
    pop(out, t) {
      note(out, t, { freq: 600, to: 180, len: 0.12, gain: 0.12, type: 'sine', attack: 0.002 });
      hit(out, t, { type: 'bandpass', freq: 1500, q: 1, gain: 0.08, len: 0.05, attack: 0.001 });
    },
    // The herald's fanfare.
    fanfare(out, t) {
      [[67, 0.2], [72, 0.2], [76, 0.2], [79, 0.7]].reduce((at, [m, len]) => { note(out, t + at, { freq: hz(m), len, gain: 0.04, type: 'sawtooth', attack: 0.02 }); return at + len; }, 0);
    },
    // A patty hitting the grill.
    sizzle(out, t) {
      for (let k = 0; k < 20; k++) hit(out, t + k * 0.05 + Math.random() * 0.03, { type: 'bandpass', freq: 3000 + Math.random() * 2000, q: 2, gain: 0.008, len: 0.04, attack: 0.002 });
    },
    // A tiki drum: two low beats.
    drum(out, t) {
      for (const at of [0, 0.35]) note(out, t + at, { freq: 140, to: 70, len: 0.35, gain: 0.14, type: 'sine', attack: 0.003 });
    },
    // A cocktail shaker going.
    shaker(out, t) {
      for (let k = 0; k < 24; k++) hit(out, t + k * 0.12, { type: 'bandpass', freq: 2600, q: 2, gain: 0.02, len: 0.06, attack: 0.002 });
    },
    // A rattlesnake's rattle.
    rattle(out, t) {
      for (let k = 0; k < 30; k++) hit(out, t + k * 0.035, { type: 'bandpass', freq: 4000, q: 3, gain: 0.012, len: 0.02, attack: 0.001 });
    },
    // A bell buoy out in the fog.
    buoy(out, t) {
      note(out, t, { freq: 740, len: 2.6, gain: 0.03, type: 'sine' });
      note(out, t, { freq: 1850, len: 1.2, gain: 0.01, type: 'sine' });
    },
    // A sheep out on the hill.
    // A Highland cow, lowing.
    moo(out, t) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(400, t);
      f.frequency.linearRampToValueAtTime(900, t + 0.5);
      f.frequency.linearRampToValueAtTime(300, t + 1.6);
      f.connect(out);
      note(f, t, { freq: 110, to: 92, len: 1.6, gain: 0.08, type: 'sawtooth', attack: 0.25 });
    },
    baa(out, t) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 380;
      const vib = ac.createOscillator();
      vib.frequency.value = 18;
      const vd = ac.createGain();
      vd.gain.value = 18;
      vib.connect(vd).connect(o.frequency);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 1.5;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(f).connect(g).connect(out);
      o.start(t); vib.start(t);
      o.stop(t + 0.85); vib.stop(t + 0.85);
    },
    // A Vespa buzzing past on the road.
    vespa(out, t) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(110, t);
      o.frequency.linearRampToValueAtTime(150, t + 1.6);
      o.frequency.linearRampToValueAtTime(95, t + 3.6);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.04, t + 1.6);
      g.gain.linearRampToValueAtTime(0.0001, t + 3.8);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 3.9);
    },
    // A peacock's call across the garden.
    peacock(out, t) {
      for (const at of [0, 0.7]) note(out, t + at, { freq: 700, to: 1100, len: 0.45, gain: 0.035, type: 'sawtooth', attack: 0.04 });
    },
    // A firework going off over the château: a thump and a crackle.
    boom(out, t) {
      note(out, t, { freq: 90, to: 40, len: 0.7, gain: 0.18, type: 'sine', attack: 0.005 });
      for (let k = 0; k < 14; k++) hit(out, t + 0.3 + k * 0.06 + Math.random() * 0.04, { type: 'bandpass', freq: 2500 + Math.random() * 2000, q: 2, gain: 0.015, len: 0.04, attack: 0.002 });
    },
    // Knock, knock (on the speakeasy's door).
    knock(out, t) {
      for (const at of [0, 0.22, 0.6]) hit(out, t + at, { type: 'lowpass', freq: 260, gain: 0.3, len: 0.1, attack: 0.002 });
    },
    // Two steins meeting.
    clink(out, t) {
      note(out, t, { freq: 1180, len: 0.5, gain: 0.05, type: 'triangle' });
      note(out, t + 0.01, { freq: 1730, len: 0.35, gain: 0.03, type: 'sine' });
    },
    // A slot machine paying out.
    jackpot(out, t) {
      [72, 76, 79, 84, 79, 84, 88].forEach((m, k) => note(out, t + k * 0.11, { freq: hz(m), len: 0.25, gain: 0.03, type: 'triangle' }));
    },
    // A hawk's cry, far overhead.
    hawk(out, t) {
      note(out, t, { freq: 2400, to: 1500, len: 0.9, gain: 0.02, type: 'sine', attack: 0.05 });
    },
    // A parrot.
    squawk(out, t) {
      const o = ac.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(900, t);
      o.frequency.linearRampToValueAtTime(1400, t + 0.08);
      o.frequency.linearRampToValueAtTime(800, t + 0.25);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.3);
    },
    // Gulls going over.
    gulls(out, t) {
      play(out, ['cue-gull-1', 'cue-gull-2'], t, { gain: 0.4 });
      play(out, ['cue-gull-1', 'cue-gull-2'], t + 0.8, { gain: 0.25, rate: 1.08 });
    },
    // The ship's timbers groaning (the kraken's got hold of her).
    creak(out, t) {
      play(out, 'cue-creak-2', t, { gain: 0.7 });
    },
    // A splash (the mermaid diving).
    splash(out, t) {
      play(out, 'cue-splash-2', t, { gain: 0.8 });
    },
    // The foghorn: two long low blasts.
    // A boat's horn: two toots.
    horn(out, t) {
      for (const d of [0, 0.7]) {
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        f.connect(out);
        for (const freq of [233, 349]) note(f, t + d, { freq, len: d ? 1.1 : 0.45, gain: 0.05, type: 'sawtooth', attack: 0.04 });
      }
    },
    foghorn(out, t) {
      for (const at of [0, 3.2]) {
        for (const [freq, gain, type] of [[110, 0.14, 'sawtooth'], [111.5, 0.08, 'square'], [220, 0.03, 'sine']]) {
          const o = ac.createOscillator();
          o.type = type;
          o.frequency.value = freq;
          const f = ac.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 500;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.0001, t + at);
          g.gain.exponentialRampToValueAtTime(gain, t + at + 0.3);
          g.gain.setValueAtTime(gain, t + at + 2);
          g.gain.exponentialRampToValueAtTime(0.0001, t + at + 2.6);
          o.connect(f).connect(g).connect(out);
          o.start(t + at);
          o.stop(t + at + 2.7);
        }
      }
    },
    // Another ship's horn, somewhere out in the fog: higher, shorter, muffled.
    foghornFar(out, t) {
      for (const [freq, gain, type] of [[165, 0.05, 'sawtooth'], [166.5, 0.03, 'square']]) {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 350;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.4);
        g.gain.setValueAtTime(gain, t + 1.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
        o.connect(f).connect(g).connect(out);
        o.start(t);
        o.stop(t + 2.4);
      }
    },
    // A wolf howls at the moon, and another answers in the distance.
    howl(out, t) {
      const wolf = (at, base, gain, len) => {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1400;
        const g = ac.createGain();
        const vib = ac.createOscillator();
        vib.frequency.value = 5.5;
        const vibDepth = ac.createGain();
        vibDepth.gain.value = 0;
        vibDepth.gain.setValueAtTime(0, at + 0.9);
        vibDepth.gain.linearRampToValueAtTime(base * 0.025, at + 1.6);
        vib.connect(vibDepth).connect(o.frequency);
        o.frequency.setValueAtTime(base * 0.6, at);
        o.frequency.exponentialRampToValueAtTime(base, at + 0.8);
        o.frequency.setValueAtTime(base, at + len * 0.6);
        o.frequency.exponentialRampToValueAtTime(base * 0.7, at + len);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(gain, at + 0.5);
        g.gain.setValueAtTime(gain, at + len * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(f).connect(g).connect(out);
        o.start(at);
        vib.start(at);
        o.stop(at + len + 0.1);
        vib.stop(at + len + 0.1);
      };
      wolf(t, 560, 0.09, 3.4);
      wolf(t + 2.2, 500, 0.035, 2.8);
    },
    // Hooves galloping past, loud in the middle.
    gallop(out, t) {
      const len = 6;
      const env = ac.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1, t + len / 2);
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);
      env.connect(out);
      for (let at = 0; at < len; at += 0.42) {
        for (const [d, gain] of [[0, 0.5], [0.09, 0.35], [0.19, 0.6]]) {
          hit(env, t + at + d, { type: 'lowpass', freq: 380, q: 2, gain, len: 0.07 });
        }
      }
      // A horse's whinny on the way through.
      note(env, t + 2.6, { freq: 900, to: 600, len: 0.9, gain: 0.05, type: 'sawtooth', attack: 0.05 });
    },
  };

  function cue(name) {
    if (!current || !level || !CUES[name] || !ac || document.hidden) return;
    try {
      const out = ac.createGain();
      out.gain.value = 1;
      out.connect(master);
      CUES[name](out, ac.currentTime + 0.05);
      setTimeout(() => out.disconnect(), 9000);
    } catch {}
  }

  function set(style, newLevel, { party: wantParty = false } = {}) {
    level = newLevel;
    // Party mode on or off: the room starts again, its music changed.
    if (wantParty !== party) {
      party = wantParty;
      if (current) { current.stop(); current = null; }
    }
    const want = level > 0 && ROOMS[style] ? style : null;
    if (!want) {
      if (master) master.gain.setTargetAtTime(0, ac.currentTime, 0.4);
      if (current) {
        const old = current;
        current = null;
        setTimeout(() => old.stop(), 1500);
      }
      return;
    }
    if (!audio()) return;
    master.gain.setTargetAtTime(level * 0.6, ac.currentTime, 0.6);
    if (current?.style === want) return;
    if (current) current.stop();
    const out = ac.createGain();
    out.connect(master);
    const stops = ROOMS[want](out);
    current = { style: want, stop: () => { stops.forEach((s) => s()); out.disconnect(); } };
  }

  // The caller's voice (the Darts Palace calls every ton): the browser's own speech, at the room's
  // volume, and only while the sound's on.
  function say(text) {
    if (!current || !level || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.78;
      u.pitch = 0.7;
      u.volume = Math.min(1, level * 1.6);
      const voices = speechSynthesis.getVoices();
      u.voice = voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|arthur|george/i.test(v.name)) || voices.find((v) => /en-GB/i.test(v.lang)) || null;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {}
  }

  window.Ambience = { set, cue, say, styles: Object.keys(ROOMS) };
})();
