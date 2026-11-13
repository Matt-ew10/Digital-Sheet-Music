// Reads the first part of a simple MusicXML score into the notes the follower takes, for
// scripts that run outside the browser. The app reads scores through OSMD instead
// (src/lib/score/read.ts); this reader only covers what the experiment's excerpts use: one tempo,
// chords, rests, ties, grace notes, and repeats without endings. It follows the same rules:
// rests, grace notes, and tied continuations start no note, and repeats are played once more.
// Each note also carries the measure it is in, counted as played.
import type { Note } from "@/lib/score/follow";

export function readScore(xml: string): (Note & { measure: number })[] {
  const divisions = Number(xml.match(/<divisions>(\d+)/)?.[1]);
  const tempo = Number(xml.match(/<sound tempo="([\d.]+)"/)?.[1] ?? 100);
  const measures = [...xml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map(
    ([, body]) => ({
      notes: [...body.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(([, note]) =>
        event(note),
      ),
      forward: body.includes('<repeat direction="forward"'),
      backward: body.includes('<repeat direction="backward"'),
    }),
  );

  // Measure order as played: a backward repeat goes back to the last forward repeat, or the
  // start, once.
  const order: number[] = [];
  let from = 0;

  for (const [index, measure] of measures.entries()) {
    if (measure.forward) from = index;
    order.push(index);
    if (measure.backward) {
      for (let again = from; again <= index; again++) order.push(again);
    }
  }

  const starts: { pitches: number[]; at: number; measure: number }[] = [];
  let at = 0;

  for (const [measure, index] of order.entries()) {
    for (const note of measures[index].notes) {
      if (note.grace) continue;

      if (note.chord) {
        if (note.midi !== undefined && !note.tied) {
          starts.at(-1)?.pitches.push(note.midi);
        }
        continue;
      }

      if (note.midi !== undefined && !note.tied) {
        starts.push({ pitches: [note.midi], at, measure });
      }
      at += note.duration;
    }
  }

  // Divisions per quarter note, and the tempo in quarter notes per minute.
  const seconds = 60 / tempo / divisions;

  return starts.map((start, index) => ({
    pitches: start.pitches.toSorted((a, b) => a - b),
    seconds: ((starts[index + 1]?.at ?? at) - start.at) * seconds,
    measure: start.measure,
  }));
}

function event(note: string) {
  const step = note.match(/<step>([A-G])<\/step>/)?.[1];
  const alter = Number(note.match(/<alter>(-?\d+)<\/alter>/)?.[1] ?? 0);
  const octave = Number(note.match(/<octave>(\d)<\/octave>/)?.[1]);

  return {
    midi: step === undefined ? undefined : 12 * (octave + 1) + steps[step] + alter,
    duration: Number(note.match(/<duration>(\d+)<\/duration>/)?.[1] ?? 0),
    chord: note.includes("<chord/>"),
    tied: note.includes('<tie type="stop"/>'),
    grace: note.includes("<grace/>"),
  };
}

const steps: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
