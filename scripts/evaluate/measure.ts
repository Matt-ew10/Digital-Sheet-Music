// Measures score following on a recording whose played notes are known.
import { follower, type Note } from "@/lib/score/follow";
import { frameRate } from "./urmp";

// Runs the follower over the readings and compares its cursor at every frame, from the first
// played note to the end of the last, with the score position of the note being played. During
// a gap between notes the truth stays on the last one. `truth` gives each played note's score
// position when the player went back, which matching by pitch cannot find; `restarts` are the
// positions where playing may start again.
export function evaluate(
  score: Note[],
  played: number[][],
  readings: ({ hz: number } | undefined)[],
  referenceHz: number,
  {
    truth = align(score, played),
    restarts = [0],
  }: { truth?: (number | undefined)[]; restarts?: number[] } = {},
) {
  const follow = follower(score, referenceHz, restarts);
  const cursor = readings.map((reading, frame) =>
    follow.read(frame / frameRate, reading?.hz),
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

  // How long after each note starts the cursor first reaches it. After the player goes back,
  // how long until the cursor is within one note of them instead.
  let previous: number | undefined;

  for (const [index, [onset]] of played.entries()) {
    const target = truth[index];

    if (target === undefined) continue;

    const start = Math.ceil(onset * frameRate);
    const back = previous !== undefined && target < previous;
    const reached = cursor.findIndex((at, frame) =>
      frame >= start && (back ? Math.abs(at - target) <= 1 : at >= target),
    );
    const seconds = (reached < 0 ? cursor.length - start : reached - start) / frameRate;

    if (back) result.recoveries.push(seconds);
    else if (reached >= 0) result.lags.push(seconds);
    previous = target;
  }

  return result;
}

export class Score {
  frames = 0;
  exact = 0;
  near = 0;
  lost = 0;
  lags: number[] = [];
  recoveries: number[] = [];

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
    this.recoveries.push(...other.recoveries);
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
      ...(this.recoveries.length > 0 && {
        "back within 1 s (%)": percent(
          this.recoveries.filter((seconds) => seconds <= 1).length,
          this.recoveries.length,
        ),
      }),
    };
  }
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

export function percent(part: number, whole: number) {
  return whole ? ((part / whole) * 100).toFixed(1) : "-";
}

