// Background sound for the TV, to match the room style. Everything is made on the fly with the Web
// Audio API (no audio files): crowd murmur and clinking glasses in the dive bar, a crackling fire
// and a lute in the tavern, a four-on-the-floor beat in the club, wind and torches in the castle,
// a walking bass, ride cymbal and piano in the jazz club, chatter and a sizzling grill in the
// diner, waves and a ukulele at the tiki bar, slot machines in the casino, a honky-tonk piano in
// the saloon, gulls and creaking timbers on the pirate ship, an oompah band in the beer hall, a
// synth pad in space, sleigh bells at Christmas, a pipe organ and thunder at Halloween, and a jig
// for St Patrick's. Classic is quiet.
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

  // A steady bed of filtered noise (murmur, wind, sizzle), gently swelling.
  function bed(out, { type = 'lowpass', freq, q = 0.7, gain, wobble = 0.3, rate = 0.08, sweep = 0 }) {
    const src = noise();
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.value = gain;
    const lfo = ac.createOscillator();
    lfo.frequency.value = rate;
    const depth = ac.createGain();
    depth.gain.value = gain * wobble;
    lfo.connect(depth).connect(g.gain);
    if (sweep) {
      const fd = ac.createGain();
      fd.gain.value = sweep;
      lfo.connect(fd).connect(f.frequency);
    }
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    return () => { src.stop(); lfo.stop(); };
  }

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

  // A wood fire: the soft rush of the flames, and pops and snaps that come in little clusters with
  // quiet in between (a steady stream of bright clicks sounds like a broken speaker, not a fire).
  function crackles(out, gain = 0.12) {
    const flames = bed(out, { type: 'bandpass', freq: 700, q: 0.5, gain: gain * 0.35, wobble: 0.5, rate: 0.23 });
    const pops = now(1.1, (t) => {
      const n = 1 + Math.floor(Math.random() ** 2 * 5);
      for (let k = 0, at = t; k < n; k++, at += 0.04 + Math.random() * 0.16) {
        const big = Math.random() < 0.2;
        hit(out, at, big
          ? { type: 'bandpass', freq: 500 + Math.random() * 400, q: 0.9, gain: gain * 0.8, len: 0.09, attack: 0.002 }
          : { type: 'bandpass', freq: 1000 + Math.random() * 1200, q: 1.2, gain: gain * (0.2 + Math.random() * 0.3), len: 0.025 + Math.random() * 0.03, attack: 0.002 });
      }
    });
    return () => { flames(); pops(); };
  }

  // A pub session up in the hills: the crowd, the peat fire, a bodhrán and a jig on the fiddle
  // (filtered, so it's a fiddle across the room and not a buzzer). `level` turns the band down.
  function session(out, level = 1) {
    const scale = [62, 64, 66, 67, 69, 71, 73, 74, 76, 78];
    let i = 4;
    const band = ac.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.value = 2200;
    const bandGain = ac.createGain();
    bandGain.gain.value = level;
    band.connect(bandGain).connect(out);
    return [
      bed(out, { type: 'bandpass', freq: 700, q: 0.6, gain: 0.09, wobble: 0.4, rate: 0.15 }),
      crackles(out, 0.08),
      sequencer(118, (t, n, dur) => {
        // Jigs go in threes.
        if (n % 3 === 0) hit(band, t, { type: 'lowpass', freq: 160, gain: 0.22, len: 0.2 });
        i = Math.max(0, Math.min(scale.length - 1, i + pick([-1, -1, 1, 1, 2, -2])));
        note(band, t, { freq: hz(scale[i]), len: dur * 0.95, gain: 0.04, type: 'sawtooth', attack: 0.025 });
        note(band, t, { freq: hz(scale[i]) * 1.003, len: dur * 0.95, gain: 0.025, type: 'triangle', attack: 0.025 });
      }, { div: 3 }),
      () => bandGain.disconnect(),
    ];
  }

  // ---------- The rooms ----------

  const ROOMS = {
    dive(out) {
      return [
        bed(out, { freq: 450, gain: 0.22, wobble: 0.4, rate: 0.13 }),
        bed(out, { type: 'bandpass', freq: 1100, q: 0.6, gain: 0.05, rate: 0.21 }),
        // Glasses clinking somewhere.
        now(4, (t) => { const f = 2600 + Math.random() * 1200; note(out, t, { freq: f, len: 0.5, gain: 0.04, type: 'sine' }); note(out, t + 0.09, { freq: f * 1.06, len: 0.4, gain: 0.03, type: 'sine' }); }),
      ];
    },
    tavern(out) {
      const scale = [62, 65, 67, 69, 72, 74, 77];
      return [
        bed(out, { freq: 160, gain: 0.18, wobble: 0.2, rate: 0.05 }),
        crackles(out, 0.14),
        // A lute somewhere in the corner.
        now(7, (t) => { let i = Math.floor(Math.random() * 4); for (let k = 0; k < 4; k++) { note(out, t + k * 0.22, { freq: hz(scale[i]), len: 0.9, gain: 0.06 }); i = Math.min(scale.length - 1, i + pick([1, 2])); } }),
      ];
    },
    club(out) {
      const bass = [45, 45, 48, 43];
      return [
        sequencer(122, (t, n) => {
          const beat = n % 4;
          note(out, t, { freq: 150, to: 45, len: 0.28, gain: 0.45, type: 'sine' }); // kick
          hit(out, t + 30 / 122, { freq: 8000, gain: 0.05, len: 0.05 }); // offbeat hat
          if (beat === 1 || beat === 3) hit(out, t, { type: 'bandpass', freq: 1500, q: 0.8, gain: 0.08, len: 0.12 }); // clap
          note(out, t + 30 / 122, { freq: hz(bass[Math.floor(n / 4) % 4]), len: 0.22, gain: 0.12, type: 'sawtooth' });
        }),
        bed(out, { type: 'bandpass', freq: 900, q: 0.5, gain: 0.03, rate: 0.3 }),
      ];
    },
    castle(out) {
      return [
        bed(out, { type: 'bandpass', freq: 600, q: 1.2, gain: 0.14, wobble: 0.6, rate: 0.06, sweep: 300 }),
        crackles(out, 0.09),
        // A low drone under it all.
        (() => {
          const nodes = [hz(38), hz(45), hz(50)].map((f) => { const o = ac.createOscillator(); o.frequency.value = f; o.detune.value = Math.random() * 6; return o; });
          const g = ac.createGain();
          g.gain.value = 0.025;
          nodes.forEach((o) => { o.connect(g); o.start(); });
          g.connect(out);
          return () => nodes.forEach((o) => o.stop());
        })(),
      ];
    },
    jazz(out) {
      // Bb blues, walking.
      const walk = [34, 36, 37, 38, 39, 41, 43, 44, 46];
      let i = 0;
      const chords = [[58, 62, 65, 68], [63, 67, 70, 73]];
      return [
        sequencer(112, (t, n, dur) => {
          i = Math.max(0, Math.min(walk.length - 1, i + pick([-2, -1, 1, 1, 2])));
          note(out, t, { freq: hz(walk[i]), len: dur * 0.9, gain: 0.2, type: 'triangle', attack: 0.01 });
          hit(out, t, { type: 'bandpass', freq: 7000, q: 2, gain: 0.04, len: 0.25 }); // ride
          if (n % 2 === 1) {
            hit(out, t + dur * 0.66, { type: 'bandpass', freq: 7000, q: 2, gain: 0.03, len: 0.15 }); // swung ride
            hit(out, t, { type: 'bandpass', freq: 2500, q: 0.6, gain: 0.03, len: 0.18 }); // brush
          }
          if (n % 8 === 0 || (n % 8 === 5 && Math.random() < 0.5)) {
            for (const m of chords[Math.floor(n / 8) % 2]) note(out, t + Math.random() * 0.03, { freq: hz(m), len: 1.4, gain: 0.03, type: 'sine', attack: 0.01 });
          }
        }),
      ];
    },
    diner(out) {
      return [
        bed(out, { type: 'bandpass', freq: 850, q: 0.7, gain: 0.12, wobble: 0.5, rate: 0.17 }),
        bed(out, { type: 'highpass', freq: 5000, gain: 0.025, wobble: 0.6, rate: 0.4 }), // the grill
        // Order up!
        now(25, (t) => { note(out, t, { freq: 2093, len: 1.2, gain: 0.05, type: 'sine' }); note(out, t, { freq: 4186, len: 0.6, gain: 0.015, type: 'sine' }); }),
      ];
    },
    tiki(out) {
      // Waves rolling in and a ukulele now and then.
      const chords = [[67, 71, 74, 79], [65, 69, 72, 77], [64, 67, 72, 76], [62, 67, 71, 74]];
      return [
        bed(out, { freq: 700, gain: 0.2, wobble: 0.9, rate: 0.11, sweep: 300 }),
        now(6, (t) => { const c = pick(chords); for (let k = 0; k < 2; k++) c.forEach((m, i) => note(out, t + k * 0.45 + i * 0.03, { freq: hz(m), len: 0.7, gain: 0.04 })); }),
      ];
    },
    speakeasy(out) {
      // Low chatter, clinking glasses and a piano in the corner.
      const chords = [[57, 60, 64, 67], [55, 59, 62, 65], [53, 57, 60, 64], [52, 56, 59, 62]];
      return [
        bed(out, { freq: 500, gain: 0.16, wobble: 0.4, rate: 0.12 }),
        now(5, (t) => note(out, t, { freq: 2800 + Math.random() * 900, len: 0.4, gain: 0.03, type: 'sine' })),
        sequencer(84, (t, n) => {
          if (n % 2) return;
          const c = chords[Math.floor(n / 8) % 4];
          note(out, t, { freq: hz(c[0] - 12), len: 0.9, gain: 0.07 });
          c.slice(1).forEach((m) => note(out, t + 0.36, { freq: hz(m), len: 0.6, gain: 0.025, type: 'sine' }));
        }),
      ];
    },
    casino(out) {
      // The floor's buzz, chips clacking and slot machines paying out.
      return [
        bed(out, { type: 'bandpass', freq: 800, q: 0.6, gain: 0.14, wobble: 0.3, rate: 0.2 }),
        now(0.9, (t) => hit(out, t, { type: 'bandpass', freq: 3200, q: 4, gain: 0.05, len: 0.03 })),
        now(9, (t) => { for (let k = 0; k < 8; k++) note(out, t + k * 0.07, { freq: hz(pick([84, 88, 91, 96])), len: 0.2, gain: 0.03, type: 'square' }); }),
      ];
    },
    saloon(out) {
      // A honky-tonk piano, a little out of tune.
      const prog = [[48, [64, 67, 72]], [53, [65, 69, 72]], [55, [62, 67, 71]], [48, [64, 67, 72]]];
      return [
        bed(out, { freq: 400, gain: 0.08, wobble: 0.4, rate: 0.1 }),
        sequencer(150, (t, n) => {
          const [bass, chord] = prog[Math.floor(n / 4) % 4];
          if (n % 2 === 0) note(out, t, { freq: hz(bass - (n % 4 === 2 ? 5 : 0)), len: 0.3, gain: 0.1 });
          else chord.forEach((m) => { note(out, t, { freq: hz(m) * 1.004, len: 0.22, gain: 0.03, type: 'square' }); note(out, t, { freq: hz(m) * 0.996, len: 0.22, gain: 0.02, type: 'triangle' }); });
        }),
      ];
    },
    pirate(out) {
      // Waves against the hull, creaking timbers, gulls and the ship's bell.
      return [
        bed(out, { freq: 500, gain: 0.2, wobble: 0.9, rate: 0.09, sweep: 250 }),
        now(5, (t) => note(out, t, { freq: 90 + Math.random() * 40, to: 60, len: 1.2, gain: 0.06, type: 'sawtooth', attack: 0.4 })),
        now(11, (t) => { for (let k = 0; k < 3; k++) note(out, t + k * 0.25, { freq: 1400, to: 900, len: 0.22, gain: 0.025, type: 'sine' }); }),
        now(30, (t) => { note(out, t, { freq: 1046, len: 2, gain: 0.04, type: 'sine' }); note(out, t + 0.4, { freq: 1046, len: 2, gain: 0.03, type: 'sine' }); }),
      ];
    },
    beerhall(out) {
      // Oompah: tuba on the beat, the band on the off-beat, a hall full of people.
      const prog = [[43, [67, 71, 74]], [38, [66, 69, 72]], [38, [66, 69, 72]], [43, [67, 71, 74]]];
      return [
        bed(out, { type: 'bandpass', freq: 700, q: 0.6, gain: 0.12, wobble: 0.4, rate: 0.15 }),
        sequencer(116, (t, n) => {
          const [bass, chord] = prog[Math.floor(n / 4) % 4];
          if (n % 2 === 0) note(out, t, { freq: hz(bass + (n % 4 === 2 ? 7 : 0)), len: 0.35, gain: 0.18, type: 'sawtooth', attack: 0.02 });
          else chord.forEach((m) => note(out, t, { freq: hz(m), len: 0.18, gain: 0.03, type: 'square' }));
        }),
      ];
    },
    space(out) {
      // A slow synth pad drifting, with the odd bleep from the ship's computer.
      const pad = [hz(45), hz(52), hz(57), hz(64)].map((f, i) => {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = (i - 1.5) * 7;
        return o;
      });
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.05;
      const depth = ac.createGain();
      depth.gain.value = 400;
      lfo.connect(depth).connect(f.frequency);
      const g = ac.createGain();
      g.gain.value = 0.03;
      pad.forEach((o) => { o.connect(f); o.start(); });
      f.connect(g).connect(out);
      lfo.start();
      return [
        () => { pad.forEach((o) => o.stop()); lfo.stop(); },
        now(8, (t) => { for (let k = 0; k < 3; k++) note(out, t + k * 0.12, { freq: hz(pick([84, 88, 91, 95])), len: 0.1, gain: 0.025, type: 'sine' }); }),
      ];
    },
    storm(out) {
      // A gale howling, rain lashing the glass, and a heavy sea. Thunder and the big waves come with
      // what's on screen.
      return [
        bed(out, { type: 'bandpass', freq: 500, q: 1.5, gain: 0.2, wobble: 0.9, rate: 0.12, sweep: 350 }),
        bed(out, { type: 'highpass', freq: 3000, gain: 0.08, wobble: 0.2, rate: 0.3 }),
        bed(out, { freq: 300, gain: 0.25, wobble: 0.95, rate: 0.1, sweep: 150 }),
      ];
    },
    lighthouse(out) {
      // Waves breaking on the rocks, wind, and a buoy bell out at sea.
      return [
        bed(out, { freq: 600, gain: 0.22, wobble: 0.95, rate: 0.08, sweep: 350 }),
        bed(out, { type: 'bandpass', freq: 1200, q: 2, gain: 0.05, wobble: 0.7, rate: 0.05, sweep: 300 }),
        now(16, (t) => { note(out, t, { freq: 740, len: 2.4, gain: 0.04, type: 'sine' }); note(out, t, { freq: 1850, len: 1.2, gain: 0.012, type: 'sine' }); }),
        now(22, (t) => { for (let k = 0; k < 3; k++) note(out, t + k * 0.25, { freq: 1400, to: 900, len: 0.22, gain: 0.02, type: 'sine' }); }),
      ];
    },
    lighthouseDay(out) {
      // A calm sea in the sun: waves on the rocks, a breeze, gulls, and the buoy bell far out.
      return [
        bed(out, { freq: 650, gain: 0.17, wobble: 0.9, rate: 0.09, sweep: 300 }),
        bed(out, { type: 'bandpass', freq: 900, q: 1.5, gain: 0.03, wobble: 0.6, rate: 0.05, sweep: 200 }),
        now(8, (t) => { for (let k = 0; k < pick([2, 3, 4]); k++) note(out, t + k * 0.22, { freq: 1500 + Math.random() * 200, to: 950, len: 0.2, gain: 0.022, type: 'sine' }); }),
        now(24, (t) => { note(out, t, { freq: 740, len: 2.4, gain: 0.03, type: 'sine' }); note(out, t, { freq: 1850, len: 1.2, gain: 0.01, type: 'sine' }); }),
      ];
    },
    lighthouseFog(out) {
      // Fog muffles everything: a slow swell below and a hush. The foghorn comes with the scenery.
      return [
        bed(out, { freq: 380, gain: 0.2, wobble: 0.85, rate: 0.06, sweep: 120 }),
        bed(out, { type: 'bandpass', freq: 500, q: 0.7, gain: 0.03, wobble: 0.3, rate: 0.04 }),
        now(30, (t) => note(out, t, { freq: 740, len: 2.4, gain: 0.015, type: 'sine' })),
      ];
    },
    christmas(out) {
      // A crackling fire, sleigh bells and a music box.
      const scale = [72, 74, 76, 79, 81, 84];
      return [
        bed(out, { freq: 160, gain: 0.12, wobble: 0.2, rate: 0.05 }),
        crackles(out, 0.1),
        sequencer(100, (t, n) => {
          if (n % 16 < 8) for (let k = 0; k < 2; k++) hit(out, t + k * 0.15, { type: 'bandpass', freq: 7500, q: 3, gain: 0.04, len: 0.08 });
          if (n % 2 === 0 && Math.random() < 0.7) note(out, t, { freq: hz(pick(scale)), len: 1.2, gain: 0.04, type: 'sine' });
        }),
      ];
    },
    halloween(out) {
      // Howling wind, a low organ, an owl and a creaking door. Thunder, the wolf and the horseman's
      // hooves come with what's on screen (cue(), from public/scenery.js).
      const organ = [hz(38), hz(45), hz(50), hz(53)].map((freq) => { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = freq; return o; });
      const g = ac.createGain();
      g.gain.value = 0.02;
      organ.forEach((o) => { o.connect(g); o.start(); });
      g.connect(out);
      return [
        () => organ.forEach((o) => o.stop()),
        bed(out, { type: 'bandpass', freq: 700, q: 3, gain: 0.12, wobble: 0.8, rate: 0.07, sweep: 400 }),
        now(14, (t) => { note(out, t, { freq: 440, to: 400, len: 0.35, gain: 0.04, type: 'sine', attack: 0.05 }); note(out, t + 0.5, { freq: 430, to: 380, len: 0.6, gain: 0.04, type: 'sine', attack: 0.05 }); }),
        now(25, (t) => note(out, t, { freq: 220, to: 600, len: 1.6, gain: 0.03, type: 'sawtooth', attack: 0.3 })),
      ];
    },
    stpatricks: (out) => session(out),
    // The rain outside, on the windows, with thunder far off (the windows flicker first, on screen).
    stpatricksRain: (out) => [
      ...session(out, 0.8),
      bed(out, { type: 'highpass', freq: 2500, gain: 0.05, wobble: 0.3, rate: 0.2 }),
      bed(out, { type: 'bandpass', freq: 1200, q: 0.5, gain: 0.04, wobble: 0.4, rate: 0.13 }),
    ],
    stpatricksFog: (out) => session(out, 0.8),
  };

  // ---------- One-off sounds, in time with the scenery ----------

  const CUES = {
    // Rolling thunder after the lightning.
    thunder(out, t) {
      hit(out, t, { type: 'lowpass', freq: 260, gain: 0.6, len: 2.2 });
      hit(out, t + 0.25, { type: 'lowpass', freq: 140, gain: 0.5, len: 3.2 });
      hit(out, t + 0.9, { type: 'lowpass', freq: 90, gain: 0.35, len: 3.5 });
    },
    // Thunder a long way off: a low rumble that rolls on.
    thunderFar(out, t) {
      hit(out, t, { type: 'lowpass', freq: 120, gain: 0.3, len: 3.5, attack: 0.4 });
      hit(out, t + 0.6, { type: 'lowpass', freq: 80, gain: 0.25, len: 4, attack: 0.5 });
    },
    // A big wave breaking on the rocks below.
    crash(out, t) {
      hit(out, t, { type: 'lowpass', freq: 500, gain: 0.5, len: 1.6 });
      hit(out, t + 0.2, { type: 'bandpass', freq: 1800, q: 0.6, gain: 0.35, len: 2.2 });
      hit(out, t + 0.6, { type: 'highpass', freq: 3500, gain: 0.15, len: 2 });
    },
    // A splash (the mermaid diving).
    splash(out, t) {
      hit(out, t, { type: 'bandpass', freq: 1200, q: 0.8, gain: 0.3, len: 0.5 });
      hit(out, t + 0.12, { type: 'highpass', freq: 3000, gain: 0.12, len: 0.7 });
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
