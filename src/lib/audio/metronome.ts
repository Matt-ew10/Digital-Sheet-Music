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

// One click, as samples: a short burst of noise, which has no pitch for the detector to read
// when the microphone hears it. A beep did: it cost the follower 1 to 3 points on the student's
// takes, the noise nothing (`pnpm evaluate:student`).
export function click(sampleRate: number, accent: boolean) {
  const length = Math.round(sampleRate * 0.025);
  const samples = new Float32Array(length);
  const gain = accent ? 1 : 0.6;
  let state = 1;
  let previous = 0;

  for (let at = 0; at < length; at++) {
    const decay = Math.exp(-at / (sampleRate * 0.004));

    // White noise from a fixed sequence, high-passed so it sounds like wood, not a hiss.
    state = (state * 1664525 + 1013904223) % 4294967296;
    const noise = state / 2147483648 - 1;

    samples[at] = gain * decay * (noise - previous);
    previous = noise;
  }

  return samples;
}
