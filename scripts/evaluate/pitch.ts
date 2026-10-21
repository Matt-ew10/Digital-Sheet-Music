// Measures the tuner against the string tracks of the URMP dataset, whose pitch
// annotations were corrected by hand. Usage: pnpm evaluate:pitch <URMP Dataset folder>
import { readFile } from "node:fs/promises";
import { steady, windowSize } from "@/app/tuner/pitch";
import settings from "@/settings";
import { decode, frameRate, parse, replay, tracks } from "./urmp";

async function main(root?: string) {
  if (!root) {
    throw new Error("Usage: pnpm evaluate:pitch <URMP Dataset folder>");
  }

  const totals = new Map<string, { raw: Score; display: Score }>();

  for (const track of await tracks(root)) {
    const { samples, sampleRate } = decode(await readFile(track.audio));
    const frames = parse(await readFile(track.frames, "utf8"));
    const notes = parse(await readFile(track.notes, "utf8"));
    const result = evaluate(samples, sampleRate, frames, notes);
    const total = totals.get(track.instrument) ?? {
      raw: new Score(),
      display: new Score(),
    };

    total.raw.add(result.raw);
    total.display.add(result.display);
    totals.set(track.instrument, total);
    console.log(
      `${track.name}: ${percent(result.display.correct, result.display.voiced)} correct`,
    );
  }

  console.table(
    [...totals].flatMap(([instrument, total]) => [
      { track: `${instrument} raw`, ...total.raw.summary() },
      { track: `${instrument} display`, ...total.display.summary() },
    ]),
  );
}

// The browser reads the newest window once per animation frame and shows a summary of the
// readings from the last `smoothingMs`. Both are scored at every annotated frame.
// - Raw readings measure the detector: the reading whose window is centered on the frame,
//   compared with the frame's pitch.
// - The display measures what the player sees: what is on screen at that moment, compared with
//   the pitch of the note being played, so its delay counts as error. It shows the center of
//   vibrato on purpose, so the note's pitch is the target, not the frame's.
function evaluate(
  samples: Float32Array,
  sampleRate: number,
  frames: number[][],
  notes: number[][],
) {
  const readings = replay(samples, sampleRate);
  const span = Math.round((settings.smoothingMs / 1000) * frameRate);
  const half = windowSize / 2 / sampleRate;
  const last = readings.length - 1;
  const raw = new Score();
  const display = new Score();

  for (const [time, hz] of frames) {
    const centered = Math.min(Math.round((time + half) * frameRate), last);
    const frame = Math.min(Math.floor(time * frameRate), last);
    const recent = readings
      .slice(Math.max(0, frame - span + 1), frame + 1)
      .filter((reading) => reading !== undefined);
    const note = notes.find(
      ([onset, , duration]) => time >= onset && time < onset + duration,
    );

    raw.count(hz, readings[centered]?.hz);
    display.count(
      note?.[1] ?? 0,
      recent.length ? steady(recent.map((reading) => reading.hz)) : undefined,
    );
  }

  return { raw, display };
}

class Score {
  voiced = 0;
  unvoiced = 0;
  reported = 0;
  falseAlarms = 0;
  correct = 0;
  octaves = 0;
  errors: number[] = [];

  // `hz` is 0 where nothing was played; `estimate` is undefined where nothing was read.
  count(hz: number, estimate?: number) {
    if (hz === 0) {
      this.unvoiced++;
      if (estimate !== undefined) this.falseAlarms++;
      return;
    }

    this.voiced++;
    if (estimate === undefined) return;

    const cents = 1200 * Math.log2(estimate / hz);
    const octave = Math.round(cents / 1200);

    this.reported++;

    if (Math.abs(cents) < 50) {
      this.correct++;
      this.errors.push(Math.abs(cents));
    } else if (octave !== 0 && Math.abs(cents - octave * 1200) < 50) {
      this.octaves++;
    }
  }

  add(other: Score) {
    this.voiced += other.voiced;
    this.unvoiced += other.unvoiced;
    this.reported += other.reported;
    this.falseAlarms += other.falseAlarms;
    this.correct += other.correct;
    this.octaves += other.octaves;
    this.errors.push(...other.errors);
  }

  summary() {
    const errors = this.errors.toSorted((a, b) => a - b);

    return {
      "heard (%)": percent(this.reported, this.voiced),
      "false alarm (%)": percent(this.falseAlarms, this.unvoiced),
      "correct (%)": percent(this.correct, this.voiced),
      "octave (%)": percent(this.octaves, this.voiced),
      "median error (cents)": errors[Math.floor(errors.length / 2)]?.toFixed(1),
      "90% error (cents)": errors[Math.floor(errors.length * 0.9)]?.toFixed(1),
    };
  }
}

function percent(part: number, whole: number) {
  return whole ? ((part / whole) * 100).toFixed(1) : "-";
}

void main(process.argv[2]);
