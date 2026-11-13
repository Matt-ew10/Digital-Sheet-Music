// Measures score following against the string tracks of the URMP dataset: the cursor at every
// frame against the score note actually being played. Usage: pnpm evaluate:follow <URMP Dataset folder>
import { readFile } from "node:fs/promises";
import { Midi } from "@tonejs/midi";
import type { Note } from "@/lib/score/follow";
import { evaluate, percent, Score } from "./measure";
import { decode, parse, replay, tracks } from "./urmp";

async function main(root?: string) {
  if (!root) {
    throw new Error("Usage: pnpm evaluate:follow <URMP Dataset folder>");
  }

  const totals = new Map<string, Score>();

  for (const track of await tracks(root)) {
    if (!track.score) continue;

    const midi = new Midi(await readFile(track.score));
    const parts = midi.tracks.filter((part) => part.notes.length > 0);
    const notes = parts[track.part].notes;
    const score = positions(notes);
    const played = parse(await readFile(track.notes, "utf8"));
    const { samples, sampleRate } = decode(await readFile(track.audio));
    // URMP is tuned to A4 = 440 Hz. Playing may restart at any measure, as on the score page.
    const result = evaluate(score, played, replay(samples, sampleRate), 440, {
      restarts: measureStarts(midi, notes),
    });
    const total = totals.get(track.instrument) ?? new Score();

    total.add(result);
    totals.set(track.instrument, total);
    console.log(
      `${track.name}: ${percent(result.near, result.frames)} within one note`,
    );
  }

  const all = new Score();

  for (const total of totals.values()) all.add(total);
  console.table(
    [...totals, ["all", all] as const].map(([instrument, total]) => ({
      instrument,
      ...total.summary(),
    })),
  );
}

// The score positions that start a measure, from the MIDI file's first time signature.
function measureStarts(midi: Midi, notes: { ticks: number }[]) {
  const [beats, beatType] = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const measure = (midi.header.ppq * 4 * beats) / beatType;
  const starts = [...new Set(notes.map((note) => note.ticks))].toSorted((a, b) => a - b);

  return starts.flatMap((ticks, index) =>
    index === 0 ||
    Math.floor(ticks / measure) !== Math.floor(starts[index - 1] / measure)
      ? [index]
      : [],
  );
}

// Score positions from a MIDI track: the pitches that start together, and the time until the
// next start (the last lasts as long as its longest note).
function positions(
  notes: { ticks: number; time: number; duration: number; midi: number }[],
): Note[] {
  const starts = [...new Set(notes.map((note) => note.ticks))].toSorted(
    (a, b) => a - b,
  );

  return starts.map((ticks, index) => {
    const chord = notes.filter((note) => note.ticks === ticks);
    const time = chord[0].time;
    const following = notes.find((note) => note.ticks === starts[index + 1]);

    return {
      pitches: chord.map((note) => note.midi).toSorted((a, b) => a - b),
      seconds: following
        ? following.time - time
        : Math.max(...chord.map((note) => note.duration)),
    };
  });
}

void main(process.argv[2]);
