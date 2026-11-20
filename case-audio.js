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

    const open = render(ctx, .138, .18, (t, grit, body) => {
      const latch = clamp(t / .00075) * (
        .53 * resonance(t, 332, .018) + .45 * resonance(t, 1367, .010) +
        .24 * resonance(t, 2770, .0052) + .25 * grit * Math.exp(-t / .004)
      );
      const sweep = attackDecay(t, .013, .042) * (
        .22 * body + .12 * Math.sin(TAU * (520 * t - 1450 * t * t))
      );
      return latch + sweep;
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

    const reward = render(ctx, .31, .121, (t) => {
      const first = attackDecay(t, .004, .071) * (
        .59 * Math.sin(TAU * 659.25 * t) + .12 * Math.sin(TAU * 1430 * t)
      );
      const after = t - .043;
      const second = after > 0 ? attackDecay(after, .005, .078) * (
        .46 * Math.sin(TAU * 987.77 * after) + .095 * Math.sin(TAU * 2220 * after)
      ) : 0;
      return first + second;
    });

    const coin = render(ctx, .064, .069, (t, grit) =>
      clamp(t / .0006) * (
        .53 * resonance(t, 2041, .012) + .32 * resonance(t, 2819, .009) +
        .17 * resonance(t, 4168, .006) + .18 * grit * Math.exp(-t / .003)
      ));

    const built = { fast, slow, open, stop, reward, coin, coinHits: 0 };
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
      bank.coinHits = 0;
      play(rig, bank.stop, time, skin ? .86 : .67);
      play(rig, bank.reward, time, skin ? .62 + quality * .049 : .34,
        skin ? 1 + quality * .028 : .84);
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
