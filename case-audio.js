(function () {
  "use strict";

  const TAU = 2 * Math.PI;
  const buffers = new WeakMap();
  const clamp = (value, max) => Math.min(max, Math.max(0, Number(value) || 0));

  function envelope(t, attack, decay) {
    return Math.min(1, t / attack) * Math.exp(-t / decay);
  }

  function partial(t, frequency, decay) {
    return Math.sin(TAU * frequency * t) * Math.exp(-t / decay);
  }

  function render(ctx, duration, peak, sample) {
    const size = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let max = 0;
    let seed = 132841;
    let previous = 0;
    for (let i = 0; i < size; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 0x80000000 - 1;
      const t = i / ctx.sampleRate;
      const fade = Math.min(1, (duration - t) / .008);
      const value = sample(t, (noise - previous) * .5) * fade;
      data[i] = value;
      max = Math.max(max, Math.abs(value));
      previous = noise;
    }
    if (max) {
      const gain = peak / max;
      for (let i = 0; i < size; i++) data[i] *= gain;
    }
    return buffer;
  }

  function getBuffers(ctx) {
    const cached = buffers.get(ctx);
    if (cached) return cached;

    const tick = render(ctx, .044, .115, (t, noise) =>
      Math.min(1, t / .0008) * (
        .57 * partial(t, 1460, .007) + .26 * partial(t, 2320, .005)
        + .14 * partial(t, 4050, .003) + .35 * noise * Math.exp(-t / .003)
      ));

    const open = render(ctx, .104, .14, (t, noise) => {
      const latch = Math.min(1, t / .001) * (
        .42 * partial(t, 430, .014) + .4 * partial(t, 1940, .007)
        + .24 * noise * Math.exp(-t / .005)
      );
      const slide = envelope(t, .007, .023) * (
        .15 * noise + .18 * Math.sin(TAU * (690 * t - 2800 * t * t))
      );
      return latch + slide;
    });

    const lock = render(ctx, .103, .185, (t, noise) =>
      Math.min(1, t / .0012) * (
        .55 * partial(t, 250, .029) + .32 * partial(t, 780, .015)
        + .29 * partial(t, 1822, .01) + .32 * noise * Math.exp(-t / .005)
      ));

    const reward = render(ctx, .26, .108, (t) => {
      const first = envelope(t, .006, .06) * (
        .53 * Math.sin(TAU * 880 * t) + .18 * Math.sin(TAU * 1807 * t)
      );
      const overtone = envelope(Math.max(0, t - .027), .007, .067) * (
        .31 * Math.sin(TAU * 1320 * t) + .14 * Math.sin(TAU * 2717 * t)
      );
      return first + overtone;
    });

    const set = { tick, open, lock, reward };
    buffers.set(ctx, set);
    return set;
  }

  function ready(rig) {
    return rig && rig.ctx && rig.out && rig.ctx.state === "running";
  }

  function play(rig, buffer, time, volume, rate = 1) {
    const source = rig.ctx.createBufferSource();
    const level = rig.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    level.gain.value = volume;
    source.connect(level);
    level.connect(rig.out);
    source.onended = () => {
      source.disconnect();
      level.disconnect();
    };
    source.start(time);
  }

  window.YooCaseAudio = Object.freeze({
    open(rig) {
      if (!ready(rig)) return false;
      play(rig, getBuffers(rig.ctx).open, rig.ctx.currentTime, .82);
      return true;
    },

    tick(rig, { progress = 0, accent = false } = {}) {
      if (!ready(rig)) return false;
      const position = clamp(progress, 1);
      const level = (accent ? .89 : .63) * (.82 + .18 * position);
      const rate = 1.19 - .26 * position + (accent ? .065 : 0);
      play(rig, getBuffers(rig.ctx).tick, rig.ctx.currentTime, level, rate);
      return true;
    },

    lock(rig, { tier = 0, skin = false } = {}) {
      if (!ready(rig)) return false;
      const set = getBuffers(rig.ctx);
      const time = rig.ctx.currentTime;
      const quality = clamp(tier, 5);
      play(rig, set.lock, time, skin ? .94 : .72);
      play(rig, set.reward, time, skin ? .72 + .037 * quality : .38, skin ? 1 + .03 * quality : .89);
      return true;
    },
  });
})();
