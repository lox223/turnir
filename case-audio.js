(function () {
  "use strict";

  const TAU = 2 * Math.PI;
  const soundBanks = new WeakMap();

  function clamp(value, max = 1) {
    return Math.min(max, Math.max(0, Number(value) || 0));
  }

  function attackDecay(t, attack, decay) {
    return clamp(t / attack) * Math.exp(-t / decay);
  }

  function resonance(t, hz, decay) {
    return Math.sin(TAU * hz * t) * Math.exp(-t / decay);
  }

  function bell(time, start, hz, decay) {
    const t = time - start;
    if (t < 0 || t >= decay * 5) return 0;
    return clamp(t / .0026) * (
      .68 * resonance(t, hz, decay) + .19 * resonance(t, hz * 2.01, decay * .56) +
      .11 * resonance(t, hz * 3.61, decay * .32)
    );
  }

  function render(ctx, duration, targetPeak, waveform) {
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let seed = 214193;
    let lastNoise = 0;
    let filteredNoise = 0;
    let peak = 0;

    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 0x80000000 - 1;
      filteredNoise += .11 * (noise - filteredNoise);
      const t = i / ctx.sampleRate;
      const endFade = clamp((duration - t) / .006);
      const value = waveform(t, (noise - lastNoise) * .5, filteredNoise) * endFade;
      channel[i] = value;
      peak = Math.max(peak, Math.abs(value));
      lastNoise = noise;
    }

    if (peak > 0) {
      const volume = targetPeak / peak;
      for (let i = 0; i < length; i++) channel[i] *= volume;
    }
    return buffer;
  }

  function soundBank(ctx) {
    const cached = soundBanks.get(ctx);
    if (cached) return cached;

    // A dry, short detent stays legible when cards pass close together.
    const fast = render(ctx, .032, .101, (t, grit) =>
      clamp(t / .0007) * (
        .52 * resonance(t, 1190, .006) + .23 * resonance(t, 1973, .004) +
        .12 * resonance(t, 3021, .0028) + .28 * grit * Math.exp(-t / .0026)
      ));

    const slow = render(ctx, .061, .134, (t, grit) =>
      clamp(t / .00065) * (
        .45 * resonance(t, 502, .013) + .35 * resonance(t, 1270, .009) +
        .24 * resonance(t, 2356, .006) + .24 * grit * Math.exp(-t / .0033)
      ));

    const open = render(ctx, .168, .18, (t, grit, body) => {
      const latch = clamp(t / .00075) * (
        .53 * resonance(t, 332, .021) + .45 * resonance(t, 1367, .009) +
        .21 * resonance(t, 2770, .0042) + .26 * grit * Math.exp(-t / .004)
      );
      const sweep = attackDecay(t, .018, .049) * (
        .23 * body + .15 * Math.sin(TAU * (510 * t - 1240 * t * t))
      );
      const latchBack = t - .033;
      const catchClick = latchBack > 0 ? attackDecay(latchBack, .0011, .009) * (
        .19 * grit + .27 * Math.sin(TAU * 931 * latchBack)
      ) : 0;
      return latch + sweep + catchClick;
    });

    const stop = render(ctx, .135, .222, (t, grit) => {
      const body = clamp(t / .0008) * (
        .65 * resonance(t, 182, .035) + .25 * resonance(t, 448, .023) +
        .33 * resonance(t, 1590, .009) + .23 * grit * Math.exp(-t / .0045)
      );
      const tail = t - .015;
      const pawl = tail > 0 ? attackDecay(tail, .001, .013) * (
        .12 * Math.sin(TAU * 880 * tail) + .075 * Math.sin(TAU * 2490 * tail)
      ) : 0;
      return body + pawl;
    });

    // Four distinct cadences share the same unpitched stop event.
    const tickets = render(ctx, .142, .071, t =>
      .72 * bell(t, 0, 392, .029) + .25 * bell(t, .033, 330, .024));
    const common = render(ctx, .298, .132, t =>
      .74 * bell(t, 0, 587.33, .054) + .57 * bell(t, .050, 739.99, .054) +
      .48 * bell(t, .098, 880, .061));
    const rare = render(ctx, .528, .169, t =>
      .70 * bell(t, 0, 659.25, .070) + .59 * bell(t, .055, 830.61, .077) +
      .53 * bell(t, .109, 987.77, .091) + .47 * bell(t, .174, 1318.51, .105) +
      .29 * bell(t, .174, 659.25, .105) + .16 * bell(t, .234, 1975.53, .072));
    const jackpot = render(ctx, .718, .207, (t, grit) => {
      const lowSweep = attackDecay(t, .013, .101) * (
        .42 * Math.sin(TAU * (105 * t - 58 * t * t)) + .08 * grit
      );
      const opening = .56 * bell(t, 0, 523.25, .092) + .45 * bell(t, .045, 659.25, .094) +
        .52 * bell(t, .086, 783.99, .105) + .43 * bell(t, .131, 1046.50, .108);
      const bloom = .41 * bell(t, .205, 1046.50, .132) + .33 * bell(t, .205, 1318.51, .128) +
        .28 * bell(t, .205, 1567.98, .123) + .14 * bell(t, .289, 2093.00, .095);
      return opening + bloom + lowSweep;
    });

    const coin = render(ctx, .064, .069, (t, grit) =>
      clamp(t / .0006) * (
        .53 * resonance(t, 2041, .012) + .32 * resonance(t, 2819, .009) +
        .17 * resonance(t, 4168, .006) + .18 * grit * Math.exp(-t / .003)
      ));

    const built = { fast, slow, open, stop, tickets, common, rare, jackpot, coin, coinHits: 0 };
    soundBanks.set(ctx, built);
    return built;
  }

  function ready(rig) {
    return Boolean(rig?.out && rig.ctx?.state === "running");
  }

  function play(rig, buffer, time, volume, rate = 1) {
    const source = rig.ctx.createBufferSource();
    const gain = rig.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(rig.out);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(time);
  }

  window.YooCaseAudio = Object.freeze({
    prime(rig) {
      if (!ready(rig)) return false;
      soundBank(rig.ctx);
      return true;
    },

    open(rig) {
      if (!ready(rig)) return false;
      const bank = soundBank(rig.ctx);
      bank.coinHits = 0;
      play(rig, bank.open, rig.ctx.currentTime, .80);
      return true;
    },

    tick(rig, { progress = 0, accent = false } = {}) {
      if (!ready(rig)) return false;
      const position = clamp(progress);
      const bank = soundBank(rig.ctx);
      const slowing = accent || position >= .74;
      const volume = slowing ? .76 + .13 * position : .62 + .07 * position;
      const rate = slowing ? 1.06 - .13 * position : 1.18 - .11 * position;
      play(rig, slowing ? bank.slow : bank.fast, rig.ctx.currentTime, volume, rate);
      return true;
    },

    lock(rig, { tier = 0, skin = false } = {}) {
      if (!ready(rig)) return false;
      const bank = soundBank(rig.ctx);
      const time = rig.ctx.currentTime;
      const quality = clamp(tier, 5);
      const reward = !skin ? bank.tickets : quality >= 5 ? bank.jackpot : quality >= 3 ? bank.rare : bank.common;
      const volume = !skin ? .65 : quality >= 5 ? .89 : .78 + .018 * quality;
      bank.coinHits = 0;
      play(rig, bank.stop, time, skin ? .81 + quality * .024 : .58);
      play(rig, reward, time, volume);
      return true;
    },

    coin(rig, { strength = .72 } = {}) {
      if (!ready(rig)) return false;
      const energy = clamp(strength);
      const bank = soundBank(rig.ctx);
      if (energy === 0 || bank.coinHits >= 2) return false;
      const hit = bank.coinHits++;
      const volume = (.40 + .39 * energy) * (hit === 0 ? 1 : .73);
      play(rig, bank.coin, rig.ctx.currentTime, volume, .99 + hit * .08);
      return true;
    },
  });
})();
