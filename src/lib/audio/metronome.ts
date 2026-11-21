// Clicks `perMeasure` times a measure at `beatsPerMinute`, louder on the first beat of each
// measure, until `stop`. `set` changes the tempo from the next click.
export function metronome(beatsPerMinute: number, perMeasure: number) {
  const context = new AudioContext();
  const sounds = [true, false].map((accent) => {
    const samples = click(context.sampleRate, accent);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);

    buffer.copyToChannel(samples, 0);
    return buffer;
  });
  let interval = 60 / beatsPerMinute;
  let next = context.currentTime + 0.1;
  let beat = 0;

  // Safari may create it suspended outside the click that started it.
  void context.resume();

  // Clicks are scheduled a little ahead on the audio clock, since timers in the page run late.
  const timer = setInterval(() => {
    while (next < context.currentTime + 0.2) {
      const source = new AudioBufferSourceNode(context, {
        buffer: sounds[beat % perMeasure === 0 ? 0 : 1],
      });

      source.connect(context.destination);
      source.start(next);
      next += interval;
      beat++;
    }
  }, 25);

  return {
    set(beatsPerMinute: number) {
      interval = 60 / beatsPerMinute;
    },
    stop() {
      clearInterval(timer);
      void context.close();
    },
  };
}

// One click, as samples: a clave-like tone at 3 kHz (higher on the accent) that dies away in a
// few hundredths of a second. The judge ignores readings more than an octave above the score's
// highest note, which the excerpts keep below about 2.5 kHz, so the microphone hearing the click
// does not mark notes wrong; a 2.5 kHz clave still did, and a 1 kHz beep also pulled the follower
// off (`pnpm evaluate:student`).
export function click(sampleRate: number, accent: boolean) {
  const length = Math.round(sampleRate * 0.06);
  const samples = new Float32Array(length);
  const gain = accent ? 1 : 0.6;
  const hz = accent ? 3600 : 3000;

  for (let at = 0; at < length; at++) {
    samples[at] = gain * Math.sin((2 * Math.PI * hz * at) / sampleRate) * Math.exp(-at / (sampleRate * 0.012));
  }

  return samples;
}
