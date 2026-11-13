// Measures pitch detection against the string tracks of the URMP dataset, whose pitch
// annotations were corrected by hand. Usage: pnpm evaluate:pitch <URMP Dataset folder>
import { readFile } from "node:fs/promises";
import { windowSize } from "@/lib/audio/pitch";
import { tracks } from "../urmp/dataset";
import { decode, frameRate, parse, replay } from "./recording";

async function main(root?: string) {
  if (!root) {
    throw new Error("Usage: pnpm evaluate:pitch <URMP Dataset folder>");
  }

  const totals = new Map<string, Score>();

  for (const track of await tracks(root)) {
    const { samples, sampleRate } = decode(await readFile(track.audio));
    const frames = parse(await readFile(track.frames, "utf8"));
    const result = evaluate(samples, sampleRate, frames);
    const total = totals.get(track.instrument) ?? new Score();

    total.add(result);
    totals.set(track.instrument, total);
    console.log(`${track.name}: ${percent(result.correct, result.voiced)} correct`);
  }

  console.table(
    [...totals].map(([instrument, total]) => ({ instrument, ...total.summary() })),
  );
}

// The browser reads the newest window once per animation frame. Each annotated frame is
// compared with the reading whose window is centered on it.
function evaluate(samples: Float32Array, sampleRate: number, frames: number[][]) {
  const readings = replay(samples, sampleRate);
  const half = windowSize / 2 / sampleRate;
  const last = readings.length - 1;
  const result = new Score();

  for (const [time, hz] of frames) {
    const centered = Math.min(Math.round((time + half) * frameRate), last);

    result.count(hz, readings[centered]?.hz);
  }

  return result;
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
