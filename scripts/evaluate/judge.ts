// Measures condition 5's judge on the student's recordings. Usage:
// pnpm evaluate:judge <folder with takes.json>
//
// The correct takes have no wrong notes but are not perfectly in tune, so each note's own
// distance from its written pitch is first measured offline, from the labels: the median of the
// readings over the whole note. Against that reference it reports, for several settings:
//
// - as recorded: how many notes the live judge marks, and how many of those were within the
//   tolerance by the reference (false marks).
// - shifted: one note in ten moved by 30, 50, or 100 cents, as if played out of tune, and how
//   many of them the judge marks, on that note or within two notes of it.
// - judged: the share of notes that get a verdict at all, which a stricter judge lowers.
//
// It then lists the notes marked in the incorrect takes, for the student to compare with what
// they played.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { windowSize, type Reading } from "@/lib/audio/pitch";
import { follower } from "@/lib/score/follow";
import { judge, type Options } from "@/lib/score/judge";
import app from "@/settings";
import { takes } from "./label";
import { readScore } from "./musicxml";
import { decode, frameRate, parse, replay } from "./recording";

async function main(folder?: string) {
  if (!folder) throw new Error("Usage: pnpm evaluate:judge <folder>");

  const all = await Promise.all(
    (await takes(folder)).map(async (take) => {
      const name = take.audio.replace(/\.wav$/, "");
      const score = readScore(await readFile(join(folder, "scores", take.score), "utf8"));
      const { samples, sampleRate } = decode(await readFile(join(folder, take.audio)));
      const played = take.correct
        ? parse(await readFile(join(folder, "labels", `${name}.txt`), "utf8"))
        : undefined;

      return { name, score, played, sampleRate, readings: replay(samples, sampleRate) };
    }),
  );
  const correct = all.filter((take) => take.played);

  // How far the correct takes themselves are from their written pitches, by note length.
  const references = correct.flatMap((take) => {
    const lead = windowSize / 2 / take.sampleRate;

    return take.played!.map(([onset, , duration], index) => ({
      duration,
      cents: deviation(take.readings, take.score[index].pitches, onset + lead + 0.05, onset + lead + duration - 0.03),
    }));
  });

  for (const [label, keep] of [
    ["all notes", () => true],
    ["under 0.25 s", (seconds: number) => seconds < 0.25],
    ["0.5 s or more", (seconds: number) => seconds >= 0.5],
  ] as const) {
    const group = references.filter((note) => keep(note.duration));
    const off = group.filter((note) => Math.abs(note.cents ?? 0) > tolerance).length;

    console.log(`${label}: ${percent(off, group.length)}% of ${group.length} notes beyond ${tolerance} cents`);
  }
  const rows = [];

  for (const options of settings) {
    const totals = { notes: 0, judged: 0, marked: 0, falseMarks: 0, shifted: [0, 0, 0], caught: [0, 0, 0], near: [0, 0, 0], falseShifted: [0, 0, 0], others: [0, 0, 0] };

    for (const [seed, take] of correct.entries()) {
      const played = take.played!;
      const lead = windowSize / 2 / take.sampleRate;
      const reference = played.map(([onset, , duration], index) =>
        deviation(take.readings, take.score[index].pitches, onset + lead + 0.05, onset + lead + duration - 0.03),
      );
      const recorded = run(take.score, take.readings, options);

      totals.notes += take.score.length;
      totals.judged += recorded.judged.size;
      totals.marked += recorded.marked.size;
      totals.falseMarks += [...recorded.marked].filter((note) => Math.abs(reference[note] ?? 0) <= tolerance).length;

      for (const [size, shift] of shifts.entries()) {
        const next = random(seed * 7 + size);
        const moved = new Map<number, number>();

        played.forEach((_, index) => {
          if (index > 2 && next() < 0.1) moved.set(index, moved.size % 2 ? -shift : shift);
        });

        const readings = take.readings.map((reading, frame) => {
          const center = frame / frameRate - lead;
          const index = played.findIndex(([onset, , duration]) => center >= onset && center < onset + duration);
          const cents = moved.get(index);

          return reading && cents ? { ...reading, hz: reading.hz * 2 ** (cents / 1200) } : reading;
        });
        const result = run(take.score, readings, options);

        for (const [index, cents] of moved) {
          if (reference[index] === undefined || Math.abs(reference[index] + cents) <= options.wrong) continue;

          totals.shifted[size]++;
          if (result.marked.has(index)) totals.caught[size]++;
          if ([...result.marked].some((note) => Math.abs(note - index) <= 2)) totals.near[size]++;
        }

        for (const note of result.marked) {
          if (moved.has(note) || Math.abs(reference[note] ?? 0) > tolerance) continue;
          totals.falseShifted[size]++;
        }
        totals.others[size] += take.score.length - moved.size;
      }
    }

    rows.push({
      setting: `right within ${options.right}, wrong beyond ${options.wrong} cents`,
      judged: percent(totals.judged, totals.notes),
      "marked as recorded": percent(totals.marked, totals.notes),
      "false marks": percent(totals.falseMarks, totals.notes),
      ...Object.fromEntries(
        shifts.flatMap((shift, size) => [
          [`${shift} caught`, percent(totals.caught[size], totals.shifted[size])],
          [`${shift} nearby`, percent(totals.near[size], totals.shifted[size])],
          [`${shift} false`, percent(totals.falseShifted[size], totals.others[size])],
        ]),
      ),
    });
  }

  console.table(rows);

  // Practice: a note played 50 cents off, a pause, then the passage again in tune from the
  // start of the measure before. The mark should appear on the first pass and clear on the
  // second.
  const cleared = { tried: 0, marked: 0, cleared: 0 };

  for (const take of correct) {
    const played = take.played!;
    const lead = windowSize / 2 / take.sampleRate;
    const frameOf = (seconds: number) => Math.round((seconds + lead) * frameRate);

    for (const share of [0.3, 0.6]) {
      const note = Math.floor(played.length * share);
      const [onset, , duration] = played[note];
      const back = take.score.findIndex((n) => n.measure === Math.max(0, take.score[note].measure - 1));
      const stop = frameOf(played[Math.min(note + 3, played.length - 1)][0]);
      const first = take.readings.slice(0, stop).map((reading, frame) => {
        const center = frame / frameRate - lead;

        return reading && center >= onset && center < onset + duration
          ? { ...reading, hz: reading.hz * 2 ** (50 / 1200) }
          : reading;
      });
      const again = take.readings.slice(frameOf(played[back][0]) - 3, frameOf(onset + duration) + 30);
      const readings = [...first, ...new Array(frameRate).fill(undefined), ...again];
      const result = run(take.score, readings, settings[0], first.length);

      if (Math.abs((deviation(take.readings, take.score[note].pitches, onset + lead + 0.05, onset + lead + duration - 0.03) ?? 99) + 50) <= settings[0].wrong) continue;

      cleared.tried++;
      if (result.markedBefore.has(note)) cleared.marked++;
      if (result.markedBefore.has(note) && !result.final.has(note)) cleared.cleared++;
    }
  }

  console.log(
    `practice: ${cleared.tried} notes played 50 cents off, ${cleared.marked} marked, ${cleared.cleared} cleared on the replay`,
  );

  const chosen = settings[0];

  for (const take of all.filter((take) => !take.played)) {
    const result = run(take.score, take.readings, chosen);
    const listed = [...result.marked]
      .toSorted((a, b) => a - b)
      .map((note) => `m${take.score[note].measure + 1} n${note + 1} at ${result.at.get(note)!.toFixed(1)} s`);

    console.log(`${take.name}: ${result.marked.size} marked\n  ${listed.join(", ")}`);
  }
}

// The follower and the judge over a recording's readings, as the score page runs them.
function run(
  score: ReturnType<typeof readScore>,
  readings: (Reading | undefined)[],
  options: Options,
  split = readings.length,
) {
  const restarts = score.flatMap((note, at) =>
    at === 0 || note.measure !== score[at - 1].measure ? [at] : [],
  );
  const follow = follower(score, 440, restarts);
  const judgement = judge(score, 440, options);
  const judged = new Set<number>();
  const marked = new Set<number>();
  const at = new Map<number, number>();
  let markedBefore = new Set<number>();

  follow.wait(0);

  readings.forEach((reading, frame) => {
    const time = frame / frameRate;

    if (frame === split) markedBefore = new Set(judgement.marks);

    const position = follow.read(time, reading?.hz);
    const verdict = judgement.read(time, reading?.hz, position);

    if (!verdict) return;

    judged.add(verdict.note);
    if (verdict.wrong && !marked.has(verdict.note)) {
      marked.add(verdict.note);
      at.set(verdict.note, time);
    }
  });

  return { judged, marked, at, markedBefore, final: judgement.marks };
}

// The median distance in cents of the readings between `from` and `to` seconds from the nearest
// written pitch, octaves folded away. Undefined when fewer than three readings have a pitch.
function deviation(readings: (Reading | undefined)[], written: number[], from: number, to: number) {
  const cents: number[] = [];

  for (let frame = Math.ceil(from * frameRate); frame <= to * frameRate; frame++) {
    const reading = readings[frame];

    if (!reading) continue;

    const midi = 69 + 12 * Math.log2(reading.hz / 440);

    cents.push(
      written
        .map((pitch) => ((((midi - pitch) * 100 + 600) % 1200) + 1200) % 1200 - 600)
        .toSorted((a, b) => Math.abs(a) - Math.abs(b))[0],
    );
  }

  if (cents.length < 3) return undefined;

  return cents.toSorted((a, b) => a - b)[Math.floor(cents.length / 2)];
}

function percent(part: number, whole: number) {
  return whole === 0 ? "-" : ((part / whole) * 100).toFixed(1);
}

function random(seed: number) {
  let state = seed * 2654435761 + 1;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// The research team's tolerance: a note within it is in tune.
const tolerance = app.feedback.right;
const shifts = [30, 50, 100];
// The app's setting first, then stricter tolerances, with and without unjudged notes between.
const settings: Options[] = [
  app.feedback,
  { ...app.feedback, right: 15, wrong: 25 },
  { ...app.feedback, right: 15, wrong: 15 },
  { ...app.feedback, right: 12, wrong: 18 },
];

void main(process.argv[2]);
