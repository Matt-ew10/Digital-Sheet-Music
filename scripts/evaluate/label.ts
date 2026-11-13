// Finds when each score note starts in recordings played as written, so score following can be
// measured on recordings that come without note annotations. Usage:
// pnpm evaluate:label <folder with takes.json>
//
// The labels come from aligning the whole recording against the score at once, which can look
// ahead and back, unlike the live follower. They are a reference to check by ear, not ground
// truth: next to each label file it writes the recording with a click at every labeled onset.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Note } from "@/lib/score/follow";
import { windowSize } from "@/lib/audio/pitch";
import { readScore } from "./musicxml";
import { decode, frameRate, replay } from "./recording";

async function main(folder?: string) {
  if (!folder) throw new Error("Usage: pnpm evaluate:label <folder>");

  await mkdir(join(folder, "labels"), { recursive: true });

  for (const take of await takes(folder)) {
    if (!take.correct) continue;

    const score = readScore(await readFile(join(folder, "scores", take.score), "utf8"));
    const { samples, sampleRate } = decode(await readFile(join(folder, take.audio)));
    const readings = replay(samples, sampleRate);
    const midis = readings.map((reading) =>
      reading ? 69 + 12 * Math.log2(reading.hz / 440) : undefined,
    );
    const tuning = offset(midis);
    const tuned = midis.map((midi) => midi && midi - tuning);
    const onsets = strength(samples, sampleRate, readings.length);

    // A first pass at the average pace, then a second at the pace found around each note.
    let starts = align(score, tuned, onsets, average(score, tuned));

    starts = align(score, tuned, onsets, local(score, starts));

    // A reading ends at its frame's time; the sound that started a note sits half a window
    // earlier.
    const lead = windowSize / 2 / sampleRate;
    const times = starts.map((frame) => Math.max(0, frame / frameRate - lead));
    const end = samples.length / sampleRate;
    const name = take.audio.replace(/\.wav$/, "");

    await writeFile(
      join(folder, "labels", `${name}.txt`),
      times
        .map((time, index) =>
          [
            time.toFixed(3),
            (440 * 2 ** ((score[index].pitches.at(-1)! - 69) / 12)).toFixed(2),
            ((times[index + 1] ?? end) - time).toFixed(3),
          ].join("\t"),
        )
        .join("\n") + "\n",
    );
    await writeFile(
      join(folder, "labels", `${name} clicks.wav`),
      clicks(samples, sampleRate, times),
    );

    const matched = starts.filter((frame, index) => {
      const midi = tuned[frame + 2];
      return midi !== undefined && score[index].pitches.includes(Math.round(midi));
    }).length;

    console.log(
      `${name}: ${score.length} notes, tuning ${(tuning * 100).toFixed(0)} cents, ` +
        `pitch heard at ${((matched / score.length) * 100).toFixed(0)}% of onsets`,
    );
  }
}

export async function takes(folder: string) {
  return JSON.parse(await readFile(join(folder, "takes.json"), "utf8")) as {
    audio: string;
    score: string;
    correct: boolean;
  }[];
}

// Semi-Markov alignment: each score note covers a run of frames, in order, with nothing skipped.
// A note's cost is how badly the readings in its run disagree with its pitch, how far its length
// is from what the pace predicts, and, when it repeats the previous pitch, how weak the attack
// at its start is. Silence and noise may come before the first note and after the last.
function align(
  score: Note[],
  midis: (number | undefined)[],
  onsets: Float32Array,
  expected: (note: number) => number,
) {
  const frames = midis.length;
  const outside = midis.map((midi) => (midi === undefined ? 0 : 0.6));
  const before = prefix(outside);
  let previous = Float64Array.from(before);
  const back: Int32Array[] = [];

  for (const [index, note] of score.entries()) {
    const cost = prefix(midis.map((midi) => disagreement(midi, note.pitches)));
    const length = expected(index);
    const longest = Math.ceil(Math.max(10, length * 4));
    const repeats =
      index > 0 &&
      note.pitches.some((pitch) =>
        score[index - 1].pitches.some((other) => (pitch - other) % 12 === 0),
      );
    const current = new Float64Array(frames + 1).fill(Infinity);
    const from = new Int32Array(frames + 1);

    // current[end]: the cheapest alignment with this note ending just before frame `end`.
    for (let end = 2; end <= frames; end++) {
      for (let size = 2; size <= Math.min(longest, end); size++) {
        const start = end - size;
        const base = previous[start];

        if (base === Infinity) continue;

        const total =
          base +
          cost[end] -
          cost[start] +
          0.3 * Math.log(size / length) ** 2 +
          (repeats ? 1.5 * (1 - attack(onsets, start)) : 0);

        if (total < current[end]) {
          current[end] = total;
          from[end] = start;
        }
      }
    }

    back.push(from);
    previous = current;
  }

  const after = prefix(outside);
  let best = Infinity;
  let end = frames;

  for (let at = 0; at <= frames; at++) {
    const total = previous[at] + after[frames] - after[at];

    if (total < best) {
      best = total;
      end = at;
    }
  }

  const starts = new Array<number>(score.length);

  for (let index = score.length - 1; index >= 0; index--) {
    starts[index] = back[index][end];
    end = starts[index];
  }

  return starts;
}

function disagreement(midi: number | undefined, pitches: number[]) {
  if (midi === undefined) return 0.4;

  const distance = Math.min(...pitches.map((pitch) => Math.abs(midi - pitch)));

  if (distance < 0.5) return 0;
  if (Math.abs(distance - 12) < 0.5 || Math.abs(distance - 24) < 0.5) return 0.4;
  if (distance < 1.5) return 0.7;
  return 1;
}

function prefix(values: number[]) {
  const sums = new Float64Array(values.length + 1);

  for (const [index, value] of values.entries()) sums[index + 1] = sums[index] + value;
  return sums;
}

// Frames per note at one pace for the whole take: the time from the first to the last pitch
// read, spread over the written lengths.
function average(score: Note[], midis: (number | undefined)[]) {
  const first = midis.findIndex((midi) => midi !== undefined);
  const last = midis.findLastIndex((midi) => midi !== undefined);
  const written = score.reduce((sum, note) => sum + note.seconds, 0);

  return (index: number) =>
    (score[index].seconds * (last - first)) / written;
}

// Frames per note at the pace of the eight notes on either side in a previous alignment.
function local(score: Note[], starts: number[]) {
  return (index: number) => {
    const from = Math.max(0, index - 8);
    const to = Math.min(score.length - 1, index + 8);
    let written = 0;

    for (let note = from; note < to; note++) written += score[note].seconds;

    const pace = written > 0 ? (starts[to] - starts[from]) / written : frameRate;

    return score[index].seconds * pace;
  };
}

// The median distance of readings from the nearest equal-tempered note, in semitones, so a
// take tuned away from 440 Hz still matches its score.
function offset(midis: (number | undefined)[]) {
  const offsets = midis
    .filter((midi) => midi !== undefined)
    .map((midi) => midi - Math.round(midi))
    .toSorted((a, b) => a - b);

  return offsets[Math.floor(offsets.length / 2)] ?? 0;
}

// How sharply loudness rises at each frame, 0 to 1: a bow change or a new stroke on the same
// pitch shows as a dip and a rise.
function strength(samples: Float32Array, sampleRate: number, frames: number) {
  const hop = sampleRate / frameRate;
  const loudness = new Float32Array(frames);

  for (let frame = 0; frame < frames; frame++) {
    const end = Math.round(frame * hop);
    const start = Math.max(0, end - 1024);
    let sum = 0;

    for (let at = start; at < end; at++) sum += samples[at] ** 2;
    loudness[frame] = Math.sqrt(sum / Math.max(1, end - start));
  }

  const rises = new Float32Array(frames);

  for (let frame = 1; frame < frames; frame++) {
    let quietest = Infinity;

    for (let at = Math.max(0, frame - 8); at < frame; at++) {
      quietest = Math.min(quietest, loudness[at]);
    }

    const ratio = loudness[frame] / Math.max(quietest, 1e-5);
    rises[frame] = Math.min(1, Math.max(0, ratio - 1.2));
  }

  return rises;
}

// The strongest attack within a few frames of `frame`.
function attack(onsets: Float32Array, frame: number) {
  let strongest = 0;

  for (let at = Math.max(0, frame - 3); at <= Math.min(onsets.length - 1, frame + 4); at++) {
    strongest = Math.max(strongest, onsets[at]);
  }

  return strongest;
}

// The recording with a short click at each time, as 16-bit mono WAV.
function clicks(samples: Float32Array, sampleRate: number, times: number[]) {
  const mixed = Float32Array.from(samples, (sample) => sample * 0.7);
  const length = Math.round(sampleRate * 0.02);

  for (const time of times) {
    const start = Math.round(time * sampleRate);

    for (let at = 0; at < length && start + at < mixed.length; at++) {
      mixed[start + at] +=
        0.4 * Math.sin((2 * Math.PI * 2000 * at) / sampleRate) * (1 - at / length);
    }
  }

  const file = Buffer.alloc(44 + mixed.length * 2);

  file.write("RIFF", 0, "ascii");
  file.writeUInt32LE(36 + mixed.length * 2, 4);
  file.write("WAVEfmt ", 8, "ascii");
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(sampleRate, 24);
  file.writeUInt32LE(sampleRate * 2, 28);
  file.writeUInt16LE(2, 32);
  file.writeUInt16LE(16, 34);
  file.write("data", 36, "ascii");
  file.writeUInt32LE(mixed.length * 2, 40);

  for (const [index, sample] of mixed.entries()) {
    file.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2);
  }

  return file;
}

if (process.argv[1]?.endsWith("label.ts")) void main(process.argv[2]);
