// Background sound for the TV, to match the room style. Each room has at most three layers, so
// they never pile up into a hiss: one background recording (the sea, rain, a fire, crickets; real
// CC0 recordings from /sounds), a few sounds now and then (gulls, a creaking timber, chips, glasses)
// and a tune, played on the fly with the Web Audio API: the blues on the dive bar's jukebox, a
// lute in the tavern, Drunken Sailor on the pirate ship, Shenandoah at the lighthouse, a fiddle and
// the pipes at St Patrick's, Bach on the organ at Halloween... Classic is quiet.
//
//   Ambience.set(style, level)   start, switch or stop (level 0 = off, up to 1)
(() => {
  let ac = null;
  let master = null;
  let current = null; // { style, stop() }
  let level = 0;

  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

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
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // Calls step(time, beat) for every beat (or tick) just ahead of time, so rhythms stay steady.
  function sequencer(bpm, step, { div = 1 } = {}) {
    const dur = 60 / bpm / div;
    let next = ac.currentTime + 0.1;
    let n = 0;
    const timer = setInterval(() => {
      while (next < ac.currentTime + 0.25) {
        step(next, n, dur);
        next += dur;
        n += 1;
      }
    }, 50);
    return () => clearInterval(timer);
  }

  // Calls fn at random moments, on average every `every` seconds.
  function now(every, fn) {
    let stopped = false;
    const go = () => {
      if (stopped) return;
      fn(ac.currentTime + 0.05);
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
  function tune(out, { bpm, notes, voice, gain, chords = null, every = 8, comp = null }) {
    const eighth = 60 / bpm / 2;
    let step = 0;
    let left = 0;
    let bar = 0;
    return sequencer(bpm * 2, (t, n) => {
      if (chords && n % every === 0) comp(out, t, chords[bar++ % chords.length], eighth * every);
      if (left === 0) {
        const [m, len] = notes[step];
        if (m) voice(out, t, hz(m), len * eighth, gain);
        left = len;
        step = (step + 1) % notes.length;
      }
      left -= 1;
    });
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
    // The opening of Bach's Toccata in D minor on the organ, then a long hush.
    toccata: [
      [81, 1], [79, 1], [81, 6], [79, 1], [77, 1], [76, 1], [74, 1], [73, 4], [74, 8], [null, 8],
      [69, 1], [67, 1], [69, 6], [64, 2], [65, 2], [61, 4], [62, 8], [null, 16],
    ],
  };

  // ---------- The rooms ----------

  // Every room is three layers at most: one background (a recording, where there's a good one),
  // a few sounds now and then, and a tune. Never a wash of noise under everything.
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
      // Waves lapping, and a ukulele.
      const chords = [[67, 71, 74, 79], [65, 69, 72, 77], [64, 67, 72, 76], [62, 67, 71, 74]];
      return [
        background(out, 'bed-waves-3', { gain: 0.4 }),
        now(6, (t) => { const c = pick(chords); for (let k = 0; k < 2; k++) c.forEach((m, i) => note(out, t + k * 0.45 + i * 0.03, { freq: hz(m), len: 0.7, gain: 0.04 })); }),
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
    if (!current || !level || !CUES[name] || !ac) return;
    try {
      const out = ac.createGain();
      out.gain.value = 1;
      out.connect(master);
      CUES[name](out, ac.currentTime + 0.05);
      setTimeout(() => out.disconnect(), 9000);
    } catch {}
  }

  function set(style, newLevel) {
    level = newLevel;
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

  window.Ambience = { set, cue, styles: Object.keys(ROOMS) };
})();
