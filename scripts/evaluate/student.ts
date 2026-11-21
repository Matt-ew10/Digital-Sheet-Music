// Measures score following on the student's recordings, against the labels written by
// label.ts, as recorded and under conditions the experiment may bring. Usage:
// pnpm evaluate:student <folder with takes.json>
//
// - mistakes: the score given to the follower differs from what was played, as if the player
//   had skipped a note, added one, or played a wrong pitch, about once every eight notes.
// - noise, room, quiet, another player: the recording mixed with steady noise, reverberation,
//   much less level, or a different take as if someone nearby were practicing.
// - metronome: the app's metronome clicks, louder than the playing, as from a speaker next to the
//   microphone.
// - tuned to 442: the recording raised by 8 cents and followed at A4 = 442 Hz.
// - restarts: as in practice, the player stops three times partway through a note, rests a
//   second, and starts again from the beginning of a measure one or two measures back.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { click } from "@/lib/audio/metronome";
import type { Note } from "@/lib/score/follow";
import { takes } from "./label";
import { evaluate, percent, Score } from "./measure";
import { readScore } from "./musicxml";
import { decode, parse, replay } from "./recording";

async function main(folder?: string) {
  if (!folder) throw new Error("Usage: pnpm evaluate:student <folder>");

  const all = await takes(folder);
  const loaded = await Promise.all(
    all
      .filter((take) => take.correct)
      .map(async (take) => {
        const name = take.audio.replace(/\.wav$/, "");

        return {
          name,
          score: readScore(await readFile(join(folder, "scores", take.score), "utf8")),
          played: parse(await readFile(join(folder, "labels", `${name}.txt`), "utf8")),
          ...decode(await readFile(join(folder, take.audio))),
        };
      }),
  );
  const totals = new Map<string, Score>();

  for (const [index, take] of loaded.entries()) {
    const other = loaded[(index + 1) % loaded.length].samples;
    const variants: [string, Float32Array, Note[], number[][], number, undefined?][] = [
      ["as recorded", take.samples, take.score, take.played, 440],
      ["mistakes", take.samples, mistakes(take.score, index), take.played, 440],
      ["noise (20 dB below)", noise(take.samples, 20, index), take.score, take.played, 440],
      ["noise (10 dB below)", noise(take.samples, 10, index), take.score, take.played, 440],
      ["room", room(take.samples, take.sampleRate, index), take.score, take.played, 440],
      ["quiet (-24 dB)", take.samples.map((sample) => sample / 16), take.score, take.played, 440],
      ["another player (10 dB below)", mix(take.samples, other, 10), take.score, take.played, 440],
      ["metronome (10 dB above)", clicked(take.samples, take.sampleRate, 10), take.score, take.played, 440],
      [
        "tuned to 442",
        resample(take.samples, 2 ** (8 / 1200)),
        take.score,
        take.played.map(([onset, hz, duration]) => [
          onset / 2 ** (8 / 1200),
          hz,
          duration / 2 ** (8 / 1200),
        ]),
        442,
      ],
    ];
    const restarts = take.score.flatMap((note, at) =>
      at === 0 || note.measure !== take.score[at - 1].measure ? [at] : [],
    );
    const practiced = practice(take, restarts, take.sampleRate);
    const row: Record<string, string> = {};

    for (const [variant, samples, score, played, referenceHz, truth] of [
      ...variants,
      ["restarts", practiced.samples, take.score, practiced.played, 440, practiced.truth] as const,
    ]) {
      const result = evaluate(score, played, replay(samples, take.sampleRate), referenceHz, {
        truth,
        restarts,
      });
      const total = totals.get(variant) ?? new Score();

      total.add(result);
      totals.set(variant, total);
      row[variant] = percent(result.near, result.frames);
    }

    console.log(`${take.name}: ${JSON.stringify(row)}`);
  }

  console.table(
    [...totals].map(([variant, total]) => ({ variant, ...total.summary() })),
  );
}

// The take cut into practice: played up to partway through a note at 30%, 55%, and 80% of the
// way, then a second of silence, then again from the start of the measure one or two measures
// before. Returns the audio, the played notes with their new onsets, and each one's position.
function practice(
  take: { samples: Float32Array; played: number[][]; score: { measure: number }[] },
  restarts: number[],
  sampleRate: number,
) {
  const { played, score } = take;
  const pieces: Float32Array[] = [];
  const notes: number[][] = [];
  const truth: number[] = [];
  let from = 0;
  let length = 0;

  for (const [count, share] of [0.3, 0.55, 0.8].entries()) {
    const stop = Math.floor(played.length * share);
    const end = played[stop][0] + played[stop][2] / 2;

    add(from, stop, end);
    pieces.push(new Float32Array(sampleRate));
    length += sampleRate;

    // Back to the start of the measure `count % 2 + 1` measures before the one stopped in.
    const measure = score[stop].measure - (count % 2) - 1;
    from = restarts.findLast((at) => score[at].measure <= Math.max(0, measure)) ?? 0;
  }

  add(from, played.length - 1, played.at(-1)![0] + played.at(-1)![2]);

  const samples = new Float32Array(length);
  let at = 0;

  for (const piece of pieces) {
    samples.set(piece, at);
    at += piece.length;
  }

  return { samples, played: notes, truth };

  // Notes `first` to `last` of the take, the last cut off at `end` seconds.
  function add(first: number, last: number, end: number) {
    const start = played[first][0];
    const offset = length / sampleRate - start;

    for (let note = first; note <= last; note++) {
      const [onset, hz, duration] = played[note];

      notes.push([onset + offset, hz, Math.min(duration, end - onset)]);
      truth.push(note);
    }

    const piece = take.samples.subarray(
      Math.round(start * sampleRate),
      Math.round(end * sampleRate),
    );

    pieces.push(piece);
    length += piece.length;
  }
}

// A copy of the score with about one note in eight changed, by a fixed pseudo-random sequence
// so runs compare. A note the player skipped is one the score has and the recording does not;
// a note the player added is one the recording has and the score does not.
function mistakes(score: Note[], seed: number) {
  const next = random(seed);
  const changed: Note[] = [];

  // Copies, since a note the player added lengthens the note before it.
  for (const [index, note] of score.map((note) => ({ ...note })).entries()) {
    const roll = index > 2 ? next() : 1;

    if (roll < 0.04) {
      // Skipped by the player: an extra note in the score.
      changed.push({ pitches: [note.pitches[0] + 2], seconds: note.seconds }, note);
    } else if (roll < 0.08) {
      // Added by the player: the score lacks this note.
      const previous = changed.at(-1);

      if (previous) previous.seconds += note.seconds;
    } else if (roll < 0.125) {
      // A wrong pitch: the score says something else.
      changed.push({ ...note, pitches: note.pitches.map((pitch) => pitch + (next() < 0.5 ? 1 : -2)) });
    } else {
      changed.push(note);
    }
  }

  return changed;
}

// White noise at `below` dB under the recording's level while it plays.
function noise(samples: Float32Array, below: number, seed: number) {
  const next = random(seed);
  const level = loudness(samples) * 10 ** (-below / 20) * Math.sqrt(3);

  return samples.map((sample) => sample + level * (2 * next() - 1));
}

// A reverberant room: noise decaying by 60 dB over 0.8 seconds, mixed with the dry sound.
function room(samples: Float32Array, sampleRate: number, seed: number) {
  const next = random(seed);
  const length = Math.round(sampleRate * 0.8);
  const step = 32;
  const response = Array.from({ length: length / step }, (_, index) =>
    (2 * next() - 1) * 10 ** ((-3 * index * step) / length),
  );
  const wet = new Float32Array(samples.length);

  // Sparse convolution: one tap every `step` samples is enough for a diffuse tail.
  for (const [index, gain] of response.entries()) {
    const delay = (index + 1) * step;

    for (let at = delay; at < samples.length; at++) {
      wet[at] += samples[at - delay] * gain;
    }
  }

  const scale = loudness(samples) / Math.max(loudness(wet), 1e-9);

  return samples.map((sample, at) => sample + 0.5 * scale * wet[at]);
}

// Metronome clicks every half second, an accent every fourth, `above` dB over the recording's
// level while each click sounds, as from a speaker next to the microphone.
function clicked(samples: Float32Array, sampleRate: number, above: number) {
  const sounds = [true, false].map((accent) => click(sampleRate, accent));
  const level = Math.sqrt(sounds[0].reduce((sum, sample) => sum + sample ** 2, 0) / sounds[0].length);
  const gain = (loudness(samples) / level) * 10 ** (above / 20);
  const mixed = samples.slice();

  for (let beat = 0, at = 0; at < mixed.length; beat++, at = Math.round(beat * sampleRate * 0.5)) {
    const sound = sounds[beat % 4 === 0 ? 0 : 1];

    for (let index = 0; index < sound.length && at + index < mixed.length; index++) {
      mixed[at + index] += gain * sound[index];
    }
  }

  return mixed;
}

// `other`, looped, at `below` dB under `samples`.
function mix(samples: Float32Array, other: Float32Array, below: number) {
  const gain = (loudness(samples) / loudness(other)) * 10 ** (-below / 20);

  return samples.map((sample, at) => sample + gain * other[at % other.length]);
}

// Played back `factor` times faster, which raises the pitch by the same factor.
function resample(samples: Float32Array, factor: number) {
  const output = new Float32Array(Math.floor(samples.length / factor));

  for (let at = 0; at < output.length; at++) {
    const from = at * factor;
    const below = Math.floor(from);
    const fraction = from - below;

    output[at] =
      samples[below] * (1 - fraction) + (samples[below + 1] ?? 0) * fraction;
  }

  return output;
}

// Root mean square over the louder half of the recording, so silence before and after does not
// count.
function loudness(samples: Float32Array) {
  const blocks: number[] = [];

  for (let start = 0; start + 4800 <= samples.length; start += 4800) {
    let sum = 0;

    for (let at = start; at < start + 4800; at++) sum += samples[at] ** 2;
    blocks.push(sum / 4800);
  }

  const louder = blocks.toSorted((a, b) => b - a).slice(0, Math.ceil(blocks.length / 2));

  return Math.sqrt(louder.reduce((sum, block) => sum + block, 0) / louder.length);
}

function random(seed: number) {
  let state = seed * 2654435761 + 1;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

void main(process.argv[2]);
