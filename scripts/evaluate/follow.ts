// Measures score following against the string tracks of the URMP dataset: the cursor at every
// frame against the score note actually being played. Usage: pnpm evaluate:follow <URMP Dataset folder>
import { readFile } from "node:fs/promises";
import { Midi } from "@tonejs/midi";
import { follower, type Note } from "@/app/score/follow";
import { decode, frameRate, parse, replay, tracks } from "./urmp";

async function main(root?: string) {
  if (!root) {
    throw new Error("Usage: pnpm evaluate:follow <URMP Dataset folder>");
  }

  const totals = new Map<string, Score>();

  for (const track of await tracks(root)) {
    if (!track.score) continue;

    const midi = new Midi(await readFile(track.score));
    const parts = midi.tracks.filter((part) => part.notes.length > 0);
    const score = positions(parts[track.part].notes);
    const played = parse(await readFile(track.notes, "utf8"));
    const { samples, sampleRate } = decode(await readFile(track.audio));
    const result = evaluate(score, played, replay(samples, sampleRate));
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

// Runs the follower over the readings and compares its cursor at every frame, from the first
// played note to the end of the last, with the score position of the note being played. During
// a gap between notes the truth stays on the last one.
function evaluate(
  score: Note[],
  played: number[][],
  readings: ({ hz: number } | undefined)[],
) {
  const truth = align(score, played);
  const follow = follower(score);
  const cursor = readings.map((reading, frame) =>
    follow(frame / frameRate, reading?.hz),
  );
  const result = new Score();
  const [first] = played[0];
  const [lastOnset, , lastDuration] = played[played.length - 1];
  let note = -1;
  let position = -1;

  for (
    let frame = Math.ceil(first * frameRate);
    frame < Math.min(cursor.length, (lastOnset + lastDuration) * frameRate);
    frame++
  ) {
    while (
      note + 1 < played.length &&
      played[note + 1][0] <= frame / frameRate
    ) {
      note++;
      position = truth[note] ?? position;
    }

    result.count(cursor[frame] - position);
  }

  // How long after each note starts the cursor first reaches it.
  for (const [index, [onset]] of played.entries()) {
    const target = truth[index];

    if (target === undefined) continue;

    const start = Math.ceil(onset * frameRate);
    const reached = cursor.findIndex(
      (at, frame) => frame >= start && at >= target,
    );

    if (reached >= 0) result.lags.push((reached - start) / frameRate);
  }

  return result;
}

class Score {
  frames = 0;
  exact = 0;
  near = 0;
  lost = 0;
  lags: number[] = [];

  // `error` is the cursor's position minus the true position, in notes.
  count(error: number) {
    this.frames++;
    if (error === 0) this.exact++;
    if (Math.abs(error) <= 1) this.near++;
    if (Math.abs(error) > 3) this.lost++;
  }

  add(other: Score) {
    this.frames += other.frames;
    this.exact += other.exact;
    this.near += other.near;
    this.lost += other.lost;
    this.lags.push(...other.lags);
  }

  summary() {
    const lags = this.lags.toSorted((a, b) => a - b);
    const ms = (at: number) => lags[Math.floor(lags.length * at)] * 1000;

    return {
      "within one note (%)": percent(this.near, this.frames),
      "exact (%)": percent(this.exact, this.frames),
      "lost (%)": percent(this.lost, this.frames),
      "median lag (ms)": ms(0.5)?.toFixed(0),
      "90% lag (ms)": ms(0.9)?.toFixed(0),
    };
  }
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

// Matches each played note to a score position by edit distance on pitch, so ornaments and
// notes added or left out in performance do not shift the rest. Unmatched played notes map to
// undefined.
function align(score: Note[], played: number[][]) {
  const rows = played.length + 1;
  const columns = score.length + 1;
  const cost = Array.from({ length: rows }, () => new Array<number>(columns));

  for (let i = 0; i < rows; i++) cost[i][0] = i;
  for (let j = 0; j < columns; j++) cost[0][j] = j;

  const same = (i: number, j: number) =>
    score[j].pitches.includes(
      Math.round(69 + 12 * Math.log2(played[i][1] / 440)),
    );

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < columns; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + (same(i - 1, j - 1) ? 0 : 1),
        cost[i - 1][j] + 1,
        cost[i][j - 1] + 1,
      );
    }
  }

  const matched = new Array<number | undefined>(played.length);

  for (let i = rows - 1, j = columns - 1; i > 0 && j > 0;) {
    if (cost[i][j] === cost[i - 1][j - 1] + (same(i - 1, j - 1) ? 0 : 1)) {
      matched[i - 1] = j - 1;
      i--;
      j--;
    } else if (cost[i][j] === cost[i - 1][j] + 1) {
      i--;
    } else {
      j--;
    }
  }

  return matched;
}

function percent(part: number, whole: number) {
  return whole ? ((part / whole) * 100).toFixed(1) : "-";
}

void main(process.argv[2]);
